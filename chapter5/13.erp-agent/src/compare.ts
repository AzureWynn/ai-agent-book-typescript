import { ResultRow } from './types.js';

function normCell(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  if (typeof v !== 'string' || v.trim() === '' || Number.isNaN(n)) return typeof v === 'string' ? v : String(v);
  return n;
}

function normRow(row: Record<string, unknown>): ResultRow {
  const out: ResultRow = {};
  for (const k of Object.keys(row).sort()) {
    const v = normCell(row[k]);
    if (v !== null) out[k] = v;
    else out[k] = row[k] === null ? null : String(row[k]);
  }
  return out;
}

function cellsEqual(a: string | number | null, b: string | number | null): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  return a === b;
}

function rowsEqual(a: ResultRow, b: ResultRow): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length || !ka.every((k, i) => k === kb[i])) return false;
  return ka.every((k) => cellsEqual(a[k] ?? null, b[k] ?? null));
}

export function compareResults(actual: Record<string, unknown>[], expected: ResultRow[], ordered: boolean): boolean {
  const aRows = actual.map(normRow);
  if (aRows.length !== expected.length) return false;
  if (!ordered) {
    const remaining = [...expected];
    for (const r of aRows) {
      const idx = remaining.findIndex((e) => rowsEqual(r, e));
      if (idx === -1) return false;
      remaining.splice(idx, 1);
    }
    return remaining.length === 0;
  }
  return aRows.every((r, i) => {
    const e = expected[i];
    return e !== undefined && rowsEqual(r, e);
  });
}
