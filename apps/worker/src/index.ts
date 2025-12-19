import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "./env";
import { LedgerDO } from "./ledger-do";
import hallSchema from "../../../experiments/hall/schema.json";
import { hallPrompt } from "../../../experiments/hall/prompt";
import { base64FromArrayBuffer, base64UrlFromArrayBuffer } from "./lib/base64";
import { callGeminiJson } from "./lib/gemini";
import { checkRateLimit } from "./lib/rateLimit";
import { ApiError, asApiError } from "./lib/errors";

type Variables = { studentId: string };
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

function nowIso(): string {
  return new Date().toISOString();
}

function addDaysIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function insertUsageLog(env: Env, studentId: string, action: string, delta = 0, meta?: unknown) {
  await env.DB.prepare("INSERT INTO usage_logs(id, student_id, action, delta, created_at, meta) VALUES(?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), studentId, action, delta, nowIso(), meta ? JSON.stringify(meta) : null)
    .run();
}

function getIp(c: any): string | null {
  const h = c.req.header.bind(c.req);
  return h("CF-Connecting-IP") ?? h("X-Forwarded-For") ?? null;
}

function originsFromEnv(env: Env): string[] {
  return (env.FRONTEND_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function cookieSecure(c: any): boolean {
  try {
    const url = new URL(c.req.url);
    return url.protocol === "https:";
  } catch {
    return true;
  }
}

function jsonOk(c: any, data: unknown, init?: ResponseInit): Response {
  return c.json(data, init);
}

function jsonError(c: any, err: unknown): Response {
  const apiErr = asApiError(err);
  return c.json(
    { error: apiErr.code, message: apiErr.message },
    apiErr.status
  );
}

async function studentIdFromSession(c: any): Promise<string | null> {
  const sessionId = getCookie(c, "lab_session");
  if (!sessionId) return null;
  const studentId = await c.env.KV.get(`session:${sessionId}`);
  return studentId ?? null;
}

async function requireAuth(c: any, next: any) {
  const studentId = await studentIdFromSession(c);
  if (!studentId) return jsonError(c, new ApiError(401, "unauthorized", "未登录或会话已过期"));
  c.set("studentId", studentId);
  await next();
}

async function doLedgerCall<T>(env: Env, studentId: string, path: string, body: any): Promise<T> {
  const id = env.LEDGER.idFromName(studentId);
  const stub = env.LEDGER.get(id);
  const res = await stub.fetch(`https://ledger${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_id: studentId, ...body })
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      throw new ApiError(
        res.status,
        typeof parsed?.error === "string" ? parsed.error : "ledger_failed",
        typeof parsed?.message === "string" ? parsed.message : text
      );
    } catch {
      throw new ApiError(res.status, "ledger_failed", text);
    }
  }
  return (await res.json()) as T;
}

async function ledgerRefund(env: Env, studentId: string, amount: number, meta: any) {
  return doLedgerCall(env, studentId, "/refund", { amount, meta });
}

async function ledgerRedeem(env: Env, studentId: string, code: string, meta: any) {
  return doLedgerCall(env, studentId, "/redeem", { code, meta });
}

function buildSkeleton(schema: any) {
  const meta: Record<string, { value: string | number | null; confidence: number }> = {};
  for (const f of schema.meta_fields ?? []) {
    meta[f.id] = { value: null, confidence: 0 };
  }

  const tables: Record<string, { rows: Array<Record<string, { value: string | number | null; confidence: number }>> }> =
    {};
  for (const t of schema.tables ?? []) {
    const rows = [];
    for (let i = 0; i < (t.rows ?? 0); i++) {
      const row: Record<string, { value: string | number | null; confidence: number }> = {};
      for (const col of t.columns ?? []) {
        row[col.id] = { value: null, confidence: 0 };
      }
      rows.push(row);
    }
    tables[t.id] = { rows };
  }

  return {
    exp_id: schema.exp_id,
    schema_version: schema.version,
    meta,
    tables,
    uncertain_fields: []
  };
}

function normalizeAgainstSkeleton(skeleton: any, candidate: any) {
  const out = structuredClone(skeleton);

  if (candidate && typeof candidate === "object") {
    out.exp_id = skeleton.exp_id;
    out.schema_version = skeleton.schema_version;

    for (const [k, v] of Object.entries(skeleton.meta ?? {})) {
      const cell = candidate.meta?.[k];
      const value = cell?.value ?? null;
      const confidence = typeof cell?.confidence === "number" ? cell.confidence : 0;
      out.meta[k] = {
        value,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0
      };
    }

    for (const [tableId, tableDef] of Object.entries(skeleton.tables ?? {}) as Array<[string, any]>) {
      const rows = tableDef.rows as any[];
      const candRows = candidate.tables?.[tableId]?.rows;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const candRow = Array.isArray(candRows) ? candRows[i] : null;
        for (const colId of Object.keys(row)) {
          const cell = candRow?.[colId];
          const value = cell?.value ?? null;
          const confidence = typeof cell?.confidence === "number" ? cell.confidence : 0;
          out.tables[tableId].rows[i][colId] = {
            value,
            confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0
          };
        }
      }
    }

    if (Array.isArray(candidate.uncertain_fields)) {
      out.uncertain_fields = candidate.uncertain_fields.filter((x: any) => typeof x === "string");
    }
  }

  return out;
}

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allow = originsFromEnv(c.env);
      if (!origin) return allow[0] ?? "*";
      return allow.includes(origin) ? origin : null;
    },
    allowHeaders: ["Content-Type", "X-Admin-Secret", "X-Cron-Secret"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 86400
  })
);

app.get("/health", (c) => c.json({ ok: true }));

app.post("/v1/auth/register", async (c) => {
  try {
    const adminSecret = c.req.header("X-Admin-Secret");
    if (!c.env.ADMIN_SECRET || adminSecret !== c.env.ADMIN_SECRET) {
      throw new ApiError(403, "forbidden", "缺少管理员密钥");
    }

    const body = await c.req.json();
    const parsed = z
      .object({
        student_id: z.string().min(1).max(64),
        password: z.string().min(6).max(128),
        balance: z.number().int().min(0).max(1_000_000).optional()
      })
      .parse(body);

    const existing = await c.env.DB.prepare("SELECT student_id FROM users WHERE student_id=?")
      .bind(parsed.student_id)
      .first();
    if (existing) throw new ApiError(409, "user_exists", "用户已存在");

    const hash = bcrypt.hashSync(parsed.password, 10);
    const now = nowIso();
    await c.env.DB.prepare(
      "INSERT INTO users(student_id, password_hash, balance, failed_login, locked_until, created_at, updated_at) VALUES(?,?,?,?,?,?,?)"
    )
      .bind(parsed.student_id, hash, parsed.balance ?? 0, 0, null, now, now)
      .run();

    return jsonOk(c, { ok: true });
  } catch (err) {
    return jsonError(c, err);
  }
});

app.post("/v1/auth/login", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = z
      .object({
        student_id: z.string().min(1).max(64),
        password: z.string().min(1).max(128)
      })
      .parse(body);

    const ip = getIp(c);
    const rlKey = `rl:login:${parsed.student_id}:${ip ?? "noip"}:${Math.floor(Date.now() / 60_000)}`;
    const allowed = await checkRateLimit(c.env.KV, rlKey, 5, 120);
    if (!allowed) throw new ApiError(429, "rate_limited", "请求过于频繁，请稍后再试");

    const user = (await c.env.DB.prepare(
      "SELECT student_id, password_hash, balance, failed_login, locked_until FROM users WHERE student_id=?"
    )
      .bind(parsed.student_id)
      .first()) as
      | {
          student_id: string;
          password_hash: string;
          balance: number;
          failed_login: number;
          locked_until: string | null;
        }
      | null;

    if (!user) throw new ApiError(401, "invalid_credentials", "学号或密码错误");

    const now = new Date();
    if (user.locked_until) {
      const lockedUntilMs = Date.parse(user.locked_until);
      if (Number.isFinite(lockedUntilMs) && lockedUntilMs > now.getTime()) {
        throw new ApiError(423, "locked", "密码错误次数过多，请稍后再试");
      }
    }

    const passOk = bcrypt.compareSync(parsed.password, user.password_hash);
    if (!passOk) {
      const failed = (user.failed_login ?? 0) + 1;
      const lockAfter = 5;
      const lockMinutes = 10;
      const lockedUntil =
        failed >= lockAfter ? new Date(now.getTime() + lockMinutes * 60_000).toISOString() : null;

      await c.env.DB.prepare("UPDATE users SET failed_login=?, locked_until=?, updated_at=? WHERE student_id=?")
        .bind(failed, lockedUntil, nowIso(), parsed.student_id)
        .run();

      throw new ApiError(401, "invalid_credentials", "学号或密码错误");
    }

    await c.env.DB.prepare("UPDATE users SET failed_login=0, locked_until=NULL, updated_at=? WHERE student_id=?")
      .bind(nowIso(), parsed.student_id)
      .run();

    const sessionBytes = new Uint8Array(32);
    crypto.getRandomValues(sessionBytes);
    const sessionId = base64UrlFromArrayBuffer(sessionBytes.buffer);

    await c.env.KV.put(`session:${sessionId}`, parsed.student_id, { expirationTtl: 24 * 60 * 60 });

    setCookie(c, "lab_session", sessionId, {
      httpOnly: true,
      secure: cookieSecure(c),
      sameSite: "Lax",
      path: "/",
      domain: c.env.COOKIE_DOMAIN
    });

    await insertUsageLog(c.env, parsed.student_id, "login", 0, { ip });

    return jsonOk(c, { student_id: parsed.student_id, balance: user.balance });
  } catch (err) {
    return jsonError(c, err);
  }
});

app.post("/v1/auth/logout", requireAuth, async (c) => {
  try {
    const studentId = c.get("studentId");
    const sessionId = getCookie(c, "lab_session");
    if (sessionId) await c.env.KV.delete(`session:${sessionId}`);

    deleteCookie(c, "lab_session", {
      path: "/",
      domain: c.env.COOKIE_DOMAIN
    });

    await insertUsageLog(c.env, studentId, "logout", 0);
    return jsonOk(c, { ok: true });
  } catch (err) {
    return jsonError(c, err);
  }
});

app.get("/v1/me", requireAuth, async (c) => {
  try {
    const studentId = c.get("studentId");
    const row = (await c.env.DB.prepare("SELECT balance FROM users WHERE student_id=?")
      .bind(studentId)
      .first()) as { balance: number } | null;
    if (!row) throw new ApiError(404, "not_found", "用户不存在");
    return jsonOk(c, { student_id: studentId, balance: row.balance });
  } catch (err) {
    return jsonError(c, err);
  }
});

app.post("/v1/redeem", requireAuth, async (c) => {
  try {
    const studentId = c.get("studentId");
    const body = await c.req.json();
    const parsed = z
      .object({
        code: z.string().min(6).max(64)
      })
      .parse(body);

    const ip = getIp(c);
    const rlKey = `rl:redeem:${studentId}:${ip ?? "noip"}:${Math.floor(Date.now() / 60_000)}`;
    const allowed = await checkRateLimit(c.env.KV, rlKey, 5, 120);
    if (!allowed) throw new ApiError(429, "rate_limited", "请求过于频繁，请稍后再试");

    const result = await ledgerRedeem(c.env, studentId, parsed.code, { ip });
    return jsonOk(c, result);
  } catch (err) {
    return jsonError(c, err);
  }
});

app.post("/v1/upload-url", requireAuth, async (c) => {
  try {
    const studentId = c.get("studentId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = z
      .object({
        content_type: z.string().optional(),
        exp_id: z.string().optional()
      })
      .default({})
      .parse(body);

    const uploadToken = crypto.randomUUID();
    const imageKey = `u/${encodeURIComponent(studentId)}/${crypto.randomUUID()}`;

    await c.env.KV.put(
      `upload:${uploadToken}`,
      JSON.stringify({
        student_id: studentId,
        image_key: imageKey,
        content_type: parsed.content_type ?? "application/octet-stream",
        exp_id: parsed.exp_id ?? null,
        created_at: nowIso()
      }),
      { expirationTtl: 10 * 60 }
    );

    const origin = new URL(c.req.url).origin;
    return jsonOk(c, { upload_url: `${origin}/v1/upload/${uploadToken}`, image_key: imageKey });
  } catch (err) {
    return jsonError(c, err);
  }
});

app.put("/v1/upload/:token", async (c) => {
  try {
    const token = c.req.param("token");
    const raw = await c.env.KV.get(`upload:${token}`);
    if (!raw) throw new ApiError(400, "invalid_upload_token", "上传令牌无效或已过期");

    const meta = JSON.parse(raw) as { student_id: string; image_key: string; content_type: string };
    const studentId = await studentIdFromSession(c);
    if (!studentId || studentId !== meta.student_id) {
      throw new ApiError(401, "unauthorized", "未登录或无权限");
    }

    const body = await c.req.arrayBuffer();
    if (body.byteLength <= 0) throw new ApiError(400, "empty_body", "空文件");
    if (body.byteLength > 5 * 1024 * 1024) throw new ApiError(413, "too_large", "图片过大（>5MB）");

    await c.env.BUCKET.put(meta.image_key, body, {
      httpMetadata: { contentType: c.req.header("Content-Type") ?? meta.content_type }
    });

    await c.env.KV.delete(`upload:${token}`);
    await insertUsageLog(c.env, studentId, "upload", 0, { image_key: meta.image_key });
    return jsonOk(c, { ok: true, image_key: meta.image_key });
  } catch (err) {
    return jsonError(c, err);
  }
});

app.post("/v1/extract", requireAuth, async (c) => {
  let consumed = false;
  try {
    const studentId = c.get("studentId");
    const body = await c.req.json();
    const parsed = z
      .object({
        exp_id: z.string().min(1),
        image_key: z.string().min(1)
      })
      .parse(body);

    const ip = getIp(c);
    const rlKey = `rl:extract:${studentId}:${ip ?? "noip"}:${Math.floor(Date.now() / 60_000)}`;
    const allowed = await checkRateLimit(c.env.KV, rlKey, 5, 120);
    if (!allowed) throw new ApiError(429, "rate_limited", "请求过于频繁，请稍后再试");

    if (!parsed.image_key.startsWith(`u/${encodeURIComponent(studentId)}/`)) {
      throw new ApiError(403, "forbidden", "image_key 不属于当前用户");
    }

    const exp = parsed.exp_id === "hall" ? { schema: hallSchema as any, prompt: hallPrompt } : null;
    if (!exp) throw new ApiError(400, "unknown_exp", "未知实验模板");

    await doLedgerCall<{ balance: number }>(c.env, studentId, "/consume", {
      amount: 1,
      meta: { ip, exp_id: parsed.exp_id, image_key: parsed.image_key }
    });
    consumed = true;

    const obj = await c.env.BUCKET.get(parsed.image_key);
    if (!obj) throw new ApiError(400, "image_not_found", "找不到图片（请重新上传）");
    const buf = await obj.arrayBuffer();
    const mimeType = obj.httpMetadata?.contentType ?? "image/png";

    const skeleton = buildSkeleton(exp.schema);
    const prompt = `${exp.prompt}\n\n请严格输出以下 JSON skeleton（缺失填 null，不要加字段）：\n${JSON.stringify(
      skeleton,
      null,
      2
    )}`;

    const extracted = await callGeminiJson({
      apiKey: c.env.GEMINI_API_KEY,
      model: "gemini-3.0-flash",
      prompt,
      image: {
        mimeType,
        base64: base64FromArrayBuffer(buf)
      }
    });

    const payload = normalizeAgainstSkeleton(skeleton, extracted);

    const artifactId = crypto.randomUUID();
    const createdAt = nowIso();
    const expiresAt = addDaysIso(3);
    await c.env.DB.prepare(
      "INSERT INTO artifacts(id, student_id, exp_id, payload, image_key, plot_key, created_at, expires_at) VALUES(?,?,?,?,?,?,?,?)"
    )
      .bind(
        artifactId,
        studentId,
        parsed.exp_id,
        JSON.stringify(payload),
        parsed.image_key,
        null,
        createdAt,
        expiresAt
      )
      .run();

    const me = (await c.env.DB.prepare("SELECT balance FROM users WHERE student_id=?")
      .bind(studentId)
      .first()) as { balance: number } | null;

    return jsonOk(c, { artifact_id: artifactId, payload, balance: me?.balance ?? 0 });
  } catch (err) {
    const apiErr = asApiError(err);
    if (consumed && apiErr.code !== "insufficient_balance") {
      try {
        const studentId = (c as any).get("studentId") as string | undefined;
        if (studentId) await ledgerRefund(c.env, studentId, 1, { reason: "extract_failed" });
      } catch {
        // Best effort.
      }
    }
    return jsonError(c, err);
  }
});

app.get("/v1/history", requireAuth, async (c) => {
  try {
    const studentId = c.get("studentId");
    const now = nowIso();
    const result = await c.env.DB.prepare(
      "SELECT id, exp_id, created_at, expires_at, image_key, plot_key FROM artifacts WHERE student_id=? AND expires_at > ? ORDER BY created_at DESC LIMIT 50"
    )
      .bind(studentId, now)
      .all();

    const items =
      result.results?.map((r: any) => ({
        id: r.id,
        exp_id: r.exp_id,
        created_at: r.created_at,
        expires_at: r.expires_at,
        has_image: !!r.image_key,
        has_plot: !!r.plot_key
      })) ?? [];

    return jsonOk(c, { items });
  } catch (err) {
    return jsonError(c, err);
  }
});

app.get("/v1/artifact/:id", requireAuth, async (c) => {
  try {
    const studentId = c.get("studentId");
    const id = c.req.param("id");
    const row = (await c.env.DB.prepare(
      "SELECT id, exp_id, payload, image_key, plot_key, created_at, expires_at FROM artifacts WHERE id=? AND student_id=?"
    )
      .bind(id, studentId)
      .first()) as any | null;
    if (!row) throw new ApiError(404, "not_found", "历史记录不存在");

    if (Date.parse(row.expires_at) <= Date.now()) throw new ApiError(410, "expired", "记录已过期");

    return jsonOk(c, {
      id: row.id,
      exp_id: row.exp_id,
      payload: JSON.parse(row.payload),
      image_key: row.image_key,
      plot_key: row.plot_key,
      created_at: row.created_at,
      expires_at: row.expires_at
    });
  } catch (err) {
    return jsonError(c, err);
  }
});

app.get("/v1/artifact/:id/image", requireAuth, async (c) => {
  try {
    const studentId = c.get("studentId");
    const id = c.req.param("id");
    const row = (await c.env.DB.prepare("SELECT image_key, expires_at FROM artifacts WHERE id=? AND student_id=?")
      .bind(id, studentId)
      .first()) as { image_key: string | null; expires_at: string } | null;
    if (!row || !row.image_key) throw new ApiError(404, "not_found", "图片不存在");
    if (Date.parse(row.expires_at) <= Date.now()) throw new ApiError(410, "expired", "记录已过期");

    const obj = await c.env.BUCKET.get(row.image_key);
    if (!obj) throw new ApiError(404, "not_found", "图片对象不存在");

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("Cache-Control", "private, max-age=60");
    return new Response(obj.body, { headers });
  } catch (err) {
    return jsonError(c, err);
  }
});

app.post("/v1/cron/cleanup", async (c) => {
  try {
    if (!c.env.CRON_SECRET) throw new ApiError(404, "not_found", "未启用");
    const secret = c.req.header("X-Cron-Secret");
    if (secret !== c.env.CRON_SECRET) throw new ApiError(403, "forbidden", "无权限");

    const deleted = await cleanupExpired(c.env);
    return jsonOk(c, { ok: true, deleted });
  } catch (err) {
    return jsonError(c, err);
  }
});

async function cleanupExpired(env: Env): Promise<number> {
  let total = 0;
  const now = nowIso();

  while (true) {
    const batch = await env.DB.prepare(
      "SELECT id, image_key, plot_key FROM artifacts WHERE expires_at <= ? LIMIT 100"
    )
      .bind(now)
      .all();

    const rows = (batch.results ?? []) as Array<{ id: string; image_key: string | null; plot_key: string | null }>;
    if (rows.length === 0) break;

    for (const row of rows) {
      if (row.image_key) await env.BUCKET.delete(row.image_key);
      if (row.plot_key) await env.BUCKET.delete(row.plot_key);
      await env.DB.prepare("DELETE FROM artifacts WHERE id=?").bind(row.id).run();
      total++;
    }
  }

  return total;
}

export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(cleanupExpired(env));
  }
};

export { LedgerDO };
