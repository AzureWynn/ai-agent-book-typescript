function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function euclidean(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    s += d * d;
  }
  return Math.sqrt(s);
}

export interface KMeansResult {
  labels: number[];
  centroids: number[][];
  iterations: number;
}

export function kmeans(points: number[][], k: number, seed = 42, maxIter = 100): KMeansResult {
  const rand = mulberry32(seed);
  const n = points.length;
  const dim = points[0]?.length ?? 0;
  const used = new Set<number>();
  const centroids: number[][] = [];
  while (centroids.length < Math.min(k, n)) {
    const idx = Math.floor(rand() * n);
    if (used.has(idx)) continue;
    used.add(idx);
    centroids.push([...(points[idx] ?? [])]);
  }
  let labels = new Array<number>(n).fill(0);
  let iterations = 0;
  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;
    let changed = false;
    const next = labels.slice();
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = euclidean(points[i] ?? [], centroids[c] ?? []);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (next[i] !== best) {
        next[i] = best;
        changed = true;
      }
    }
    labels = next;
    if (!changed) break;
    for (let c = 0; c < centroids.length; c++) {
      const members = points.filter((_, i) => labels[i] === c);
      if (members.length === 0) continue;
      const updated: number[] = [];
      for (let j = 0; j < dim; j++) {
        updated.push(members.reduce((s, p) => s + (p[j] ?? 0), 0) / members.length);
      }
      centroids[c] = updated;
    }
  }
  return { labels, centroids, iterations };
}

export function silhouette(points: number[][], labels: number[]): number {
  const n = points.length;
  const clusters = new Map<number, number[]>();
  labels.forEach((label, i) => {
    const list = clusters.get(label) ?? [];
    list.push(i);
    clusters.set(label, list);
  });
  if (clusters.size < 2) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const own = clusters.get(labels[i] ?? -1) ?? [];
    let a = 0;
    if (own.length > 1) {
      a = own.filter((j) => j !== i).reduce((s, j) => s + euclidean(points[i] ?? [], points[j] ?? []), 0) / (own.length - 1);
    }
    let b = Infinity;
    for (const [label, members] of clusters) {
      if (label === labels[i]) continue;
      const meanDist = members.reduce((s, j) => s + euclidean(points[i] ?? [], points[j] ?? []), 0) / members.length;
      if (meanDist < b) b = meanDist;
    }
    const denom = Math.max(a, b);
    total += denom > 0 ? (b - a) / denom : 0;
  }
  return total / (n || 1);
}
