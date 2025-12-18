import { useMemo, useRef } from "react";
import { Scatter } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

async function withWatermark(dataUrl: string, text: string): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("图片加载失败"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0);
  ctx.font = `${Math.max(14, Math.floor(canvas.width / 36))}px ui-sans-serif, system-ui`;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.textAlign = "right";
  ctx.fillText(text, canvas.width - 16, canvas.height - 16);
  return canvas.toDataURL("image/png");
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export default function PlotArea(props: {
  charts: Array<{ id: string; title: string; data: any; options: any }>;
  watermarkText?: string | null;
}) {
  const watermarkText = props.watermarkText ?? null;

  return (
    <div className="grid cols-2">
      {props.charts.map((chart) => (
        <PlotCard key={chart.id} chart={chart} watermarkText={watermarkText} />
      ))}
    </div>
  );
}

function PlotCard(props: {
  chart: { id: string; title: string; data: any; options: any };
  watermarkText: string | null;
}) {
  const chartRef = useRef<ChartJS<"scatter"> | null>(null);
  const filename = useMemo(() => `${props.chart.id}.png`, [props.chart.id]);

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700 }}>{props.chart.title}</div>
        <button
          onClick={async () => {
            const chart = chartRef.current;
            if (!chart) return;
            let dataUrl = chart.toBase64Image("image/png", 1);
            if (props.watermarkText) dataUrl = await withWatermark(dataUrl, props.watermarkText);
            downloadDataUrl(dataUrl, filename);
          }}
        >
          导出 PNG
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        <Scatter ref={chartRef} data={props.chart.data} options={props.chart.options} />
      </div>
    </div>
  );
}

