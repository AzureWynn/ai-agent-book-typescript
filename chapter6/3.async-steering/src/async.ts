// async.ts —— 对照二：原生异步工具调用（Ollama 框架级模拟）
//
// 官方实验 async 组（async: true）：工具执行期间模型继续输出独立准备清单，
// 不阻塞等待；最终选择 A。
//
// Ollama 的 chat 接口没有原生 async 工具语义：模型发出工具调用后回合即结束。
// 我们用"框架级模拟"复现观察到的行为：工具在后台执行（不阻塞），
// 同时并行发起一次流式生成"独立准备清单"（与场地数据无关），
// 展示"工具执行期间模型仍在产出内容"。工具结果到达后再回灌给出最终结论。

import { chat, type ChatArgs } from './llm.js';
import { lookupVenues, LOOKUP_SCHEMA } from './tools.js';
import { INITIAL_BUDGET, INITIAL_PEOPLE, SYSTEM_PROMPT, TASK_TABLE, verify } from './shared.js';

const PREP_PROMPT = `你在等待场地查询结果返回。请先独立输出一份"会议准备清单"，
内容与场地数据完全无关（例如议程安排、参会须知、物料清单等），5 条左右即可。`;

export async function runAsync(args: Pick<ChatArgs, 'client' | 'model'>): Promise<void> {
  console.log('\n' + '='.repeat(74));
  console.log('  async ｜ 异步工具调用（模拟）：工具执行期间模型继续输出准备清单');
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

  // 回合 1：模型发出工具调用
  const r1 = await chat({ client, model, messages: messages as never, tools: [LOOKUP_SCHEMA], stream: false });
  const call = r1.message.tool_calls?.[0];
  if (!call) {
    console.log('  ✘ 模型未调用 lookup_venues，实验无法继续');
    return;
  }
  console.log(`  [t=${((Date.now() - t0) / 1000).toFixed(2)}s] 模型发出工具调用：${call.function.name}`);
  console.log('  后台启动工具（不阻塞），同时并行生成独立准备清单……');

  // 工具后台执行（8 秒）；并行流式生成准备清单。
  // 工具完成即打印（不等待清单生成完），直观展示"并行"。
  const toolPromise = lookupVenues().then((result) => {
    console.log(`\n  [t=${((Date.now() - t0) / 1000).toFixed(2)}s] 工具返回（与准备清单生成并行）`);
    console.log(`  receipt = ${result.receipt}`);
    return result;
  });
  const prepOutcome = await chat({
    client,
    model,
    messages: [{ role: 'user', content: PREP_PROMPT }] as never,
    stream: true,
    onToken: (t) => {
      process.stdout.write(t);
    },
  });

  // 取工具结果（若尚未完成则等待）
  const result = await toolPromise;
  console.log(`  准备清单内容：${prepOutcome.message.content?.slice(0, 60)}…`);

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
