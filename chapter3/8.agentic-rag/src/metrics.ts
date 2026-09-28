export function missRate(recall: number): number {
  return 1 - recall;
}

export function avg(xs: number[]): number {
  return xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}
