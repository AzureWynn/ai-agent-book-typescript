import { QueryMetrics } from './types.js';

export function recallAtK(hits: string[], relevant: string[], k: number): number {
  if (relevant.length === 0) return 1;
  const found = hits.slice(0, k).filter((id) => relevant.includes(id)).length;
  return found / relevant.length;
}

export function reciprocalRank(hits: string[], relevant: string[]): number {
  for (let i = 0; i < hits.length; i++) {
    if (relevant.includes(hits[i] ?? '')) return 1 / (i + 1);
  }
  return 0;
}

export function ndcgAtK(hits: string[], relevant: string[], k: number): number {
  const topK = hits.slice(0, k);
  let dcg = 0;
  topK.forEach((id, i) => {
    if (relevant.includes(id)) dcg += 1 / Math.log2(i + 2);
  });
  const ideal = Math.min(relevant.length, k);
  let idcg = 0;
  for (let i = 0; i < ideal; i++) idcg += 1 / Math.log2(i + 2);
  return idcg > 0 ? dcg / idcg : 0;
}

export function scoreQuery(query: string, hits: string[], relevant: string[], k: number): QueryMetrics {
  return {
    query,
    recall: recallAtK(hits, relevant, k),
    mrr: reciprocalRank(hits, relevant),
    ndcg: ndcgAtK(hits, relevant, k),
  };
}
