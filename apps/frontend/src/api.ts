import type { HistoryItem, Me } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8787";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return new ApiError(res.status, data?.error ?? "error", data?.message ?? text);
  } catch {
    return new ApiError(res.status, "error", text || `HTTP ${res.status}`);
  }
}

export async function apiFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export async function me(): Promise<Me> {
  return apiFetchJson("/v1/me", { method: "GET" });
}

export async function login(params: { student_id: string; password: string }): Promise<Me> {
  return apiFetchJson("/v1/auth/login", { method: "POST", body: JSON.stringify(params) });
}

export async function logout(): Promise<void> {
  await apiFetchJson("/v1/auth/logout", { method: "POST", body: JSON.stringify({}) });
}

export async function redeem(params: { code: string }): Promise<{ balance: number; amount: number }> {
  return apiFetchJson("/v1/redeem", { method: "POST", body: JSON.stringify(params) });
}

export async function history(): Promise<{ items: HistoryItem[] }> {
  return apiFetchJson("/v1/history", { method: "GET" });
}

export async function getArtifact(id: string): Promise<{ id: string; exp_id: string; payload: any }> {
  return apiFetchJson(`/v1/artifact/${encodeURIComponent(id)}`, { method: "GET" });
}

export async function getUploadUrl(params: { exp_id: string; content_type?: string }): Promise<{
  upload_url: string;
  image_key: string;
}> {
  return apiFetchJson("/v1/upload-url", { method: "POST", body: JSON.stringify(params) });
}

export async function putUpload(uploadUrl: string, blob: Blob): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": blob.type || "application/octet-stream"
    },
    body: blob
  });
  if (!res.ok) throw await parseError(res);
}

export async function extract(params: {
  exp_id: string;
  image_key: string;
}): Promise<{ artifact_id: string; payload: any; balance: number }> {
  return apiFetchJson("/v1/extract", { method: "POST", body: JSON.stringify(params) });
}
