// tools.ts —— 实验 6-3 受控场地任务
//
// lookup_venues：模拟 8 秒延迟返回候选场地表 + 随机回执 receipt。
// 任务表固定如下（初始预算 2000 / 人数 20 → 应选 A；更新为 1000 / 10 → 应选 B）：

import { sleep } from './llm.js';

export interface Venue {
  name: string;
  price: number;
  capacity: number;
}

export const VENUE_TABLE: Venue[] = [
  { name: 'A', price: 1800, capacity: 30 },
  { name: 'B', price: 900, capacity: 12 },
  { name: 'C', price: 600, capacity: 8 },
];

export const LOOKUP_SCHEMA = {
  type: 'function',
  function: {
    name: 'lookup_venues',
    description: '查询候选会议场地（模拟 8 秒延迟）。返回场地价格、容量表和随机回执 receipt。',
    parameters: { type: 'object', properties: {} },
  },
};

export interface LookupResult {
  venues: Venue[];
  receipt: string;
}

/** 等待 8 秒后返回场地表与一个新生成的随机 receipt */
export async function lookupVenues(): Promise<LookupResult> {
  await sleep(8000);
  const receipt = Math.random().toString(36).slice(2, 10);
  return { venues: VENUE_TABLE, receipt };
}
