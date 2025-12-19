import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, registerWithPassword } from "../api";

export default function RegisterPage() {
  const nav = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleRegister = async () => {
    const sid = studentId.trim();
    if (sid.length < 5 || sid.length > 30) {
      setError("账号长度需在 5~30 个字符");
      return;
    }
    if (password.length < 6 || password.length > 20) {
      setError("密码长度需在 6~20 个字符");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await registerWithPassword({ student_id: sid, password });
      nav("/dashboard", { replace: true });
    } catch (e) {
      if (e instanceof ApiError) setError(`${e.message}（${e.code}）`);
      else setError("注册失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">实验表格生成器</div>
        <span className="pill">lab.nuaaguide.online</span>
      </div>

      <div className="card" style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>账号注册</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          直接填写账号和密码完成注册，新用户不会自动赠送次数。
        </div>
        <div className="notice" style={{ marginTop: 8 }}>忘记密码不可找回，请记住自己的密码！</div>

        <div className="grid" style={{ marginTop: 14, gap: 12 }}>
          <label>
            账号
            <input
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="请输入账号"
              autoComplete="username"
            />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6~20 个字符"
              autoComplete="new-password"
            />
          </label>
          <label>
            确认密码
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>

          {error ? <div className="notice">{error}</div> : null}

          <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
            <button disabled={busy} onClick={handleRegister}>
              {busy ? "提交中..." : "完成注册并登录"}
            </button>
            <div className="row" style={{ gap: 10 }}>
              <Link to="/login">已有账号？去登录</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
