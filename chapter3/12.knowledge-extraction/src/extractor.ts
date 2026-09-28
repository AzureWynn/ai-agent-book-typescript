import { Charge, FactorValue, GoldFactors } from './types.js';

function parseAmount(text: string): number | null {
  const wan = text.match(/(\d+(?:\.\d+)?)万元/);
  const yuan = text.match(/(\d+)元/);
  const candidates: number[] = [];
  if (wan) candidates.push(parseFloat(wan[1] ?? '0') * 10000);
  if (yuan) candidates.push(parseInt(yuan[1] ?? '0', 10));
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function parseVictims(text: string): number | null {
  const m1 = text.match(/(\d+)名受害人/);
  if (m1) return parseInt(m1[1] ?? '0', 10);
  const m2 = text.match(/(\d+)人/);
  if (m2) return parseInt(m2[1] ?? '0', 10);
  return null;
}

function parseLevel(text: string): GoldFactors['level'] {
  if (/重伤二级|重伤/.test(text)) return '重伤';
  if (/轻伤二级|轻伤/.test(text)) return '轻伤';
  if (/轻微伤/.test(text)) return '轻微伤';
  return null;
}

export function extractFactors(text: string, charge: Charge): Record<string, FactorValue> {
  const out: Record<string, FactorValue> = {
    surrender: /自首/.test(text),
    compensation: /赔偿|退赔|退赃/.test(text),
    plea: /认罪/.test(text),
    record: /前科|累犯/.test(text),
  };
  if (charge === 'theft' || charge === 'fraud') {
    out['amount'] = parseAmount(text);
    out['gang'] = /团伙|结伙|伙同/.test(text);
  }
  if (charge === 'theft') {
    out['weapon'] = /持械|持刀|棍棒/.test(text);
    out['home'] = /入户/.test(text);
  }
  if (charge === 'injury') {
    out['level'] = parseLevel(text);
    out['premeditation'] = /预谋|踩点|蓄意/.test(text);
    out['weapon'] = /持械|持刀|棍棒/.test(text);
  }
  if (charge === 'fraud') {
    out['victims'] = parseVictims(text);
  }
  return out;
}

export function detectCharge(text: string): Charge | null {
  if (/盗窃|入户|工单|电动车|仓库|首饰|手机/.test(text)) return 'theft';
  if (/伤害|轻伤|重伤|打伤|砍/.test(text)) return 'injury';
  if (/诈骗|受害人/.test(text)) return 'fraud';
  return null;
}

const CORE_FACTORS = ['surrender', 'compensation', 'plea', 'record'];

const EXTENSION_FACTORS: Record<Charge, string[]> = {
  theft: ['amount', 'gang', 'weapon', 'home'],
  injury: ['level', 'premeditation', 'weapon'],
  fraud: ['amount', 'victims', 'gang'],
};

export function applicableFactors(charge: Charge): string[] {
  return [...CORE_FACTORS, ...(EXTENSION_FACTORS[charge] ?? [])];
}

export function extractionAccuracy(
  extracted: Record<string, FactorValue>,
  gold: GoldFactors,
  charge: Charge
): { correct: number; total: number } {
  let correct = 0;
  let total = 0;
  for (const f of applicableFactors(charge)) {
    const e = extracted[f] ?? null;
    const g = (gold as unknown as Record<string, FactorValue>)[f] ?? null;
    if (JSON.stringify(e) === JSON.stringify(g)) correct += 1;
    total += 1;
  }
  return { correct, total };
}
