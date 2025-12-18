import { z } from "zod";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function asApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof z.ZodError) {
    const msg = err.issues?.[0]?.message ?? "请求参数错误";
    return new ApiError(400, "bad_request", msg);
  }
  if (err instanceof Error) return new ApiError(500, "internal_error", err.message || "服务器错误");
  return new ApiError(500, "internal_error", "服务器错误");
}

