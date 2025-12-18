export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  BUCKET: R2Bucket;
  LEDGER: DurableObjectNamespace;

  FRONTEND_ORIGIN: string;
  COOKIE_DOMAIN?: string;
  CRON_SECRET?: string;
  ADMIN_SECRET?: string;

  TURNSTILE_SECRET: string;
  GEMINI_API_KEY: string;
}

