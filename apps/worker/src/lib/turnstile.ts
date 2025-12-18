import { ApiError } from "./errors";

export async function verifyTurnstile(secret: string, token: string, ip: string | null): Promise<boolean> {
  if (!secret) throw new ApiError(500, "missing_turnstile_secret", "缺少 TURNSTILE_SECRET");

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  if (!res.ok) return false;
  const data = (await res.json()) as any;
  return !!data?.success;
}

