import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, params: Record<string, any>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

let turnstileLoader: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (turnstileLoader) return turnstileLoader;
  turnstileLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile="1"]');
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile 脚本加载失败"));
    document.head.appendChild(script);
  });
  return turnstileLoader;
}

export default function Turnstile(props: {
  siteKey?: string;
  onToken: (token: string) => void;
  resetSignal?: number;
}) {
  const siteKey = props.siteKey ?? (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!siteKey) return;
    loadTurnstile()
      .then(() => {
        if (cancelled) return;
        if (!containerRef.current) return;
        if (!window.turnstile) {
          setError("Turnstile 未就绪");
          return;
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "dark",
          callback: (token: string) => props.onToken(token),
          "expired-callback": () => props.onToken(""),
          "error-callback": () => props.onToken("")
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Turnstile 加载失败"));
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (!widgetIdRef.current || !window.turnstile) return;
    window.turnstile.reset(widgetIdRef.current);
  }, [props.resetSignal]);

  if (!siteKey) {
    return <div className="notice">未配置 Turnstile Site Key（本地开发可忽略）</div>;
  }

  return (
    <div>
      <div ref={containerRef} />
      {error ? <div className="notice">{error}</div> : null}
    </div>
  );
}

