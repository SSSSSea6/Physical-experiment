import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, changePassword } from "../api";

export default function ResetPasswordPage() {
  const nav = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleReset = async () => {
    const sid = studentId.trim();
    if (sid.length < 5 || sid.length > 30) {
      setError("账号长度需在 5~30 个字符");
      return;
    }
    if (oldPassword.length < 6 || oldPassword.length > 20) {
      setError("旧密码长度需在 6~20 个字符");
      return;
    }
    if (password.length < 6 || password.length > 20) {
      setError("新密码长度需在 6~20 个字符");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的新密码不一致");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await changePassword({
        student_id: sid,
        old_password: oldPassword,
        new_password: password
      });
      nav("/dashboard", { replace: true });
    } catch (e) {
      if (e instanceof ApiError) setError(`${e.message}（${e.code}）`);
      else setError("修改失败，请重试");
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
        <div style={{ fontWeight: 700, fontSize: 18 }}>修改密码</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          输入账号、旧密码与新密码完成修改。
        </div>

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
            旧密码
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label>
            新密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6~20 个字符"
              autoComplete="new-password"
            />
          </label>
          <label>
            确认新密码
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>

          {error ? <div className="notice">{error}</div> : null}

          <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
            <button disabled={busy} onClick={handleReset}>
              {busy ? "提交中..." : "更新密码并登录"}
            </button>
            <div className="row" style={{ gap: 10 }}>
              <Link to="/login">返回登录</Link>
              <Link to="/register">去注册</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
