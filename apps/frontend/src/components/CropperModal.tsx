import Cropper, { Area } from "react-easy-crop";
import { useCallback, useMemo, useState } from "react";

async function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("加载图片失败"));
    img.src = url;
  });
}

async function cropToBlob(imageSrc: string, cropArea: Area, mimeType: string): Promise<Blob> {
  const img = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = cropArea.width;
  canvas.height = cropArea.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 不可用");
  ctx.drawImage(
    img,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    cropArea.width,
    cropArea.height
  );

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("裁剪失败"));
        else resolve(blob);
      },
      mimeType,
      mimeType === "image/jpeg" ? 0.88 : undefined
    );
  });
}

export default function CropperModal(props: {
  imageUrl: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const mimeType = useMemo(() => "image/jpeg", []);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setArea(areaPixels);
  }, []);

  if (!props.open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 50
      }}
      onClick={() => (!busy ? props.onCancel() : null)}
    >
      <div
        className="card"
        style={{ width: "min(900px, 100%)", height: "min(680px, 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700 }}>裁剪表格区域</div>
            <div className="muted" style={{ fontSize: 13 }}>
              尽量只保留表格，减少背景以提升识别准确率
            </div>
          </div>
          <div className="row">
            <button className="danger" disabled={busy} onClick={props.onCancel}>
              取消
            </button>
            <button
              disabled={busy || !area}
              onClick={async () => {
                if (!area) return;
                setBusy(true);
                try {
                  const blob = await cropToBlob(props.imageUrl, area, mimeType);
                  props.onConfirm(blob);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "处理中…" : "确认裁剪"}
            </button>
          </div>
        </div>

        <div style={{ position: "relative", width: "100%", height: 520, marginTop: 12 }}>
          <Cropper
            image={props.imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={4 / 3}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <label style={{ minWidth: 240 }}>
            缩放
            <input
              type="range"
              min={1}
              max={3}
              step={0.02}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <div className="muted" style={{ fontSize: 13 }}>
            导出为 JPEG（更省 token）
          </div>
        </div>
      </div>
    </div>
  );
}

