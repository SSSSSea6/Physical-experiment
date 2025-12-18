import hallSchemaJson from "@experiments/hall/schema.json";
import { buildHallCharts } from "@experiments/hall/plot";
import type { ExpPayload, ExpSchema } from "./types";

export type ExperimentDef = {
  id: string;
  name: string;
  schema: ExpSchema;
  buildCharts: (payload: ExpPayload) => Array<{ id: string; title: string; data: any; options: any }>;
};

export const experiments: Record<string, ExperimentDef> = {
  hall: {
    id: "hall",
    name: "Hall 效应实验",
    schema: hallSchemaJson as unknown as ExpSchema,
    buildCharts: (payload) => buildHallCharts(payload as any)
  }
};

export function getExperiment(expId: string | undefined): ExperimentDef | null {
  if (!expId) return null;
  return experiments[expId] ?? null;
}

export function makeBlankPayload(schema: ExpSchema): ExpPayload {
  const meta: ExpPayload["meta"] = {};
  for (const f of schema.meta_fields ?? []) meta[f.id] = { value: null, confidence: null };

  const tables: ExpPayload["tables"] = {};
  for (const t of schema.tables ?? []) {
    const rows: Array<Record<string, { value: string | number | null; confidence: number | null }>> = [];
    for (let i = 0; i < t.rows; i++) {
      const row: Record<string, { value: string | number | null; confidence: number | null }> = {};
      for (const col of t.columns) row[col.id] = { value: null, confidence: null };
      rows.push(row);
    }
    tables[t.id] = { rows };
  }

  return {
    exp_id: schema.exp_id,
    schema_version: schema.version,
    meta,
    tables,
    uncertain_fields: []
  };
}

export function normalizePayload(schema: ExpSchema, payload: any): ExpPayload {
  const blank = makeBlankPayload(schema);
  if (!payload || typeof payload !== "object") return blank;

  for (const key of Object.keys(blank.meta)) {
    const cell = payload.meta?.[key];
    if (cell && typeof cell === "object") {
      blank.meta[key] = {
        value: cell.value ?? null,
        confidence: typeof cell.confidence === "number" ? cell.confidence : blank.meta[key].confidence
      };
    }
  }

  for (const tableId of Object.keys(blank.tables)) {
    const rows = blank.tables[tableId].rows;
    const inRows = payload.tables?.[tableId]?.rows;
    for (let i = 0; i < rows.length; i++) {
      const inRow = Array.isArray(inRows) ? inRows[i] : null;
      for (const colId of Object.keys(rows[i])) {
        const cell = inRow?.[colId];
        if (cell && typeof cell === "object") {
          rows[i][colId] = {
            value: cell.value ?? null,
            confidence: typeof cell.confidence === "number" ? cell.confidence : rows[i][colId].confidence
          };
        }
      }
    }
  }

  if (Array.isArray(payload.uncertain_fields)) {
    blank.uncertain_fields = payload.uncertain_fields.filter((x: any) => typeof x === "string");
  }

  return blank;
}

