import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, login } from "../api";

export default function LoginPage() {
  const nav = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">实验图表生成器</div>
        <span className="pill">lab.nuaaguide.online</span>
      </div>

      <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>登录</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          使用学号 + 密码登录；会话 Cookie 有效期 24h
        </div>

        <div className="grid" style={{ marginTop: 14 }}>
          <label>
            学号
            <input value={studentId} onChange={(e) => setStudentId(e.target.value)} autoComplete="username" />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          {error ? <div className="notice">{error}</div> : null}

          <button
            disabled={busy}
            onClick={async () => {
              setError(null);
              if (!studentId.trim() || !password) {
                setError("请输入学号与密码");
                return;
              }
              setBusy(true);
              try {
                await login({ student_id: studentId.trim(), password });
                nav("/dashboard", { replace: true });
              } catch (e) {
                if (e instanceof ApiError) setError(`${e.message}（${e.code}）`);
                else setError("登录失败");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "登录中…" : "登录"}
          </button>
        </div>
      </div>
    </div>
  );
}
