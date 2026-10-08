// triggers.ts —— 事件触发器：注册 → 触发 → 入队
//
// 对应官方三类触发器：一次性定时器 / 循环定时器 / 文件监听，外加 HTTP
// 事件入口（模拟 Web/IM/GitHub 等外部来源）。触发器只负责"事件发生",
// 不负责"任务完成"——处理由事件循环交给 Agent。

import { watch, type FSWatcher } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AgentEvent } from './events.js';
import { EventType, makeEvent } from './events.js';
import type { EventQueue } from './queue.js';

export interface TriggerHandle {
  name: string;
  stop: () => void;
}

/** 一次性定时器：delayMs 后触发一次 */
export function oneShotTimer(
  queue: EventQueue,
  name: string,
  delayMs: number,
  content: string,
  type: EventType = EventType.TIMER_TRIGGER,
): TriggerHandle {
  console.log(`⏱️   [OneShotTimer(${name})] 已注册：${delayMs}ms 后触发`);
  const t = setTimeout(() => {
    const e = makeEvent(type, content, name, { trigger: name, oneShot: true });
    const r = queue.enqueue(e);
    console.log(`⚡ [${name}] 触发事件 → ${type}: ${content}（入队: ${r.status}）`);
  }, delayMs);
  return { name, stop: () => clearTimeout(t) };
}

/** 循环定时器：每 intervalMs 触发一次（周期事件可能在上一次处理结束前再次到达） */
export function recurringTimer(
  queue: EventQueue,
  name: string,
  intervalMs: number,
  content: string,
  type: EventType = EventType.TIMER_TRIGGER,
): TriggerHandle {
  console.log(`🔁 [RecurringTimer(${name})] 已注册：每 ${intervalMs}ms 触发一次`);
  const t = setInterval(() => {
    const e = makeEvent(type, content, name, { trigger: name, recurring: true });
    const r = queue.enqueue(e);
    console.log(`⚡ [${name}] 触发事件 → ${type}: ${content}（入队: ${r.status}）`);
  }, intervalMs);
  return { name, stop: () => clearInterval(t) };
}

/** 文件监听：目录内文件创建/修改时触发 */
export function fileWatch(
  queue: EventQueue,
  dir: string,
  type: EventType = EventType.FILE_CHANGE,
): TriggerHandle {
  console.log(`👀 [FileWatchTrigger] 已注册：监听 ${dir}`);
  const watcher: FSWatcher = watch(dir, (eventType, filename) => {
    const e = makeEvent(type, `文件 ${filename} 发生变更（${eventType}）`, 'file-watch', {
      trigger: 'file-watch',
      filename,
    });
    const r = queue.enqueue(e);
    console.log(`⚡ [file-watch] 触发事件 → ${type}: ${filename}（入队: ${r.status}）`);
  });
  return { name: 'file-watch', stop: () => watcher.close() };
}

/**
 * HTTP 事件入口：POST /event 接收外部事件（模拟 Web/IM/GitHub 来源）。
 * 请求体：{ "event_type": "web_message", "content": "...", "metadata": {...} }
 */
export function httpTrigger(
  queue: EventQueue,
  port: number,
): TriggerHandle {
  const server: Server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/event') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as {
            event_type?: string;
            content?: string;
            metadata?: Record<string, unknown>;
          };
          const type = (parsed.event_type as EventType) ?? EventType.WEB_MESSAGE;
          const content = parsed.content ?? '(空消息)';
          const e = makeEvent(type, content, `http:${port}`, {
            trigger: 'http',
            ...(parsed.metadata ?? {}),
          });
          const r = queue.enqueue(e);
          res.writeHead(202, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ status: r.status, eventId: e.id }));
          console.log(`📥 [http:${port}] 收到外部事件 → ${type}: ${content}（入队: ${r.status}）`);
        } catch (err) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'bad json' }));
          console.error(`✗ [http:${port}] 请求体不是合法 JSON: ${err instanceof Error ? err.message : err}`);
        }
      });
    } else if (req.method === 'GET' && req.url === '/queue') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          pending: queue.pending,
          stats: queue.stats,
        }),
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port, () => {
    console.log(`🌐 [HttpTrigger] 已注册：POST http://localhost:${port}/event 注入事件`);
  });
  return { name: `http:${port}`, stop: () => server.close() };
}
