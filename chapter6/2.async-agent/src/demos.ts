// demos.ts —— 三个离线演示（无需 LLM / API key，对应官方 async_demos.py）
//
// 直接驱动异步运行时的底层原语，把实验 6-2 的三项核心异步能力
// 用可测量、可复现的方式演示：
//   - demoParallel  ：并行 vs 串行工具调用的【墙钟时间】对比（真实测量，打印加速比）。
//   - demoInterrupt ：长任务运行中被【打断/取消】，随后系统【恢复】并接受新任务。
//   - demoState     ：Agent 状态【检查点持久化】到磁盘，再【跨会话恢复】并校验。
// 三个演示共同回答「异步到底带来了什么」——用数字和状态变化说话，而不只是措辞。

import { defaultCheckpointPath, formatLog, AgentRuntime } from './runtime.js';
import { makeEvent } from './events.js';
import { TaskManager, type TaskState } from './tasks.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Logger {
  readonly t0 = Date.now();
  call(source: string, text: string): void {
    console.log(formatLog(this.t0, source, text));
  }
}

function banner(title: string): void {
  console.log('\n' + '='.repeat(78));
  console.log(`  ${title}`);
  console.log('='.repeat(78));
}

// ============================ 1. 并行 vs 串行 ============================
// 一组相互独立的【只读感知工具】（读文件 / 搜索 / 查库 / 向量检索）。
// 只读、无副作用，因此可以安全地并行——这正是书中「感知工具天然适合并行」的落点。
const PERCEIVE_TOOLS: Array<[string, number]> = [
  ['read_config.json', 0.8],
  ['web_search(异步 Agent)', 1.2],
  ['db_query(orders)', 1.5],
  ['vector_lookup(memory)', 1.0],
];

async function perceive(name: string, latency: number, log: Logger): Promise<void> {
  const t0 = Date.now();
  log.call('TOOL', `→ ${name} 启动（模拟 I/O 耗时 ${latency.toFixed(1)}s）`);
  await sleep(latency * 1000);
  log.call('TOOL', `✓ ${name} 完成（实测 ${((Date.now() - t0) / 1000).toFixed(2)}s）`);
}

export async function demoParallel(): Promise<void> {
  banner('能力一｜并行工具调用：并行 vs 串行的墙钟时间对比');
  const log = new Logger();
  log.call('SYSTEM', '有 4 个相互独立的只读感知工具需要调用（无副作用，可安全并行）。');

  // —— 串行：一个 await 完再 await 下一个 ——
  log.call('SYSTEM', '[串行] 逐个 await（同步 ReAct 的默认做法）……');
  const seqStart = Date.now();
  for (const [name, lat] of PERCEIVE_TOOLS) await perceive(name, lat, log);
  const seqTotal = (Date.now() - seqStart) / 1000;

  // —— 并行：一次性发起，Promise.all 并发等待 ——
  log.call('SYSTEM', '[并行] 一次性发起，Promise.all 并发等待……');
  const parStart = Date.now();
  await Promise.all(PERCEIVE_TOOLS.map(([name, lat]) => perceive(name, lat, log)));
  const parTotal = (Date.now() - parStart) / 1000;

  const slowest = Math.max(...PERCEIVE_TOOLS.map(([, lat]) => lat));
  const speedup = parTotal ? seqTotal / parTotal : Infinity;

  console.log('\n  ── 结果对比 ─────────────────────────────────────────────');
  console.log(`  ${'工具'.padEnd(26)}${'标称延迟'.padStart(10)}`);
  for (const [name, lat] of PERCEIVE_TOOLS) {
    console.log(`  ${name.padEnd(26)}${lat.toFixed(1).padStart(9)}s`);
  }
  console.log('  ─────────────────────────────────────────────────────────');
  console.log(`  ${'串行总耗时（Σ 各工具）'.padEnd(26)}${seqTotal.toFixed(2).padStart(8)}s`);
  console.log(`  ${'并行总耗时（Promise.all）'.padEnd(26)}${parTotal.toFixed(2).padStart(8)}s`);
  console.log(`  ${'并行理论下界（最慢单个）'.padEnd(26)}${slowest.toFixed(2).padStart(8)}s`);
  console.log(`  ${'加速比 = 串行 / 并行'.padEnd(26)}${speedup.toFixed(2).padStart(8)}x`);
  console.log('  ─────────────────────────────────────────────────────────');
  console.log('  结论：独立的只读调用并行化后，墙钟时间由「求和」降到「取最大」。\n');
}

