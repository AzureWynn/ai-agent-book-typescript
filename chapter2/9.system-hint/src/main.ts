/**
 * CLI 入口（对应官方 main.py）。
 *
 *   npm run preview                  # 离线预览：状态栏长什么样（不发 LLM）
 *   npm run single -- --task "..."   # 单任务（默认全开）
 *   npm run demo -- basic            # 一个任务 + 每轮注入的状态栏
 *   npm run demo -- comparison       # 同一任务：无状态栏 vs 有状态栏
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SystemHintAgent } from './agent.js';
import { renderPreview, type StatusConfig, type StatusState, type TodoItem } from './status.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* 默认值 */
}

function sampleState(): StatusState {
  return {
    cwd: ROOT,
    platform: `${process.platform} ${process.arch}`,
    toolCalls: { read_file: 3, run_command: 5 },
    toolEvents: [],
    todos: [
      { id: 1, text: '读取配置', state: 'completed' },
      { id: 2, text: '分析数据', state: 'in_progress' },
      { id: 3, text: '输出报告', state: 'pending' },
    ] as TodoItem[],
    lastError: {
      name: 'run_command',
      args: { command: 'run-tests' },
      message: 'sh: run-tests: command not found',
      suggestion: '命令不存在，检查拼写或用 read_file 查看说明',
    },
    time: new Date(),
  };
}

function parseConfig(args: string[]): StatusConfig {
  const cfg: StatusConfig = {
    enableTimestamps: true,
    enableToolCounter: true,
    enableTodoList: true,
    enableDetailedErrors: true,
    enableSystemState: true,
  };
  const off = (flag: string, key: keyof StatusConfig) => {
    if (args.includes(flag)) cfg[key] = false;
  };
  off('--no-timestamps', 'enableTimestamps');
  off('--no-counter', 'enableToolCounter');
  off('--no-todo', 'enableTodoList');
  off('--no-errors', 'enableDetailedErrors');
  off('--no-state', 'enableSystemState');
  return cfg;
}

function flagVal(args: string[], flag: string, def: string): string {
  const i = args.indexOf(flag);
  return i === -1 ? def : (args[i + 1] ?? def);
}

async function cmdPreview(): Promise<void> {
  const cfg: StatusConfig = {
    enableTimestamps: true,
    enableToolCounter: true,
    enableTodoList: true,
    enableDetailedErrors: true,
    enableSystemState: true,
  };
  console.log('【离线预览】状态栏 = 注入到每次 LLM 调用前的临时 user 消息，不写入历史\n');
  console.log(renderPreview(cfg, sampleState()));
  console.log('\n\n五个开关各自的作用：');
  console.log('  --no-timestamps   关掉时间戳       （模型失去时间上下文）');
  console.log('  --no-counter      关掉工具计数器     （模型可能反复重试同一工具）');
  console.log('  --no-todo         关掉 TODO 列表    （多步任务容易失焦）');
  console.log('  --no-errors       关掉详细错误      （失败后只能盲猜）');
  console.log('  --no-state        关掉系统状态      （不知道当前目录/平台）');
}

async function runAndReport(task: string, cfg: StatusConfig, label: string): Promise<void> {
  console.log(`\n══ ${label} ══`);
  const traj = path.join(ROOT, `runs/trajectory_${label.replace(/\s+/g, '_')}.json`);
  const agent = new SystemHintAgent(ROOT, cfg, traj);
  const result = await agent.run(task);
  console.log(`迭代: ${result.iterations} · TODO: ${result.todos.length} · 成功: ${result.success}`);
  console.log(`工具调用: ${result.calls.map((c) => `${c.name}${c.ok ? '' : '✗'}`).join(', ') || '无'}`);
  console.log(`最终答复: ${result.finalAnswer.slice(0, 120)}`);
  if (result.trajectoryFile) console.log(`轨迹: ${path.relative(ROOT, result.trajectoryFile)}`);
}

async function cmdSingle(args: string[]): Promise<void> {
  const task = flagVal(args, '--task', 'List the files in this project, read src/agent.ts, and summarize what it does.');
  await runAndReport(task, parseConfig(args), 'single');
}

async function cmdDemo(kind: string): Promise<void> {
  const basicTask = 'Write a small Python script that prints the numbers 1 to 10, save it to hello.py, then run it.';
  const loopTask = "Run the command 'run-tests'; if it fails, keep trying until it passes, then summarize what happened.";

  if (kind === 'basic') {
    const cfg: StatusConfig = {
      enableTimestamps: true,
      enableToolCounter: true,
      enableTodoList: true,
      enableDetailedErrors: true,
      enableSystemState: true,
    };
    const agent = new SystemHintAgent(ROOT, cfg, path.join(ROOT, 'runs/trajectory_basic.json'));
    const seenBars: string[] = [];
    agent.onIteration = (iteration, bar) => {
      seenBars.push(bar);
      console.log(`\n── 第 ${iteration} 轮注入的状态栏 ──`);
      console.log(bar);
    };
    const result = await agent.run(basicTask);
    console.log(`\n[basic] 迭代 ${result.iterations} 次完成`);
    console.log(`工具调用: ${result.calls.map((c) => c.name).join(', ') || '无'}`);
    console.log(`TODO: ${result.todos.map((t) => `#${t.id} ${t.state}`).join(', ')}`);
    console.log(`最终答复: ${result.finalAnswer.slice(0, 150)}`);
    console.log(`\n共注入了 ${seenBars.length} 次状态栏——注意每次调用前模型都看到最新状态，但历史里并不包含这些临时消息。`);
    return;
  }

  // comparison / loop：无状态栏 vs 有状态栏
  const task = kind === 'loop' ? loopTask : basicTask;
  const off: StatusConfig = {
    enableTimestamps: false,
    enableToolCounter: false,
    enableTodoList: false,
    enableDetailedErrors: false,
    enableSystemState: false,
  };
  const on: StatusConfig = {
    enableTimestamps: true,
    enableToolCounter: true,
    enableTodoList: true,
    enableDetailedErrors: true,
    enableSystemState: true,
  };
  console.log(`\n任务: ${task}`);
  await runAndReport(task, off, '无状态栏');
  await runAndReport(task, on, '有状态栏');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  console.log('='.repeat(60));
  console.log('📌 Agent 状态栏（System Hint）实验（实验 2-9）');
  console.log('='.repeat(60));

  const mode = flagVal(args, '--mode', 'preview');
  if (mode === 'preview') {
    await cmdPreview();
  } else if (mode === 'single') {
    await cmdSingle(args);
  } else if (mode === 'demo') {
    // 支持 `demo -- comparison` 或 `demo --demo comparison`（取最后一个裸参数）
    const bare = [...args].reverse().find((a) => !a.startsWith('-'));
    const kind = flagVal(args, '--demo', bare ?? 'basic');
    await cmdDemo(kind);
  } else {
    console.log('用法:');
    console.log('  npm run preview               # 离线预览状态栏');
    console.log('  npm run single -- --task "..."  # 单任务（全开）');
    console.log('  npm run demo -- basic          # 一个任务 + 状态栏');
    console.log('  npm run demo -- comparison     # 无状态栏 vs 有状态栏');
    console.log('  npm run demo -- loop           # 防死循环演示');
    console.log('  --no-timestamps / --no-counter / --no-todo / --no-errors / --no-state');
  }
}

main().catch((e) => {
  console.error(`❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});