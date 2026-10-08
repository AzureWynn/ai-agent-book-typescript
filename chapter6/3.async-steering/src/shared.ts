// shared.ts —— 实验 6-3 共用常量与验收辅助

import { VENUE_TABLE } from './tools.js';

export const INITIAL_BUDGET = 2000;
export const INITIAL_PEOPLE = 20;
export const UPDATED_BUDGET = 1000;
export const UPDATED_PEOPLE = 10;

export const SYSTEM_PROMPT = `你是一个会议场地选择助手。任务：为一次模拟会议选择满足人数与预算的最便宜场地。

候选场地数据必须通过调用 lookup_venues 工具获取（该工具会延迟 8 秒返回场地表与一个随机回执 receipt）。
场地表不在提示词里，你必须调用工具后才能看到价格与容量。

场地判断规则：
- 场地必须同时满足：价格 <= 预算 且 容量 >= 人数。
- 满足条件的场地中，选价格最低的。

最终答案要求：
1. 明确说出选择的场地名（A/B/C）与理由。
2. 必须引用工具返回的随机回执 receipt。
3. 答案末尾标注 source: demo。`;

export const TASK_TABLE = VENUE_TABLE.map(
  (v) => `${v.name}: 价格 ${v.price} / 容量 ${v.capacity}`,
).join('\n');

/** 简单验收：检查最终文本是否包含关键点，逐条打印 */
export function verify(output: string, expects: { receipt?: string; choice?: string; source?: boolean }): void {
  const checks: Array<[string, boolean]> = [];
  if (expects.receipt) checks.push([`引用回执 ${expects.receipt}`, output.includes(expects.receipt)]);
  if (expects.choice) checks.push([`选择场地 ${expects.choice}`, output.includes(expects.choice)]);
  if (expects.source) checks.push(['标注 source: demo', output.includes('source: demo')]);
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? '✔' : '✘'} ${label}`);
  }
}
