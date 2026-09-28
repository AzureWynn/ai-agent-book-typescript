import { RankedDoc } from './types.js';

function minMaxNormalize(list: RankedDoc[]): Map<string, number> {
  const out = new Map<string, number>();
  if (list.length === 0) return out;
  let min = Infinity;
  let max = -Infinity;
  for (const r of list) {
    if (r.score < min) min = r.score;
    if (r.score > max) max = r.score;
  }
  const range = max - min;
  for (const r of list) out.set(r.id, range > 0 ? (r.score - min) / range : 1);
  return out;
}

export function rrfFuse(lists: RankedDoc[][], k = 60): RankedDoc[] {
  const scores = new Map<string, { score: number; text: string }>();
  for (const list of lists) {
    list.forEach((r, idx) => {
      const rank = idx + 1;
      const entry = scores.get(r.id) ?? { score: 0, text: r.text };
      entry.score += 1 / (k + rank);
      scores.set(r.id, entry);
    });
  }
  return [...scores.entries()]
    .map(([id, e]) => ({ id, text: e.text, score: e.score }))
    .sort((a, b) => b.score - a.score);
}

export function weightedFuse(
  dense: RankedDoc[],
  sparse: RankedDoc[],
  denseWeight = 0.5,
  sparseWeight = 0.5
): RankedDoc[] {
  const denseNorm = minMaxNormalize(dense);
  const sparseNorm = minMaxNormalize(sparse);
  const texts = new Map<string, string>();
  for (const r of [...dense, ...sparse]) texts.set(r.id, r.text);
  const ids = new Set([...denseNorm.keys(), ...sparseNorm.keys()]);
  return [...ids]
    .map((id) => ({
      id,
      text: texts.get(id) ?? '',
      score: denseWeight * (denseNorm.get(id) ?? 0) + sparseWeight * (sparseNorm.get(id) ?? 0),
    }))
    .sort((a, b) => b.score - a.score);
}
