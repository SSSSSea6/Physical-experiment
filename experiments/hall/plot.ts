import type { ChartData, ChartOptions } from "chart.js";

export type Cell<T> = { value: T | null; confidence: number | null };
export type HallPayload = {
  exp_id: "hall";
  schema_version: number;
  meta: Record<string, Cell<string | number>>;
  tables: Record<
    string,
    {
      rows: Array<Record<string, Cell<string | number>>>;
    }
  >;
  uncertain_fields?: string[];
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function buildHallCharts(payload: HallPayload): Array<{
  id: string;
  title: string;
  data: ChartData<"scatter">;
  options: ChartOptions<"scatter">;
}> {
  const uhVsB = payload.tables.uh_vs_b?.rows ?? [];
  const uhVsI = payload.tables.uh_vs_i?.rows ?? [];

  const pointsUhVsB = uhVsB
    .map((row) => {
      const x = toNumber(row.B_mT?.value);
      const y = toNumber(row.U_H_mV?.value);
      if (x === null || y === null) return null;
      return { x, y };
    })
    .filter((p): p is { x: number; y: number } => !!p);

  const pointsUhVsI = uhVsI
    .map((row) => {
      const x = toNumber(row.I_mA?.value);
      const y = toNumber(row.U_H_mV?.value);
      if (x === null || y === null) return null;
      return { x, y };
    })
    .filter((p): p is { x: number; y: number } => !!p);

  const commonOptions: ChartOptions<"scatter"> = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { display: false },
      title: { display: false }
    },
    scales: {
      x: { grid: { color: "rgba(0,0,0,0.06)" } },
      y: { grid: { color: "rgba(0,0,0,0.06)" } }
    }
  };

  return [
    {
      id: "uh_vs_b",
      title: "U_H - B",
      data: {
        datasets: [
          {
            label: "U_H(B)",
            data: pointsUhVsB,
            pointRadius: 3,
            showLine: true,
            borderColor: "#2563eb",
            backgroundColor: "#2563eb"
          }
        ]
      },
      options: {
        ...commonOptions,
        scales: {
          x: { ...commonOptions.scales?.x, title: { display: true, text: "B (mT)" } },
          y: { ...commonOptions.scales?.y, title: { display: true, text: "U_H (mV)" } }
        }
      }
    },
    {
      id: "uh_vs_i",
      title: "U_H - I",
      data: {
        datasets: [
          {
            label: "U_H(I)",
            data: pointsUhVsI,
            pointRadius: 3,
            showLine: true,
            borderColor: "#16a34a",
            backgroundColor: "#16a34a"
          }
        ]
      },
      options: {
        ...commonOptions,
        scales: {
          x: { ...commonOptions.scales?.x, title: { display: true, text: "I (mA)" } },
          y: { ...commonOptions.scales?.y, title: { display: true, text: "U_H (mV)" } }
        }
      }
    }
  ];
}

