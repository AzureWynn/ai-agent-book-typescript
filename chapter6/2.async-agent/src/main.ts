// main.ts —— 统一命令行入口（对应官方 demo.py）
//
// 用法（见 package.json scripts）：
//   npm run demo       → 依次运行三个离线演示（并行 / 打断 / 检查点），无需 Ollama
//   npm run parallel   → 只跑并行 vs 串行墙钟对比
//   npm run interrupt  → 只跑打断与恢复
//   npm run state      → 只跑检查点持久化与跨会话恢复
//   npm run llm        → 用真实 Ollama 依次跑三个在线场景
//   npm run llm -- 1|2|3 → 只跑指定的在线场景

import 'dotenv/config';
import { OFFLINE_DEMOS } from './demos.js';
import { AgentRuntime } from './runtime.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function banner(title: string): void {
  console.log('\n' + '='.repeat(78));
  console.log(`  ${title}`);
  console.log('='.repeat(78));
}

function makeRuntime(): AgentRuntime {
  const model = process.env.OLLAMA_MODEL ?? 'gemma4:latest';
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const rt = new AgentRuntime({ model, baseUrl });
  rt.log('SYSTEM', `模型 ${model}；Ollama 服务 ${baseUrl}`);
  return rt;
}

/** 场景 1｜异步工具调用：下达任务后 LLM 立即返回占位符，不阻塞；
 *  后台任务自然完成 → 以 async.result 新事件回灌 → LLM 汇总最终结论 */
async function llmAsyncTool(): Promise<void> {
  banner('在线场景 1｜异步工具调用：启动后台任务，不阻塞等待');
  const rt = makeRuntime();
  const serve = rt.serve();
  rt.submitUserMessage('启动两个后台任务：分析日志并总结异常，然后报告完成情况');
  await rt.waitUntilIdle(3000, 120000);
  rt.stop();
  await serve;
  console.log('\n  验证点：run_terminal_command 异步启动立即返回 task_id；完成后以新事件注入对话。\n');
}

/** 场景 2｜打断：轮询直到后台任务真实启动，再提交"取消"，
 *  验证打断同时取消当前 turn 与所有后台任务，并留痕 */
async function llmInterrupt(): Promise<void> {
  banner('在线场景 2｜打断：取消正在运行的 turn 与后台任务');
  const rt = makeRuntime();
  const serve = rt.serve();
  rt.submitUserMessage('启动两个后台任务：分析日志并总结异常');
  // 轮询直到后台任务真实启动（LLM 决策耗时不定，用状态而非时间对齐）
  const deadline = Date.now() + 60000;
  while (!rt.tasks.anyRunning() && Date.now() < deadline) await sleep(200);
  rt.log('SYSTEM', '检测到后台任务已启动，现在提交打断……');
  rt.submitUserMessage('取消');
  await rt.waitUntilIdle(2000, 120000);
  rt.stop();
  await serve;
  console.log('\n  验证点：打断统一取消后台任务；系统恢复后可继续接受新任务。\n');
}

/** 场景 3｜排队批量处理：任务运行期间下达补充指令（DEFERRED → pending），
 *  异步结果到达时把 pending 与 async.result 一次性批量追加 */
async function llmBatching(): Promise<void> {
  banner('在线场景 3｜排队批量处理：补充指令与异步结果批量追加');
  const rt = makeRuntime();
  const serve = rt.serve();
  rt.submitUserMessage('启动一个后台任务：分析日志并总结异常');
  await sleep(1500);
  rt.log('SYSTEM', '后台任务运行中，下达补充指令（应进入 pending，不打断后台）……');
  rt.submitUserMessage('用日语回复你的最终结论');
  await rt.waitUntilIdle(3000, 120000);
  rt.stop();
  await serve;
  console.log('\n  验证点：补充指令先进 pending；异步结果到达时批量追加，一次触发 LLM。\n');
}

const LLM_SCENARIOS: Record<string, () => Promise<void>> = {
  '1': llmAsyncTool,
  '2': llmInterrupt,
  '3': llmBatching,
};

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === 'llm') {
    const which = process.argv[3];
    if (which && LLM_SCENARIOS[which]) {
      await LLM_SCENARIOS[which]();
      return;
    }
    await llmAsyncTool();
    await llmInterrupt();
    await llmBatching();
    return;
  }
  const demo = arg ? OFFLINE_DEMOS[arg as keyof typeof OFFLINE_DEMOS] : undefined;
  if (demo) {
    await demo();
    return;
  }
  // 默认：三个离线演示全部跑一遍（无需任何 API key）
  await OFFLINE_DEMOS.parallel();
  await OFFLINE_DEMOS.interrupt();
  await OFFLINE_DEMOS.state();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
