import { z } from "zod";
import type { Env } from "./env";
import { ApiError, asApiError } from "./lib/errors";

type Stored = { studentId: string };

export class LedgerDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method !== "POST") throw new ApiError(405, "method_not_allowed", "仅支持 POST");

      const url = new URL(request.url);
      const path = url.pathname;
      const body = await request.json();

      const base = z
        .object({
          student_id: z.string().min(1).max(64)
        })
        .passthrough()
        .parse(body);

      const studentId = base.student_id;
      await this.ensureStudent(studentId);

      if (path === "/consume") return await this.handleConsume(studentId, body);
      if (path === "/refund") return await this.handleRefund(studentId, body);
      if (path === "/redeem") return await this.handleRedeem(studentId, body);

      throw new ApiError(404, "not_found", "未知操作");
    } catch (err) {
      const apiErr = asApiError(err);
      return Response.json({ error: apiErr.code, message: apiErr.message }, { status: apiErr.status });
    }
  }

  private async ensureStudent(studentId: string): Promise<void> {
    const stored = (await this.state.storage.get<Stored>("student")) ?? null;
    if (!stored) {
      await this.state.storage.put("student", { studentId });
      return;
    }
    if (stored.studentId !== studentId) throw new ApiError(403, "forbidden", "student_id 不匹配");
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private async getBalance(studentId: string): Promise<number> {
    const row = (await this.env.DB.prepare("SELECT balance FROM users WHERE student_id=?")
      .bind(studentId)
      .first()) as { balance: number } | null;
    if (!row) throw new ApiError(404, "not_found", "用户不存在");
    return row.balance;
  }

  private async insertLog(studentId: string, action: string, delta: number, meta: unknown) {
    const now = this.nowIso();
    await this.env.DB.prepare(
      "INSERT INTO usage_logs(id, student_id, action, delta, created_at, meta) VALUES(?,?,?,?,?,?)"
    )
      .bind(crypto.randomUUID(), studentId, action, delta, now, meta ? JSON.stringify(meta) : null)
      .run();
  }

  private async handleConsume(studentId: string, body: any): Promise<Response> {
    const parsed = z
      .object({
        amount: z.number().int().min(1).max(100),
        meta: z.unknown().optional()
      })
      .parse(body);

    const now = this.nowIso();
    const res = await this.env.DB.prepare(
      "UPDATE users SET balance = balance - ?, updated_at=? WHERE student_id=? AND balance >= ?"
    )
      .bind(parsed.amount, now, studentId, parsed.amount)
      .run();

    if ((res.meta?.changes ?? 0) === 0) {
      // Distinguish user missing vs insufficient.
      await this.getBalance(studentId);
      throw new ApiError(402, "insufficient_balance", "余额不足");
    }

    try {
      await this.insertLog(studentId, "extract", -parsed.amount, parsed.meta ?? null);
    } catch (err) {
      // Best effort rollback if logging fails.
      await this.env.DB.prepare("UPDATE users SET balance = balance + ?, updated_at=? WHERE student_id=?")
        .bind(parsed.amount, this.nowIso(), studentId)
        .run();
      throw err;
    }

    const balance = await this.getBalance(studentId);
    return Response.json({ balance });
  }

  private async handleRefund(studentId: string, body: any): Promise<Response> {
    const parsed = z
      .object({
        amount: z.number().int().min(1).max(100),
        meta: z.unknown().optional()
      })
      .parse(body);

    await this.getBalance(studentId);

    const now = this.nowIso();
    await this.env.DB.prepare("UPDATE users SET balance = balance + ?, updated_at=? WHERE student_id=?")
      .bind(parsed.amount, now, studentId)
      .run();

    await this.insertLog(studentId, "refund", parsed.amount, parsed.meta ?? null);

    const balance = await this.getBalance(studentId);
    return Response.json({ balance });
  }

  private async handleRedeem(studentId: string, body: any): Promise<Response> {
    const parsed = z
      .object({
        code: z.string().min(6).max(64),
        meta: z.unknown().optional()
      })
      .parse(body);

    const codeRow = (await this.env.DB.prepare("SELECT amount, status FROM redeem_codes WHERE code=?")
      .bind(parsed.code)
      .first()) as { amount: number; status: string } | null;
    if (!codeRow) throw new ApiError(404, "code_not_found", "兑换码不存在");
    if (codeRow.status !== "unused") throw new ApiError(409, "code_used", "兑换码已使用");

    const now = this.nowIso();
    const upd = await this.env.DB.prepare(
      "UPDATE redeem_codes SET status='used', used_by=?, used_at=? WHERE code=? AND status='unused'"
    )
      .bind(studentId, now, parsed.code)
      .run();
    if ((upd.meta?.changes ?? 0) === 0) throw new ApiError(409, "code_used", "兑换码已使用");

    const userUpd = await this.env.DB.prepare("UPDATE users SET balance = balance + ?, updated_at=? WHERE student_id=?")
      .bind(codeRow.amount, now, studentId)
      .run();

    if ((userUpd.meta?.changes ?? 0) === 0) {
      // Compensate: restore code.
      await this.env.DB.prepare(
        "UPDATE redeem_codes SET status='unused', used_by=NULL, used_at=NULL WHERE code=? AND used_by=?"
      )
        .bind(parsed.code, studentId)
        .run();
      throw new ApiError(404, "not_found", "用户不存在");
    }

    await this.insertLog(studentId, "redeem", codeRow.amount, { code: parsed.code, ...(parsed.meta ? { meta: parsed.meta } : {}) });

    const balance = await this.getBalance(studentId);
    return Response.json({ balance, amount: codeRow.amount });
  }
}
