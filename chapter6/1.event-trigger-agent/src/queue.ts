// queue.ts —— 统一事件队列
//
// 官方核心概念：触发发生与任务完成是两个时刻；周期事件可能在上一次
// 处理结束前再次到达。事件队列解决的是"谁来排队、谁先处理"的问题。

import type { AgentEvent } from './events.js';

export interface QueueOptions {
  /** 相同 (type, 触发源) 的事件在窗口内合并为一条，避免重复处理 */
  dedupeWindowMs?: number;
  /** 队列最大长度，超过时丢弃最旧（防积压撑爆内存） */
  maxSize?: number;
}

export class EventQueue {
  private items: AgentEvent[] = [];
  private processed = 0;
  private dropped = 0;
  private readonly opts: Required<QueueOptions>;

  constructor(opts: QueueOptions = {}) {
    this.opts = {
      dedupeWindowMs: opts.dedupeWindowMs ?? 0,
      maxSize: opts.maxSize ?? 100,
    };
  }

  enqueue(e: AgentEvent): { status: 'accepted' | 'merged' | 'dropped' } {
    if (this.opts.dedupeWindowMs > 0) {
      const merged = this.items.find(
        (it) =>
          it.type === e.type &&
          it.metadata.trigger === e.metadata.trigger &&
          e.receivedAt - it.receivedAt < this.opts.dedupeWindowMs,
      );
      if (merged) {
        merged.metadata.occurrences = ((merged.metadata.occurrences as number) ?? 1) + 1;
        return { status: 'merged' };
      }
    }
    if (this.items.length >= this.opts.maxSize) {
      this.items.shift();
      this.dropped++;
    }
    this.items.push(e);
    return { status: 'accepted' };
  }

  /** 取出下一条待处理事件（FIFO）。没有则返回 null。 */
  dequeue(): AgentEvent | null {
    const next = this.items.shift();
    if (next) this.processed++;
    return next ?? null;
  }

  get size(): number {
    return this.items.length;
  }

  get stats(): { processed: number; dropped: number } {
    return { processed: this.processed, dropped: this.dropped };
  }

  get pending(): AgentEvent[] {
    return [...this.items];
  }
}
