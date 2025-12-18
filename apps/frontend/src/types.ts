export type ColumnType = "number" | "string";

export type SchemaField = {
  id: string;
  name: string;
  unit?: string;
  type: ColumnType;
};

export type SchemaTable = {
  id: string;
  title: string;
  rows: number;
  columns: SchemaField[];
};

export type ExpSchema = {
  exp_id: string;
  name: string;
  version: number;
  meta_fields: SchemaField[];
  tables: SchemaTable[];
};

export type Cell<T> = { value: T | null; confidence: number | null };

export type ExpPayload = {
  exp_id: string;
  schema_version: number;
  meta: Record<string, Cell<string | number>>;
  tables: Record<string, { rows: Array<Record<string, Cell<string | number>>> }>;
  uncertain_fields?: string[];
};

export type Me = { student_id: string; balance: number };

export type HistoryItem = {
  id: string;
  exp_id: string;
  created_at: string;
  expires_at: string;
  has_image: boolean;
  has_plot: boolean;
};

