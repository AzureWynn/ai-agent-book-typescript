import { applicableFactors, detectCharge, extractFactors } from './extractor.js';
import { encode, featureNames, standardize } from './features.js';
import { ChargeClustering } from './archetypes.js';
import { AdviseResult, Archetype, Charge, FactorValue } from './types.js';
import { FACTOR_LABELS } from './discovery.js';

function isKnown(v: FactorValue): boolean {
  return v === true || (typeof v === 'number' && v > 0) || (typeof v === 'string' && v.length > 0);
}

export function parseDescription(text: string): { charge: Charge | null; known: Record<string, FactorValue> } {
  const charge = detectCharge(text);
  const known: Record<string, FactorValue> = {};
  if (!charge) return { charge, known };
  const extracted = extractFactors(text, charge);
  for (const [k, v] of Object.entries(extracted)) {
    if (isKnown(v)) known[k] = v;
  }
  return { charge, known };
}

export function missingFactors(known: Record<string, FactorValue>, charge: Charge): string[] {
  return applicableFactors(charge).filter((f) => !isKnown(known[f] ?? null));
}

export function matchArchetype(
  known: Record<string, FactorValue>,
  charge: Charge,
  clustering: ChargeClustering
): { archetype: Archetype | null; distance: number } {
  const names = featureNames(charge);
  const full = encodeKnown(known, charge);
  const z = standardize(full, clustering.params);
  let best: Archetype | null = null;
  let bestDist = Infinity;
  for (const arch of clustering.archetypes) {
    const centroid = arch.centroid;
    let sum = 0;
    let dims = 0;
    for (let j = 0; j < names.length; j++) {
      if (!isKnownDim(names[j] ?? '', known)) continue;
      const d = (z[j] ?? 0) - (centroid[j] ?? 0);
      sum += d * d;
      dims += 1;
    }
    if (dims === 0) continue;
    const dist = Math.sqrt(sum);
    if (dist < bestDist) {
      bestDist = dist;
      best = arch;
    }
  }
  return { archetype: best, distance: bestDist };
}

function encodeKnown(known: Record<string, FactorValue>, charge: Charge): number[] {
  const gold = {
    surrender: false, compensation: false, plea: false, record: false,
    amount: null, gang: false, weapon: false, home: false,
    level: null, premeditation: false, victims: null,
    ...known,
  };
  return encode(gold as Parameters<typeof encode>[0], charge);
}

function isKnownDim(feature: string, known: Record<string, FactorValue>): boolean {
  if (feature === 'lnAmount') return isKnown(known['amount'] ?? null);
  if (feature === 'lnVictims') return isKnown(known['victims'] ?? null);
  if (feature === 'levelMinor' || feature === 'levelLight' || feature === 'levelSerious') {
    return isKnown(known['level'] ?? null);
  }
  return isKnown(known[feature] ?? null);
}

export function buildAdvice(
  query: string,
  known: Record<string, FactorValue>,
  charge: Charge,
  ask: string | null,
  match: { archetype: Archetype | null; distance: number }
): string {
  const lines: string[] = [];
  lines.push(`案情识别：${charge === 'theft' ? '盗窃罪' : charge === 'injury' ? '故意伤害罪' : '诈骗罪'}。已知：${formatKnown(known)}。`);
  if (ask) lines.push(`还缺关键信息：${FACTOR_LABELS[ask] ?? ask}（按全局重要性排序首位），请补充后再定。`);
  if (match.archetype) {
    const a = match.archetype;
    lines.push(`匹配到${a.id}（n=${a.size}，典型刑期中位 ${a.medianMonths} 月，区间 ${a.lo}~${a.hi} 月）。`);
    lines.push(`定义性因子：${a.defining.map((d) => `${FACTOR_LABELS[d.factor] ?? d.factor}(z=${d.z.toFixed(1)})`).join('、')}。`);
  }
  lines.push(`问题原文：${query}`);
  lines.push('免责声明：本建议仅用于教学演示因子原型方法，不构成法律意见，具体量刑请咨询专业律师。');
  return lines.join('\n');
}

function formatKnown(known: Record<string, FactorValue>): string {
  const parts = Object.entries(known).map(([k, v]) => `${FACTOR_LABELS[k] ?? k}=${String(v)}`);
  return parts.length > 0 ? parts.join('、') : '（无）';
}

export function advise(
  text: string,
  clusterings: ChargeClustering[],
  importanceOrder: string[]
): AdviseResult {
  const { charge, known } = parseDescription(text);
  if (!charge) {
    return {
      charge, known, missing: [], ask: null, archetype: null, distance: Infinity,
      advice: '无法识别罪名（需含盗窃/伤害/诈骗等关键词），请补充案情描述。',
    };
  }
  const applicable = applicableFactors(charge);
  const missing = missingFactors(known, charge);
  const ask = importanceOrder.find((f) => missing.includes(f) && applicable.includes(f)) ?? missing[0] ?? null;
  const clustering = clusterings.find((c) => c.charge === charge);
  const match = clustering ? matchArchetype(known, charge, clustering) : { archetype: null, distance: Infinity };
  return { charge, known, missing, ask, archetype: match.archetype, distance: match.distance, advice: buildAdvice(text, known, charge, ask, match) };
}
