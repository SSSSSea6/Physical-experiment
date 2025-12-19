import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, history, logout, me, redeem } from "../api";
import { experiments } from "../experiments";
import type { HistoryItem, Me } from "../types";

export default function DashboardPage() {
  const nav = useNavigate();
  const [profile, setProfile] = useState<Me | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expList = useMemo(() => Object.values(experiments), []);

  useEffect(() => {
    (async () => {
      try {
        const p = await me();
        setProfile(p);
        const h = await history();
        setItems(h.items);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) nav("/login", { replace: true });
      }
    })();
  }, [nav]);

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">仪表盘</div>
        <div className="row">
          {profile ? (
            <>
              <span className="pill">学号：{profile.student_id}</span>
              <span className="pill">余额：{profile.balance}</span>
            </>
          ) : (
            <span className="pill">未登录</span>
          )}
          <button
            className="danger"
            onClick={async () => {
              await logout().catch(() => {});
              nav("/login", { replace: true });
            }}
          >
            退出登录
          </button>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div style={{ fontWeight: 700 }}>兑换码充值</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            每次识别默认消耗 1 次；兑换码由爱发电发放
          </div>
          <div className="grid" style={{ marginTop: 12 }}>
            <label>
              兑换码
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="16~20 位" />
            </label>
            {error ? <div className="notice">{error}</div> : null}
            <button
              disabled={busy}
              onClick={async () => {
                if (!code.trim()) {
                  setError("请输入兑换码");
                  return;
                }
                setBusy(true);
                try {
                  const r = await redeem({ code: code.trim() });
                  setCode("");
                  setProfile((p) => (p ? { ...p, balance: r.balance } : p));
                } catch (e) {
                  if (e instanceof ApiError) setError(`${e.message}（${e.code}）`);
                  else setError("兑换失败");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "处理中…" : "兑换"}
            </button>
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700 }}>开始一个实验</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            上传表格照片 → 抽取 → 校对 → 一键生成固定样式图
          </div>
          <div className="grid" style={{ marginTop: 12 }}>
            {expList.map((e) => (
              <Link key={e.id} to={`/exp/${e.id}`} className="card" style={{ textDecoration: "none" }}>
                <div style={{ fontWeight: 700 }}>{e.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  模板：{e.id}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700 }}>最近 3 天历史</div>
          <button
            onClick={async () => {
              const h = await history();
              setItems(h.items);
            }}
          >
            刷新
          </button>
        </div>

        {items.length === 0 ? (
          <div className="notice" style={{ marginTop: 12 }}>
            暂无历史
          </div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>实验</th>
                  <th>过期</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{new Date(it.created_at).toLocaleString()}</td>
                    <td>{it.exp_id}</td>
                    <td>{new Date(it.expires_at).toLocaleString()}</td>
                    <td>
                      <Link to={`/exp/${it.exp_id}?artifact=${encodeURIComponent(it.id)}`}>打开</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