// ============================ 2. 打断 / 取消 / 恢复 ============================
async function waitUntilDone(tm: TaskManager, taskId: string): Promise<TaskState> {
  for (;;) {
    const st = tm.query(taskId);
    if (st && st.status === 'completed') return st;
    await sleep(50);
  }
}

export async function demoInterrupt(): Promise<void> {
  banner('能力二｜打断与取消：长任务运行中被打断，随后系统恢复');
  const log = new Logger();
  const completed: TaskState[] = [];
  const tm = new TaskManager({ onComplete: (st) => completed.push(st) });

  // 1) 并行启动三个后台异步任务（fast/mid/slow）
  log.call('SYSTEM', '启动三个并行后台分析任务（fast/mid/slow）……');
  tm.start('python analyze_fast.py', { totalTicks: 10, tickMs: 100 });
  tm.start('python analyze_mid.py', { totalTicks: 20, tickMs: 100 });
  tm.start('python analyze_slow.py', { totalTicks: 30, tickMs: 100 });

  // 2) 运行期间用户即时提问 —— 后台任务不被阻塞
  await sleep(1000);
  const now = new Date().toTimeString().slice(0, 8);
  log.call('USER', '（即时提问）现在几点了？');
  log.call('AGENT', `现在 ${now}。三个后台任务仍在并行推进，未被这次提问阻塞。`);

  // 3) 跑到中途，用户发出打断 —— 立即取消所有在跑的任务
  await sleep(1000);
  log.call('USER', '（打断）取消');
  const cancelled = tm.cancelAll();
  await sleep(50); // 让取消在各任务内部落地
  log.call(
    'SYSTEM',
    `已执行打断：取消了 ${cancelled.length ? cancelled.map((c) => c.taskId).join(', ') : '（无）'}（进度在被取消处冻结）`,
  );

  console.log('\n  ── 打断后各任务状态（进度冻结在中途）───────────────────');
  console.log(`  ${'task_id'.padEnd(8)}${'命令'.padEnd(26)}${'状态'.padEnd(12)}${'进度'.padStart(6)}`);
  for (const s of tm.allStates()) {
    console.log(`  ${s.taskId.padEnd(8)}${s.command.padEnd(26)}${s.status.padEnd(12)}${String(s.progress).padStart(5)}%`);
  }
  console.log('  ─────────────────────────────────────────────────────────');

  // 4) 恢复：TaskManager 依然健康，接受并跑完一个新任务
  log.call('SYSTEM', '打断处理完毕，系统恢复空闲，可继续接受新任务……');
  const fresh = tm.start('python re_run_summary.py', { totalTicks: 6, tickMs: 100 });
  const last = await waitUntilDone(tm, fresh.taskId);
  log.call('AGENT', `已从打断中恢复，新任务 ${fresh.taskId} 正常完成：${(last.result ?? '').slice(0, 36)}……`);
  console.log('  结论：打断只冻结被取消的任务，运行时本身无损，可立即继续工作。\n');
}

// ============================ 3. 状态检查点：持久化 / 恢复 ============================
function seedTrajectory(rt: AgentRuntime): void {
  // 给运行时灌入一段「已发生」的对话轨迹，模拟会话进行到一半
  rt.append(makeEvent('user.input', '用户消息：分析日志', { role: 'user', content: '分析今天的日志并总结异常' }));
  rt.append(
    makeEvent('agent.tool_call', '调用工具 run_terminal_command', {
      role: 'assistant',
      content: '好的，我这就在后台启动分析。',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'run_terminal_command', arguments: { command: 'python analyze_fast.py' } },
        },
      ],
    }),
  );
  rt.append(
    makeEvent('tool.result', '工具结果 run_terminal_command', {
      role: 'tool',
      tool_call_id: 'call_1',
      content: '命令已在后台异步启动。task_id=T1。',
    }),
  );
}

