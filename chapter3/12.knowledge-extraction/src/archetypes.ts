import { CASES } from './data.js';
import { encode, featureNames, standardize, standardizeParams, StandardParams } from './features.js';
import { kmeans, silhouette } from './kmeans.js';
import { Archetype, Charge } from './types.js';

export interface ChargeClustering {
  charge: Charge;
  k: number;
  silhouette: number;
  archetypes: Archetype[];
  featureImportance: Array<{ factor: string; score: number }>;
  params: StandardParams;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lower = sorted[base] ?? 0;
  const upper = sorted[base + 1] ?? lower;
  return lower + rest * (upper - lower);
}

function median(xs: number[]): number {
  return quantile([...xs].sort((a, b) => a - b), 0.5);
}

export function clusterCharge(charge: Charge): ChargeClustering {
  const cases = CASES.filter((c) => c.charge === charge);
  const raw = cases.map((c) => encode(c.gold, charge));
  const params = standardizeParams(raw);
  const vectors = raw.map((v) => standardize(v, params));
  const names = featureNames(charge);

  let best = { k: 2, score: -Infinity, labels: [] as number[], centroids: [] as number[][] };
  for (const k of [2, 3]) {
    if (k >= cases.length) continue;
    const result = kmeans(vectors, k, 42 + k);
    const score = silhouette(vectors, result.labels);
    if (score > best.score) best = { k, score, labels: result.labels, centroids: result.centroids };
  }

  const archetypes: Archetype[] = [];
  for (let c = 0; c < best.k; c++) {
    const members = cases.filter((_, i) => best.labels[i] === c);
    const labels = members.map((m) => m.labelMonths);
    const centroid = best.centroids[c] ?? [];
    const defining = names
      .map((factor, j) => ({ factor, z: centroid[j] ?? 0 }))
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
      .slice(0, 3);
    const sorted = [...labels].sort((a, b) => a - b);
    archetypes.push({
      id: `${charge}#${c}`,
      charge,
      size: members.length,
      members: members.map((m) => m.id),
      medianMonths: median(labels),
      lo: Math.min(...sorted),
      hi: Math.max(...sorted),
      defining,
      centroid: centroid ?? [],
    });
  }
  archetypes.sort((a, b) => a.medianMonths - b.medianMonths);

  const featureImportance = names.map((factor, j) => {
    const col = vectors.map((v) => v[j] ?? 0);
    const grand = col.reduce((s, x) => s + x, 0) / (col.length || 1);
    let between = 0;
    let total = 0;
    for (let c = 0; c < best.k; c++) {
      const members = col.filter((_, i) => best.labels[i] === c);
      if (members.length === 0) continue;
      const mean = members.reduce((s, x) => s + x, 0) / members.length;
      between += members.length * (mean - grand) * (mean - grand);
    }
    for (const x of col) total += (x - grand) * (x - grand);
    return { factor, score: total > 0 ? between / total : 0 };
  }).sort((a, b) => b.score - a.score);

  return { charge, k: best.k, silhouette: best.score, archetypes, featureImportance, params };
}

export function clusterAll(): ChargeClustering[] {
  return (['theft', 'injury', 'fraud'] as Charge[]).map(clusterCharge);
}

export function globalImportance(all: ChargeClustering[]): Array<{ factor: string; score: number; charge: Charge }> {
  const best = new Map<string, { factor: string; score: number; charge: Charge }>();
  for (const cl of all) {
    for (const f of cl.featureImportance) {
      const prev = best.get(f.factor);
      if (!prev || f.score > prev.score) best.set(f.factor, { factor: f.factor, score: f.score, charge: cl.charge });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}
