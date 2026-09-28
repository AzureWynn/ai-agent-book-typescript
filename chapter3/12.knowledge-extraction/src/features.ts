import { Charge, GoldFactors } from './types.js';

export function featureNames(charge: Charge): string[] {
  const core = ['surrender', 'compensation', 'plea', 'record'];
  if (charge === 'theft') return [...core, 'lnAmount', 'gang', 'weapon', 'home'];
  if (charge === 'injury') {
    return [...core, 'levelMinor', 'levelLight', 'levelSerious', 'premeditation', 'weapon'];
  }
  return [...core, 'lnAmount', 'lnVictims', 'gang'];
}

function bool(b: boolean): number {
  return b ? 1 : 0;
}

export function encode(gold: GoldFactors, charge: Charge): number[] {
  const base = [bool(gold.surrender), bool(gold.compensation), bool(gold.plea), bool(gold.record)];
  if (charge === 'theft') {
    return [...base, Math.log((gold.amount ?? 0) + 1), bool(gold.gang), bool(gold.weapon), bool(gold.home)];
  }
  if (charge === 'injury') {
    return [
      ...base,
      gold.level === '轻微伤' ? 1 : 0,
      gold.level === '轻伤' ? 1 : 0,
      gold.level === '重伤' ? 1 : 0,
      bool(gold.premeditation),
      bool(gold.weapon),
    ];
  }
  return [...base, Math.log((gold.amount ?? 0) + 1), Math.log((gold.victims ?? 0) + 1), bool(gold.gang)];
}

export interface StandardParams {
  mean: number[];
  std: number[];
}

export function standardizeParams(vectors: number[][]): StandardParams {
  const dim = vectors[0]?.length ?? 0;
  const mean: number[] = [];
  const std: number[] = [];
  for (let j = 0; j < dim; j++) {
    const col = vectors.map((v) => v[j] ?? 0);
    const m = col.reduce((s, x) => s + x, 0) / (col.length || 1);
    const variance = col.reduce((s, x) => s + (x - m) * (x - m), 0) / (col.length || 1);
    mean.push(m);
    std.push(Math.sqrt(variance) || 1);
  }
  return { mean, std };
}

export function standardize(v: number[], params: StandardParams): number[] {
  return v.map((x, j) => (x - (params.mean[j] ?? 0)) / (params.std[j] ?? 1));
}