export async function demoState(): Promise<void> {
  banner('能力三｜状态管理：检查点持久化与跨会话恢复');
  const log = new Logger();
  const ckptPath = defaultCheckpointPath();

  // —— 会话 A：产生一段轨迹 + 两个仍在运行的后台任务，然后落盘 ——
  log.call('SYSTEM', '会话 A 开始：构造轨迹并启动两个后台任务……');
  const rtA = new AgentRuntime({ model: 'demo-offline', offline: true });
  rtA.t0 = log.t0; // 让运行时与演示共享同一时间基准，便于观察相对时刻
  seedTrajectory(rtA);
  rtA.tasks.start('python analyze_fast.py', { totalTicks: 20, tickMs: 150 });
  rtA.tasks.start('python analyze_slow.py', { totalTicks: 40, tickMs: 150 });
  await sleep(1200); // 让进度累积到中途

  const beforeTraj = rtA.trajectory.length;
  const beforeTasks = new Map(rtA.tasks.allStates().map((s) => [s.taskId, s.progress] as const));
  rtA.saveCheckpoint(ckptPath);

  // 模拟进程退出：取消所有活着的任务，销毁内存中的运行时
  rtA.tasks.cancelAll();
  await sleep(50);
  log.call('SYSTEM', '会话 A 结束（进程退出，内存中的运行时已销毁）。');

  // —— 会话 B：全新运行时，从磁盘恢复 ——
  log.call('SYSTEM', '会话 B 开始：新建空运行时，从检查点恢复……');
  const rtB = new AgentRuntime({ model: 'demo-offline', offline: true });
  rtB.t0 = log.t0;
  const data = rtB.loadCheckpoint(ckptPath);
  const afterTraj = rtB.trajectory.length;
  const msgs = rtB.buildMessages(); // 证明恢复后能重建可喂给 LLM 的上下文

  console.log('\n  ── 恢复校验 ─────────────────────────────────────────────');
  console.log(
    `  轨迹事件数     保存前 ${beforeTraj}  ->  恢复后 ${afterTraj}  [${beforeTraj === afterTraj ? '一致 ✓' : '不一致 ✗'}]`,
  );
  console.log(`  可重建 LLM 上下文消息 ${msgs.length} 条（system + 轨迹回放）`);
  console.log(`  ${'task_id'.padEnd(8)}${'命令'.padEnd(26)}${'保存前进度'.padStart(10)}  ${'恢复后状态'.padEnd(12)}${'进度'.padStart(6)}`);
  for (const rec of (data.tasks ?? []) as Array<Record<string, unknown>>) {
    const tid = String(rec.taskId);
    const before = beforeTasks.get(tid) ?? 0;
    const st = rtB.tasks.query(tid);
    console.log(
      `  ${tid.padEnd(8)}${String(rec.command).padEnd(26)}${String(before).padStart(9)}%  ` +
        `${(st?.status ?? '-').padEnd(12)}${String(st?.progress ?? 0).padStart(5)}%`,
    );
  }
  console.log('  ─────────────────────────────────────────────────────────');
  console.log(`  检查点文件：${ckptPath}`);
  console.log('  结论：轨迹与任务进度完整落盘并跨会话还原；运行中的任务被标记为 suspended，');
  console.log('        保留了最后已知进度，供上层决定「重跑」还是「按进度续跑」。\n');
}

export const OFFLINE_DEMOS = {
  parallel: demoParallel,
  interrupt: demoInterrupt,
  state: demoState,
} satisfies Record<string, () => Promise<void>>;
