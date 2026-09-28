import { CASES } from './data.js';
import { Charge, FactorSchema } from './types.js';

export const FACTOR_LABELS: Record<string, string> = {
  surrender: '自首', compensation: '赔偿', plea: '认罪认罚', record: '前科',
  amount: '涉案金额', gang: '团伙作案', weapon: '持械', home: '入户',
  level: '伤害等级', premeditation: '预谋', victims: '受害人数',
};

const CUES: Array<{ factor: string; charges: Charge[]; re: RegExp }> = [
  { factor: 'surrender', charges: ['theft', 'injury', 'fraud'], re: /自首/ },
  { factor: 'compensation', charges: ['theft', 'injury', 'fraud'], re: /赔偿|退赔|退赃/ },
  { factor: 'plea', charges: ['theft', 'injury', 'fraud'], re: /认罪/ },
  { factor: 'record', charges: ['theft', 'injury', 'fraud'], re: /前科|累犯/ },
  { factor: 'amount', charges: ['theft', 'fraud'], re: /\d+(?:\.\d+)?万元|\d+元/ },
  { factor: 'gang', charges: ['theft', 'fraud'], re: /团伙|结伙|伙同/ },
  { factor: 'weapon', charges: ['theft', 'injury'], re: /持械|持刀|棍棒/ },
  { factor: 'home', charges: ['theft'], re: /入户/ },
  { factor: 'level', charges: ['injury'], re: /轻微伤|轻伤二级|重伤二级|轻伤|重伤/ },
  { factor: 'premeditation', charges: ['injury'], re: /预谋|踩点|蓄意/ },
  { factor: 'victims', charges: ['fraud'], re: /\d+名受害人|\d+人/ },
];

export interface DiscoveryHit {
  factor: string;
  charges: Charge[];
  supportingCases: string[];
}

export function discoverFactors(): DiscoveryHit[] {
  return CUES.map((cue) => ({
    factor: cue.factor,
    charges: cue.charges,
    supportingCases: CASES.filter((c) => cue.charges.includes(c.charge) && cue.re.test(c.fact)).map((c) => c.id),
  })).filter((h) => h.supportingCases.length > 0);
}

export function mergeSchema(hits: DiscoveryHit[]): FactorSchema {
  const inAll = (f: string): boolean =>
    (['theft', 'injury', 'fraud'] as Charge[]).every((ch) =>
      hits.some((h) => h.factor === f && h.charges.includes(ch))
    );
  const core = [...new Set(hits.filter((h) => inAll(h.factor)).map((h) => h.factor))];
  const extensions = {} as Record<Charge, string[]>;
  for (const ch of ['theft', 'injury', 'fraud'] as Charge[]) {
    extensions[ch] = [...new Set(hits.filter((h) => h.charges.includes(ch) && !core.includes(h.factor)).map((h) => h.factor))];
  }
  return { core, extensions };
}

export function discoverSchema(): { schema: FactorSchema; hits: DiscoveryHit[] } {
  const hits = discoverFactors();
  return { schema: mergeSchema(hits), hits };
}
