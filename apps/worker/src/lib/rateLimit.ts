export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  expirationTtl: number
): Promise<boolean> {
  const raw = await kv.get(key);
  const current = raw ? Number(raw) : 0;
  if (Number.isFinite(current) && current >= limit) return false;
  await kv.put(key, String((Number.isFinite(current) ? current : 0) + 1), { expirationTtl });
  return true;
}

