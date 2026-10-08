// sync.ts —— 对照组：同步工具调用
//
// 官方实验 sync 组（async: false）：完整调用项到达后执行查询，
// 工具结果到达前没有后续文本；最终选择 A。
// Ollama 天然就是同步语义：模型发出工具调用后回合结束，工具执行 8 秒期间
// 模型没有任何输出，结果回灌后才继续。我们记录时间线验证这一点。

import { Ollama } from 'ollama';
import { chat, type ChatArgs } from './llm.js';
import { lookupVenues, LOOKUP_SCHEMA } from './tools.js';
import { INITIAL_BUDGET, INITIAL_PEOPLE, SYSTEM_PROMPT, TASK_TABLE, verify } from './shared.js';

export async function runSync(args: Pick<ChatArgs, 'client' | 'model'>): Promise<void> {
  console.log('\n' + '='.repeat(74));
  console.log('  sync ｜ 同步工具调用：查询期间模型零输出，结果到达后继续');
  console.log('='.repeat(74));
  console.log(`  任务表（不在提示词内，须经工具返回）：\n${TASK_TABLE}`);
  console.log(`  初始条件：预算 ${INITIAL_BUDGET} / 人数 ${INITIAL_PEOPLE}（正确选择应为 A）`);

  const { client, model } = args;
  const t0 = Date.now();
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT } as const,
    {
      role: 'user',
      content: `为一次模拟会议选择满足人数与预算的最便宜场地。当前预算 ${INITIAL_BUDGET}，人数 ${INITIAL_PEOPLE}。请调用 lookup_venues 获取场地数据后给出结论。`,
    } as const,
  ];

  // 回合 1：模型应发出 lookup_venues 工具调用
  const r1 = await chat({ client, model, messages: messages as never, tools: [LOOKUP_SCHEMA], stream: false });
  const call = r1.message.tool_calls?.[0];
  if (!call) {
    console.log('  ✘ 模型未调用 lookup_venues，实验无法继续');
    return;
  }
  console.log(`  [t=${((Date.now() - t0) / 1000).toFixed(2)}s] 模型发出工具调用：${call.function.name}`);
  console.log('  同步阻塞：工具执行 8 秒，期间模型无任何输出……');

  const toolStart = Date.now();
  const result = await lookupVenues();
  console.log(`  [t=${((Date.now() - t0) / 1000).toFixed(2)}s] 工具返回（耗时 ${((Date.now() - toolStart) / 1000).toFixed(1)}s）`);
  console.log(`  receipt = ${result.receipt}`);

  // 回灌工具结果
  messages.push(
    { role: 'assistant', content: r1.message.content ?? '', tool_calls: r1.message.tool_calls } as never,
    { role: 'tool', content: JSON.stringify(result) } as never,
  );

  // 回合 2：最终结论
  const r2 = await chat({ client, model, messages: messages as never, stream: false });
  const answer = r2.message.content ?? '';
  console.log(`  [t=${((Date.now() - t0) / 1000).toFixed(2)}s] 最终答案：`);
  console.log(`  >>> ${answer.replace(/\n/g, '\n  >>> ')}`);

  console.log('\n  验收：');
  verify(answer, { receipt: result.receipt, choice: 'A', source: true });
}
