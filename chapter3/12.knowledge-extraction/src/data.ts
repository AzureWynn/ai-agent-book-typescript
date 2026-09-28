import { CaseItem, Charge, GoldFactors } from './types.js';

function blank(): GoldFactors {
  return {
    surrender: false, compensation: false, plea: false, record: false,
    amount: null, gang: false, weapon: false, home: false,
    level: null, premeditation: false, victims: null,
  };
}

export function labelFor(charge: Charge, g: GoldFactors, noise: number): number {
  let m = 0;
  if (charge === 'theft') {
    m = 6 + Math.min((g.amount ?? 0) / 5000, 4) * 12
      + (g.gang ? 12 : 0) + (g.weapon ? 12 : 0) + (g.home ? 6 : 0)
      - (g.surrender ? 6 : 0) - (g.compensation ? 4 : 0) - (g.plea ? 3 : 0)
      + (g.record ? 6 : 0);
  } else if (charge === 'injury') {
    const base = g.level === '重伤' ? 36 : g.level === '轻伤' ? 8 : 2;
    m = base + (g.premeditation ? 8 : 0) + (g.weapon ? 6 : 0)
      - (g.surrender ? 4 : 0) - (g.compensation ? 3 : 0) - (g.plea ? 2 : 0)
      + (g.record ? 5 : 0);
  } else {
    m = 6 + Math.min((g.amount ?? 0) / 10000, 4) * 12 + Math.min(g.victims ?? 0, 5) * 2
      + (g.gang ? 10 : 0)
      - (g.surrender ? 5 : 0) - (g.compensation ? 3 : 0) - (g.plea ? 2 : 0)
      + (g.record ? 5 : 0);
  }
  return Math.max(1, Math.round(m + noise));
}

interface RawCase {
  id: string;
  charge: Charge;
  fact: string;
  gold: Partial<GoldFactors> & { amount?: number | null; victims?: number | null; level?: GoldFactors['level'] };
  noise: number;
}

const RAW: RawCase[] = [
  { id: 't1', charge: 'theft', fact: '张某盗窃电动车一辆价值8000元，案发后自首，主动赔偿损失并认罪认罚。', gold: { amount: 8000, surrender: true, compensation: true, plea: true }, noise: 0 },
  { id: 't2', charge: 'theft', fact: '李某伙同他人团伙盗窃仓库货物价值60000元，有前科。', gold: { amount: 60000, gang: true, record: true }, noise: 1 },
  { id: 't3', charge: 'theft', fact: '王某入户盗窃现金3000元。', gold: { amount: 3000, home: true }, noise: 0 },
  { id: 't4', charge: 'theft', fact: '赵某持刀盗窃首饰价值20000元，案发后自首。', gold: { amount: 20000, weapon: true, surrender: true }, noise: -1 },
  { id: 't5', charge: 'theft', fact: '刘某团伙入户盗窃价值50000元，有前科，后赔偿损失并认罪认罚。', gold: { amount: 50000, gang: true, home: true, record: true, compensation: true, plea: true }, noise: 2 },
  { id: 't6', charge: 'theft', fact: '陈某盗窃手机一部价值1500元，案发后自首。', gold: { amount: 1500, surrender: true }, noise: 0 },
  { id: 't7', charge: 'theft', fact: '孙某持械团伙盗窃价值120000元，有前科，认罪认罚。', gold: { amount: 120000, gang: true, weapon: true, record: true, plea: true }, noise: -2 },
  { id: 'j1', charge: 'injury', fact: '周某与人争执致对方轻微伤，案发后自首并赔偿。', gold: { level: '轻微伤', surrender: true, compensation: true }, noise: 0 },
  { id: 'j2', charge: 'injury', fact: '吴某打伤他人致轻伤二级。', gold: { level: '轻伤' }, noise: 1 },
  { id: 'j3', charge: 'injury', fact: '郑某预谋后持刀将人砍成重伤二级，有前科。', gold: { level: '重伤', premeditation: true, weapon: true, record: true }, noise: 2 },
  { id: 'j4', charge: 'injury', fact: '冯某致人轻伤，案发后自首，认罪认罚并赔偿。', gold: { level: '轻伤', surrender: true, plea: true, compensation: true }, noise: 1 },
  { id: 'j5', charge: 'injury', fact: '褚某致人重伤二级，案发后自首。', gold: { level: '重伤', surrender: true }, noise: 0 },
  { id: 'j6', charge: 'injury', fact: '卫某致人轻微伤，有前科。', gold: { level: '轻微伤', record: true }, noise: -1 },
  { id: 'j7', charge: 'injury', fact: '蒋某事先踩点后持械致人轻伤，认罪认罚。', gold: { level: '轻伤', premeditation: true, weapon: true, plea: true }, noise: 1 },
  { id: 'f1', charge: 'fraud', fact: '沈某诈骗3名受害人共30000元，案发后自首并赔偿。', gold: { amount: 30000, victims: 3, surrender: true, compensation: true }, noise: 0 },
  { id: 'f2', charge: 'fraud', fact: '韩某诈骗1人5000元。', gold: { amount: 5000, victims: 1 }, noise: 0 },
  { id: 'f3', charge: 'fraud', fact: '杨某团伙诈骗8人共200000元，有前科。', gold: { amount: 200000, victims: 8, gang: true, record: true }, noise: 1 },
  { id: 'f4', charge: 'fraud', fact: '朱某诈骗2人8000元，认罪认罚。', gold: { amount: 8000, victims: 2, plea: true }, noise: -1 },
  { id: 'f5', charge: 'fraud', fact: '秦某诈骗5人60000元，案发后自首，赔偿并认罪认罚。', gold: { amount: 60000, victims: 5, surrender: true, compensation: true, plea: true }, noise: 1 },
  { id: 'f6', charge: 'fraud', fact: '尤某诈骗1人2000元，有前科。', gold: { amount: 2000, victims: 1, record: true }, noise: 0 },
  { id: 'f7', charge: 'fraud', fact: '许某团伙诈骗12人150000元，案发后自首。', gold: { amount: 150000, victims: 12, gang: true, surrender: true }, noise: 2 },
];

export const CASES: CaseItem[] = RAW.map((r) => {
  const gold = { ...blank(), ...r.gold };
  return { id: r.id, charge: r.charge, fact: r.fact, gold, labelMonths: labelFor(r.charge, gold, r.noise) };
});

export const CHARGE_CN: Record<Charge, string> = { theft: '盗窃罪', injury: '故意伤害罪', fraud: '诈骗罪' };
