import { QueryMetrics } from './types.js';

export function recallAtK(hits: string[], relevant: string[], k: number): number {
  if (relevant.length === 0) return 1;
  const topK = hits.slice(0, k);
  const found = topK.filter((id) => relevant.includes(id)).length;
  return found / relevant.length;
}

export function precisionAtK(hits: string[], relevant: string[], k: number): number {
  if (k === 0) return 0;
  const topK = hits.slice(0, k);
  const found = topK.filter((id) => relevant.includes(id)).length;
  return found / k;
}

export function reciprocalRank(hits: string[], relevant: string[]): number {
  for (let i = 0; i < hits.length; i++) {
    if (relevant.includes(hits[i] ?? '')) return 1 / (i + 1);
  }
  return 0;
}

export function scoreQuery(query: string, hits: string[], relevant: string[], k: number): QueryMetrics {
  return {
    query,
    recall: recallAtK(hits, relevant, k),
    precision: precisionAtK(hits, relevant, k),
    rr: reciprocalRank(hits, relevant),
    hits,
    relevant,
  };
}
