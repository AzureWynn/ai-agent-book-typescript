// steer.ts —— 对照三：回合中途引导（steering）
//
// 官方实验 async_steer 组：工具任务已启动、结果尚未完成时发送 steering，
// 两条更新同时生效；工具只执行一次；真实结果仍用原始 call_id 归还；最终选择 B。
//
// Ollama 没有原生 steering（同连接 response.steer），我们实现"框架级替换式 steering"：
// 工具执行期间用户更新到达 -> 用 AbortController 中止当前回合的生成 -> 把更新作为
// 新用户消息注入 -> 待工具结果（原始 call_id）返回后，携带新条件重启生成。
// 教学点：中途引导不是简单"追加一条消息"，而是要中断正在执行的回合并以新条件重启。

import { chat, type ChatArgs } from './llm.js';
import { lookupVenues, LOOKUP_SCHEMA } from './tools.js';
import { INITIAL_BUDGET, INITIAL_PEOPLE, SYSTEM_PROMPT, TASK_TABLE, UPDATED_BUDGET, UPDATED_PEOPLE, verify } from './shared.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runSteer(args: Pick<ChatArgs, 'client' | 'model'>): Promise<void> {
  console.log('\n' + '='.repeat(74));
  console.log('  steer ｜ 回合中途引导：工具执行中更新条件，中止生成并以新条件重启');
  console.log('='.repeat(74));
  console.log(`  任务表（不在提示词内，须经工具返回）：\n${TASK_TABLE}`);
  console.log(`  初始条件：预算 ${INITIAL_BUDGET} / 人数 ${INITIAL_PEOPLE}`);
  console.log(`  中途更新：预算 ${UPDATED_BUDGET} / 人数 ${UPDATED_PEOPLE}（两条都生效时应选择 B）`);

  const { client, model } = args;
  const t0 = Date.now();
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT } as const,
    {
      role: 'user',
      content: `为一次模拟会议选择满足人数与预算的最便宜场地。当前预算 ${INITIAL_BUDGET}，人数 ${INITIAL_PEOPLE}。请调用 lookup_venues 获取场地数据后给出结论。`,
    } as const,
  ];

  // 回合 1：流式生成，模型发出工具调用后工具在后台执行（8 秒）
  let streamHandle: { abort: () => void } | undefined;
  let call = undefined as { function: { name: string } } | undefined;
  let r1Content = '';
  const r1 = await chat({
    client,
    model,
    messages: messages as never,
    tools: [LOOKUP_SCHEMA],
    stream: true,
    onToken: (t) => {
      r1Content += t;
      if (r1Content.length <= 80) process.stdout.write(t);
    },
  });
  streamHandle = r1.stream;
  call = r1.message.tool_calls?.[0];
  if (!call) {
    console.log('  ✘ 模型未调用 lookup_venues，实验无法继续');
    return;
  }
  console.log(`\n  [t=${((Date.now() - t0) / 1000).toFixed(2)}s] 模型发出工具调用：${call.function.name}（工具启动，8 秒后返回）`);

  // 工具后台执行
  const toolPromise = lookupVenues();

  // 工具执行期间，用户更新到达 -> 框架级替换式 steering
  await sleep(2000);
  console.log(`  [t=${((Date.now() - t0) / 1000).toFixed(2)}s] 用户更新到达：预算 ${UPDATED_BUDGET} / 人数 ${UPDATED_PEOPLE}`);
  console.log('  steering：中止当前回合生成（AbortController），注入更新条件……');
  streamHandle?.abort();

  // 注入更新作为新用户消息（在工具结果之后、重启生成之前加入对话）
  const updateMessage = {
    role: 'user',
    content: `[用户更新] 条件已变化：预算改为 ${UPDATED_BUDGET}，人数改为 ${UPDATED_PEOPLE}。请基于最新条件重新给出结论。`,
  } as const;

  // 等待真实工具结果（工具只执行一次，结果用原始 call_id 归还）
  const result = await toolPromise;
  console.log(`  [t=${((Date.now() - t0) / 1000).toFixed(2)}s] 工具返回（执行一次）`);
  console.log(`  receipt = ${result.receipt}`);

  // 回灌工具结果 + 更新条件
  messages.push(
    { role: 'assistant', content: r1.message.content ?? '', tool_calls: r1.message.tool_calls } as never,
    { role: 'tool', content: JSON.stringify(result) } as never,
    updateMessage as never,
  );

  // 回合 2：携带新条件重启生成
  console.log('  重启生成（新条件生效）……');
  const r2 = await chat({ client, model, messages: messages as never, stream: false });
  const answer = r2.message.content ?? '';
  console.log(`  [t=${((Date.now() - t0) / 1000).toFixed(2)}s] 最终答案：`);
  console.log(`  >>> ${answer.replace(/\n/g, '\n  >>> ')}`);

  console.log('\n  验收：');
  verify(answer, { receipt: result.receipt, choice: 'B', source: true });
}
