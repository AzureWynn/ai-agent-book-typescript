import { TextIndex } from './index.js';
import { CHUNKS, QUERIES } from './corpus.js';
import { contextualText } from './prefix.js';

export interface MethodResult {
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
}

export interface PerQueryRank {
  query: string;
  plainRank: number;
  ctxRank: number;
}

export interface EvalReport {
  plain: MethodResult;
  ctx: MethodResult;
  perQuery: PerQueryRank[];
}

function recallAt(hits: string[], relevant: string[], k: number): number {
  if (relevant.length === 0) return 1;
  return hits.slice(0, k).filter((id) => relevant.includes(id)).length / relevant.length;
}

function avg(xs: number[]): number {
  return xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

export function buildIndexes(prefixOverride?: Record<string, string>): { plain: TextIndex; ctx: TextIndex } {
  const plain = new TextIndex(CHUNKS.map((c) => ({ id: c.id, text: c.text })));
  const ctx = new TextIndex(
    CHUNKS.map((c) => {
      const override = prefixOverride?.[c.id];
      const prefix = override ?? contextualText(c.id, c.text);
      return { id: c.id, text: prefix === c.text ? c.text : `${prefix} ${c.text}` };
    })
  );
  return { plain, ctx };
}

function scoreMethod(index: TextIndex, ks: number[]): MethodResult {
  const buckets: Record<number, number[]> = { 1: [], 3: [], 5: [] };
  for (const q of QUERIES) {
    const hits = index.search(q.query, 10).map((r) => r.id);
    for (const k of ks) buckets[k]?.push(recallAt(hits, q.relevant, k));
  }
  return {
    recallAt1: avg(buckets[1] ?? []),
    recallAt3: avg(buckets[3] ?? []),
    recallAt5: avg(buckets[5] ?? []),
  };
}

export function evaluate(prefixOverride?: Record<string, string>): EvalReport {
  const { plain, ctx } = buildIndexes(prefixOverride);
  const perQuery = QUERIES.map((q) => {
    const plainHits = plain.search(q.query, 10).map((r) => r.id);
    const ctxHits = ctx.search(q.query, 10).map((r) => r.id);
    const plainPos = plainHits.indexOf(q.relevant[0] ?? '');
    const ctxPos = ctxHits.indexOf(q.relevant[0] ?? '');
    return { query: q.query, plainRank: plainPos === -1 ? -1 : plainPos + 1, ctxRank: ctxPos === -1 ? -1 : ctxPos + 1 };
  });
  return { plain: scoreMethod(plain, [1, 3, 5]), ctx: scoreMethod(ctx, [1, 3, 5]), perQuery };
}
