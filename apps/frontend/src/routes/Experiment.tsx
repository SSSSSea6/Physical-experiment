import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { ExpPayload, Me } from "../types";
import { getExperiment, makeBlankPayload, normalizePayload } from "../experiments";
import { ApiError, extract, getArtifact, getUploadUrl, me, putUpload } from "../api";
import Turnstile from "../components/Turnstile";
import CropperModal from "../components/CropperModal";
import EditableTable from "../components/EditableTable";
import PlotArea from "../components/PlotArea";

export default function ExperimentPage() {
  const { expId } = useParams();
  const def = getExperiment(expId);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const artifactId = params.get("artifact");

  const [profile, setProfile] = useState<Me | null>(null);
  const [payload, setPayload] = useState<ExpPayload | null>(def ? makeBlankPayload(def.schema) : null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropped, setCropped] = useState<Blob | null>(null);
  const [extractToken, setExtractToken] = useState("");
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<string | null>(artifactId);
  const [plotOn, setPlotOn] = useState(false);

  const charts = useMemo(() => {
    if (!def || !payload) return [];
    return def.buildCharts(payload);
  }, [def, payload]);

  const hasPlotPoints = useMemo(() => {
    return charts.some((c: any) =>
      (c.data?.datasets ?? []).some((ds: any) => Array.isArray(ds?.data) && ds.data.length > 0)
    );
  }, [charts]);

  useEffect(() => {
    (async () => {
      try {
        const p = await me();
        setProfile(p);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) nav("/login", { replace: true });
      }
    })();
  }, [nav]);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  useEffect(() => {
    if (!def) return;
    if (!artifactId) return;
    (async () => {
      try {
        const a = await getArtifact(artifactId);
        setArtifact(a.id);
        setPayload(normalizePayload(def.schema, a.payload));
      } catch (e) {
        setError(e instanceof ApiError ? `${e.message}（${e.code}）` : "加载历史失败");
      }
    })();
  }, [artifactId, def]);

  if (!def) {
    return (
      <div className="container">
        <div className="card">未知实验：{expId}</div>
        <div style={{ marginTop: 12 }}>
          <Link to="/dashboard">返回仪表盘</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">{def.name}</div>
        <div className="row">
          <Link to="/dashboard">← 返回</Link>
          {profile ? <span className="pill">余额：{profile.balance}</span> : null}
          {artifact ? <span className="pill">历史：{artifact}</span> : null}
        </div>
      </div>

      {error ? (
        <div className="notice" style={{ borderColor: "rgba(248,113,113,0.45)" }}>
          {error}
        </div>
      ) : null}

      <div className="grid cols-2">
        <div className="card">
          <div style={{ fontWeight: 700 }}>1) 上传并裁剪表格</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            建议先裁剪到表格区域并压缩，以节省 token 与提升识别准确率
          </div>

          <div className="grid" style={{ marginTop: 12 }}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const url = URL.createObjectURL(f);
                setFileUrl(url);
                setCropped(null);
                setCropOpen(true);
              }}
            />

            {cropped ? (
              <div className="notice">已准备裁剪图：{Math.round(cropped.size / 1024)} KB</div>
            ) : (
              <div className="notice">还未裁剪图片</div>
            )}

            <div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                识别前需要 Turnstile；每次识别消耗 1 次
              </div>
              <Turnstile
                onToken={(t) => {
                  setExtractToken(t);
                  setError(null);
                }}
                resetSignal={reset}
              />
            </div>

            <button
              disabled={busy || !cropped}
              onClick={async () => {
                setError(null);
                if (!cropped) return;
                if (!extractToken) {
                  setError("请先完成人机验证");
                  return;
                }
                setBusy(true);
                try {
                  const up = await getUploadUrl({ exp_id: def.id, content_type: cropped.type || "image/jpeg" });
                  await putUpload(up.upload_url, cropped);
                  const r = await extract({ exp_id: def.id, image_key: up.image_key, turnstile_token: extractToken });
                  setPayload(normalizePayload(def.schema, r.payload));
                  setProfile((p) => (p ? { ...p, balance: r.balance } : p));
                  setArtifact(r.artifact_id);
                  setPlotOn(false);
                  setExtractToken("");
                  setReset((x) => x + 1);
                } catch (e) {
                  if (e instanceof ApiError) setError(`${e.message}（${e.code}）`);
                  else setError("识别失败");
                  setExtractToken("");
                  setReset((x) => x + 1);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "识别中…" : "识别并填表（-1 次）"}
            </button>
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700 }}>2) 作图与导出</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            作图在前端完成；导出 PNG（余额为 0 时默认带水印）
          </div>

          <div className="grid" style={{ marginTop: 12 }}>
            <div className="row">
              <button onClick={() => setPlotOn(true)} disabled={!payload}>
                生成图
              </button>
              <button
                onClick={() => {
                  setArtifact(null);
                  setPayload(makeBlankPayload(def.schema));
                  setPlotOn(false);
                }}
              >
                清空为模板
              </button>
            </div>
            <div className="notice">图表：{plotOn ? `已生成 ${charts.length} 张` : "尚未生成"}</div>
          </div>
        </div>
      </div>

      {payload ? (
        <div style={{ marginTop: 16 }}>
          <EditableTable schema={def.schema} payload={payload} onChange={setPayload} />
        </div>
      ) : null}

      {!plotOn ? (
        <div className="notice" style={{ marginTop: 16 }}>
          点击「生成图」即可预览并导出 PNG
        </div>
      ) : charts.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          {hasPlotPoints ? (
            <PlotArea charts={charts} watermarkText={profile && profile.balance > 0 ? null : "lab.nuaaguide.online"} />
          ) : (
            <div className="notice">数据不足，无法生成有效曲线（请先填写表格）</div>
          )}
        </div>
      ) : (
        <div className="notice" style={{ marginTop: 16 }}>
          当前实验暂无图表脚本
        </div>
      )}

      <CropperModal
        open={cropOpen}
        imageUrl={fileUrl ?? ""}
        onCancel={() => {
          setCropOpen(false);
          setFileUrl(null);
        }}
        onConfirm={(blob) => {
          setCropOpen(false);
          setCropped(blob);
        }}
      />
    </div>
  );
}
