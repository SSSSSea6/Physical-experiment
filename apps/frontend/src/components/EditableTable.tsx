import type { ExpPayload, ExpSchema } from "../types";

function fieldLabel(name: string, unit?: string) {
  return unit ? `${name} (${unit})` : name;
}

function isLowConfidence(cell: { confidence: number | null } | undefined): boolean {
  if (!cell) return false;
  if (cell.confidence === null || cell.confidence === undefined) return false;
  return cell.confidence < 0.75;
}

export default function EditableTable(props: {
  schema: ExpSchema;
  payload: ExpPayload;
  onChange: (next: ExpPayload) => void;
}) {
  const { schema, payload } = props;

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700 }}>{schema.name}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              低置信度单元格会标红；你修改后会自动取消标红
            </div>
          </div>
          <span className="pill">schema v{schema.version}</span>
        </div>

        <div className="grid cols-2" style={{ marginTop: 12 }}>
          {schema.meta_fields.map((f) => {
            const cell = payload.meta[f.id];
            return (
              <label key={f.id}>
                {fieldLabel(f.name, f.unit)}
                <input
                  value={cell?.value ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const value = f.type === "number" ? (raw.trim() === "" ? null : Number(raw)) : raw;
                    props.onChange({
                      ...payload,
                      meta: {
                        ...payload.meta,
                        [f.id]: { value, confidence: 1 }
                      }
                    });
                  }}
                />
              </label>
            );
          })}
        </div>
      </div>

      {schema.tables.map((t) => (
        <div className="card" key={t.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700 }}>{t.title}</div>
            <span className="pill">{t.rows} 行</span>
          </div>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 54 }}>#</th>
                  {t.columns.map((c) => (
                    <th key={c.id}>{fieldLabel(c.name, c.unit)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payload.tables[t.id].rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    <td className="muted">{rowIndex + 1}</td>
                    {t.columns.map((col) => {
                      const cell = row[col.id];
                      const cls = isLowConfidence(cell) ? "cell-uncertain" : undefined;
                      return (
                        <td key={col.id} className={cls}>
                          <input
                            value={cell?.value ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const value = col.type === "number" ? (raw.trim() === "" ? null : Number(raw)) : raw;
                              const nextRows = payload.tables[t.id].rows.map((r, idx) =>
                                idx === rowIndex
                                  ? {
                                      ...r,
                                      [col.id]: { value, confidence: 1 }
                                    }
                                  : r
                              );
                              props.onChange({
                                ...payload,
                                tables: {
                                  ...payload.tables,
                                  [t.id]: { rows: nextRows }
                                }
                              });
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

