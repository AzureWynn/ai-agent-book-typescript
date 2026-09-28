import { buildIndexes } from './dual.js';
import { QUERIES } from './corpus.js';

function recallAt(hits: string[], relevant: string[], k: number): number {
  if (relevant.length === 0) return 1;
  return hits.slice(0, k).filter((id) => relevant.includes(id)).length / relevant.length;
}

function reciprocalRank(hits: string[], relevant: string[]): number {
  for (let i = 0; i < hits.length; i++) {
    if (relevant.includes(hits[i] ?? '')) return 1 / (i + 1);
  }
  return 0;
}

function avg(xs: number[]): number {
  return xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

export interface CompareRow {
  query: string;
  plainRank: number;
  ctxRank: number;
}

export interface CompareReport {
  plainRecallAt1: number;
  plainRecallAt3: number;
  plainMRR: number;
  ctxRecallAt1: number;
  ctxRecallAt3: number;
  ctxMRR: number;
  rows: CompareRow[];
}

export function compare(): CompareReport {
  const { plain, ctx } = buildIndexes();
  const rows = QUERIES.map((q) => {
    const plainHits = plain.search(q.query, 10).map((r) => r.id);
    const ctxHits = ctx.search(q.query, 10).map((r) => r.id);
    const plainPos = plainHits.indexOf(q.relevant[0] ?? '');
    const ctxPos = ctxHits.indexOf(q.relevant[0] ?? '');
    return {
      query: q.query,
      plainRank: plainPos === -1 ? -1 : plainPos + 1,
      ctxRank: ctxPos === -1 ? -1 : ctxPos + 1,
    };
  });
  const score = (getHits: (q: (typeof QUERIES)[number]) => string[]) => ({
    r1: avg(QUERIES.map((q) => recallAt(getHits(q), q.relevant, 1))),
    r3: avg(QUERIES.map((q) => recallAt(getHits(q), q.relevant, 3))),
    mrr: avg(QUERIES.map((q) => reciprocalRank(getHits(q), q.relevant))),
  });
  const plainHitsOf = (q: (typeof QUERIES)[number]): string[] =>
    plain.search(q.query, 10).map((r) => r.id);
  const ctxHitsOf = (q: (typeof QUERIES)[number]): string[] =>
    ctx.search(q.query, 10).map((r) => r.id);
  const p = score(plainHitsOf);
  const c = score(ctxHitsOf);
  return {
    plainRecallAt1: p.r1,
    plainRecallAt3: p.r3,
    plainMRR: p.mrr,
    ctxRecallAt1: c.r1,
    ctxRecallAt3: c.r3,
    ctxMRR: c.mrr,
    rows,
  };
}
