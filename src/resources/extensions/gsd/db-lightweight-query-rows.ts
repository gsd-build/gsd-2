// Project/App: GSD-2
// File Purpose: Lightweight DB query row mappers for hot-path status reads.

type DbRow = Record<string, unknown>;

export interface IdStatusSummary {
  id: string;
  status: string;
}

export interface ActiveTaskSummary extends IdStatusSummary {
  title: string;
}

export interface TaskStatusCounts {
  total: number;
  done: number;
  pending: number;
}

export function rowToIdStatusSummary(row: DbRow): IdStatusSummary {
  return {
    id: row["id"] as string,
    status: row["status"] as string,
  };
}

export function rowToActiveTaskSummary(row: DbRow): ActiveTaskSummary {
  return {
    ...rowToIdStatusSummary(row),
    title: row["title"] as string,
  };
}

export function rowToTaskStatusCounts(row: DbRow | undefined): TaskStatusCounts {
  if (!row) return emptyTaskStatusCounts();
  return {
    total: (row["total"] as number) ?? 0,
    done: (row["done"] as number) ?? 0,
    pending: (row["pending"] as number) ?? 0,
  };
}

export function emptyTaskStatusCounts(): TaskStatusCounts {
  return { total: 0, done: 0, pending: 0 };
}

export function rowsToStringColumn(rows: DbRow[], column: string): string[] {
  return rows.map((row) => row[column] as string);
}
