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
