// main.ts —— 事件驱动 Agent 演示入口
//
// 用法：
//   npm run demo                        # 在线模式：timer 触发器 + Ollama
//   npm run demo -- --mock              # 离线模式：模拟动作，无需模型
//   npm run demo -- --trigger recurring --interval 3000 --duration 12000
//   npm run demo -- --trigger http --http-port 8787
//   npm run demo -- --trigger file
//
// 核心闭环：注册（触发器）→ 触发（事件入队）→ 唤醒（事件循环取出）→ 处理（Agent）

import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { EventQueue } from './queue.js';
import { EventAgent } from './agent.js';
import { oneShotTimer, recurringTimer, httpTrigger, fileWatch } from './triggers.js';
import { EventType } from './events.js';

interface Args {
  mock: boolean;
  trigger: string;
  durationMs: number;
  delayMs: number;
  intervalMs: number;
  httpPort: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    mock: argv.includes('--mock'),
    trigger: get('--trigger') ?? 'timer',
    durationMs: Number(get('--duration') ?? 12000),
    delayMs: Number(get('--delay') ?? 2000),
    intervalMs: Number(get('--interval') ?? 3000),
    httpPort: Number(get('--http-port') ?? 8787),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model = process.env.OLLAMA_MODEL ?? 'gemma4:latest';

  // 统一事件队列：触发发生 ≠ 任务完成，事件先排队，Agent 逐个处理
  const queue = new EventQueue({ dedupeWindowMs: 500 });

  const agent = new EventAgent({
    model,
    baseUrl: process.env.OLLAMA_BASE_URL,
    mock: args.mock,
  });

  const handles: { stop: () => void }[] = [];

  // ── 1. 注册触发器（事件发生源）──
  if (args.trigger === 'timer' || args.trigger === 'all') {
    handles.push(
      oneShotTimer(queue, 'daily_backup_check', args.delayMs, '一次性定时器到期：请检查每日备份是否已经完成。'),
      recurringTimer(
        queue,
        'health_check',
        args.intervalMs,
        '循环健康检查：请检查服务器是否正常运行，需要时记录一条信息级通知。',
        EventType.SYSTEM_ALERT,
      ),
    );
  }
  if (args.trigger === 'recurring') {
    handles.push(
      recurringTimer(queue, 'health_check', args.intervalMs, '循环健康检查：请检查服务器是否正常运行。', EventType.SYSTEM_ALERT),
    );
  }
  if (args.trigger === 'http') {
    handles.push(httpTrigger(queue, args.httpPort));
    console.log(`  提示：curl -X POST http://localhost:${args.httpPort}/event -H 'content-type: application/json' -d '{"event_type":"web_message","content":"..."}'`);
  }
  if (args.trigger === 'file') {
    mkdirSync(new URL('../watched_dir', import.meta.url), { recursive: true });
    handles.push(fileWatch(queue, new URL('../watched_dir', import.meta.url).pathname));
    console.log('  提示：另开终端 `echo hello > watched_dir/a.txt` 触发文件事件');
  }

  console.log(`🟢 事件循环启动，将运行 ${args.durationMs}ms，等待事件唤醒 Agent...`);

  // ── 2. 事件循环：逐个取出事件并唤醒 Agent 处理 ──
  const startedAt = Date.now();
  let index = 0;
  while (Date.now() - startedAt < args.durationMs) {
    const event = queue.dequeue();
    if (event) {
      index++;
      console.log(`\n📥 事件循环取出第 ${index} 个事件 -> 唤醒 Agent`);
      const t0 = Date.now();
      const result = await agent.handle(event);
      const ms = Date.now() - t0;
      console.log(`✅ Agent 处理完成（${ms}ms）: ${result.slice(0, 140)}`);
    } else {
      // 队列空：短暂等待，不忙轮询
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  handles.forEach((h) => h.stop());
  console.log(`\n⏹ 事件循环结束。队列统计: processed=${queue.stats.processed}, dropped=${queue.stats.dropped}`);
}

main().catch((err) => {
  console.error('运行失败:', err);
  process.exit(1);
});
