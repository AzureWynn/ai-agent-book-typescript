// runtime.ts —— Flux 异步 Agent 运行时（实验 6-2 核心）
//
// 实现设计文档第 5 节的事件处理循环，重点覆盖实验 6-2 的四个能力：
//   1. 异步工具执行：run_terminal_command 立即返回占位符，任务在后台跑。
//   2. 事件队列与批量处理：非紧急事件进 pending，异步结果到达时一次性批量追加。
//   3. 打断机制：用户"取消/停止"立即取消当前 turn + 所有异步工具，并留痕。
//   4. 并行工具的取消与状态查询：query_task / cancel_task 按 ID 操作；
//      异步完成后以"新事件"把真实结果注入对话。
//
// 架构（三个协程协作，单线程事件循环）：
//   inbox       ：所有进来的原始事件（用户输入、打断、异步完成通知）
//   _dispatcher ：从 inbox 取事件 -> 判定紧急度 -> 分流（立即处理 / 排队 / 打断）
//   _worker     ：从 work 取"事件批次" -> 追加到轨迹 -> 跑一轮 LLM（可被打断）
//
// TS 与 asyncio 的差异：asyncio 可以硬取消一个任务（CancelledError），TS 里
// 只能用"标志位 + 边界检查"（turnAborted）在工具调用/LLM 调用之间中止当前 turn——
// 这是本实验教学点之一：**取消的粒度取决于运行时能否真正抢占**。

import ollama, { Ollama as OllamaClient, type Message } from 'ollama';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classifyUrgency, makeEvent, type ChatMessage, type Event } from './events.js';
import { TaskManager, type TaskState } from './tasks.js';
import { execTool, TOOL_SCHEMAS } from './tools.js';

/** 停止标记：独立接口 + 类型守卫，保证 TS 联合类型可靠收窄 */
interface StopMark {
  kind: 'stop';
}
const STOP: StopMark = { kind: 'stop' };

function isStop(v: Event | StopMark | Event[] | StopMark): v is StopMark {
  return (v as { kind?: string }).kind === 'stop';
}

/** 兼容"参数是 JSON 字符串"的情况：解析为对象，解析失败回退空对象 */
function safeParseToolArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** 最简单的异步队列：put 唤醒等待者，get 在没有元素时挂起等待 */
class AsyncQueue<T> {
  private items: T[] = [];
  private waiters: Array<(item: T) => void> = [];

  put(item: T): void {
    const w = this.waiters.shift();
    if (w) w(item);
    else this.items.push(item);
  }

  async get(): Promise<T> {
    const item = this.items.shift();
    if (item !== undefined) return item;
    return new Promise<T>((resolve) => this.waiters.push(resolve));
  }

  get length(): number {
    return this.items.length;
  }
}

const SYSTEM_PROMPT = `你是一个异步 Agent（基于 Flux 框架）。你可以调用工具来完成任务。
关键行为准则：
1. run_terminal_command 是【异步】的：调用后命令在后台运行并立即返回 task_id。
   你应当简要告知用户"任务已在后台启动"，然后【结束本轮回复，不要空等结果】。
2. 当你看到形如 "[系统事件｜异步任务完成] task_id=... 结果：..." 的消息时，
   说明后台任务真的完成了，这时再基于结果给出分析/整合结论。
3. 如果用户在后台任务运行期间提出简短问题（例如"现在几点了？"），
   立即用对应工具（如 get_current_time）回答，【不要等待】后台任务。
4. 你可以用 query_task 查询任意后台任务进度，用 cancel_task 按 ID 取消任务。
5. 收到 "[用户打断]" 时，立即停止当前工作并简短确认已停止。
6. 严格按用户给出的计划执行（例如"谁先完成就查其余进度，未过 50% 就取消"）。
   注意：只取消【进度未超过 50%】的任务；进度已超过 50% 的任务应【保留并等待其完成】，不要取消它。
   每个还在运行的任务只需查询一次进度即可做出取消/保留决定，不要反复查询。
7. 回答简洁、用中文，除非用户明确要求其它语言或格式。`;

const MAX_STEPS = 8; // 单轮内最多的工具调用往返次数（防止死循环）

/** 彩色时间戳日志（各来源一种颜色），供 runtime 与离线演示脚本共用 */
const LOG_COLORS: Record<string, string> = {
  USER: '\x1b[96m',
  AGENT: '\x1b[92m',
  TOOL: '\x1b[93m',
  TASK: '\x1b[95m',
  SYSTEM: '\x1b[90m',
  TRAJ: '\x1b[94m',
  STATE: '\x1b[95m',
};

export function formatLog(t0: number, source: string, text: string): string {
  const color = LOG_COLORS[source] ?? '';
  const reset = color ? '\x1b[0m' : '';
  return `[${((Date.now() - t0) / 1000).toFixed(2)}s] ${color}${source.padEnd(6)}${reset} | ${text}`;
}

export interface AgentRuntimeOptions {
  model: string;
  baseUrl?: string;
  /** 离线模式：跳过 LLM 调用（演示事件机制 / 检查点用） */
  offline?: boolean;
  completionParams?: { temperature?: number };
}

export class AgentRuntime {
  readonly trajectory: Event[] = []; // 轨迹（工作记忆）
  readonly inbox = new AsyncQueue<Event | StopMark>();
  readonly work = new AsyncQueue<Event[] | StopMark>();
  readonly tasks: TaskManager;
  private pending: Event[] = []; // 非紧急事件的排队缓冲
  private running = true;
  private turnPromise: Promise<void> | null = null;
  private turnAborted = false;
  /** 日志时间基准（演示脚本可共享同一起点，便于对照） */
  t0: number;
  private readonly model: string;
  private readonly offline: boolean;
  private readonly completionParams: { temperature: number };
  private readonly client: OllamaClient;

  constructor(opts: AgentRuntimeOptions) {
    this.model = opts.model;
    this.offline = opts.offline ?? false;
    this.completionParams = { temperature: opts.completionParams?.temperature ?? 0.2 };
    this.client = opts.baseUrl ? new OllamaClient({ host: opts.baseUrl }) : ollama;
    this.t0 = Date.now();
    this.tasks = new TaskManager({ onComplete: (st) => this.onTaskComplete(st) });
  }

  // ------------------------------- 日志 -------------------------------

  log(source: string, text: string): void {
    console.log(formatLog(this.t0, source, text));
  }

  /** 把事件追加到轨迹，并打印轨迹留痕 */
  append(event: Event): void {
    this.trajectory.push(event);
    this.log('TRAJ', `+ ${event.type.padEnd(16)} ${event.label}`);
  }

  /** 把轨迹渲染成可喂给 LLM 的消息列表（system + 轨迹回放） */
  buildMessages(): ChatMessage[] {
    const msgs: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
    for (const e of this.trajectory) {
      if (e.message) msgs.push(e.message);
    }
    return msgs;
  }

  // ------------------------- 对外接口：提交事件 -------------------------

  submitUserMessage(text: string): void {
    const urgency = classifyUrgency(text);
    if (urgency === 'INTERRUPT') {
      this.inbox.put(
        makeEvent('user.interrupt', `用户打断：${text}`, {
          role: 'user',
          content: `[用户打断] ${text}`,
        }),
      );
    } else {
      const ev = makeEvent(
        'user.input',
        `用户消息（${urgency}）：${text}`,
        { role: 'user', content: text },
        { urgency },
      );
      ev.urgency = urgency;
      this.inbox.put(ev);
    }
    this.log('USER', `(${urgency}) ${text}`);
  }

  /** 异步任务自然完成 -> 把真实结果作为【新事件】注入 inbox */
  private onTaskComplete(state: TaskState): void {
    this.inbox.put(
      makeEvent(
        'async.result',
        `异步完成 ${state.taskId}`,
        {
          role: 'user',
          content:
            `[系统事件｜异步任务完成] task_id=${state.taskId} 命令=\`${state.command}\` 结果：${state.result ?? ''}`,
        },
        { taskId: state.taskId },
      ),
    );
  }

  // ------------------------------- 主循环 -------------------------------

  serve(): Promise<void> {
    return Promise.all([this.dispatcherLoop(), this.workerLoop()]).then(() => undefined);
  }

  async stop(): Promise<void> {
    this.running = false;
    this.inbox.put(STOP);
  }

  private isIdle(): boolean {
    return (
      !this.tasks.anyRunning() &&
      this.work.length === 0 &&
      this.inbox.length === 0 &&
      !this.turnPromise
    );
  }

  private drainPending(): Event[] {
    const drained = this.pending;
    this.pending = [];
    return drained;
  }

  /** 事件分流：实现设计文档 5.1 的两种处理机制 */
  private async dispatcherLoop(): Promise<void> {
    while (this.running) {
      const ev = await this.inbox.get();
      if (isStop(ev)) {
        this.work.put(STOP);
        break;
      }
      if (ev.type === 'user.interrupt') {
        await this.handleInterrupt(ev);
      } else if (ev.type === 'async.result') {
        // —— 异步结果到达：批量把 pending 一并追加，再触发 LLM ——
        const batch = [ev, ...this.drainPending()];
        if (batch.length > 1) {
          this.log('SYSTEM', `异步结果到达，批量处理 ${batch.length - 1} 条积压的非紧急事件`);
        }
        this.work.put(batch);
      } else if (ev.type === 'user.input') {
        const urgency = ev.urgency ?? classifyUrgency(ev.message?.content ?? '');
        if (urgency === 'IMMEDIATE') {
          // 立即处理（如用户提问），不打断后台异步任务
          this.work.put([ev]);
        } else if (this.isIdle()) {
          // 空闲时，普通指令也直接处理（例如一开始下达的任务）
          this.work.put([ev]);
        } else {
          // 排队处理：累积到 pending，等下一次异步结果时批量追加
          this.pending.push(ev);
          this.log('SYSTEM', `事件进入排队缓冲（当前积压 ${this.pending.length} 条）`);
        }
      }
    }
  }

  private async handleInterrupt(ev: Event): Promise<void> {
    // 1) 取消正在进行的 LLM turn（TS 边界检查式取消）
    this.turnAborted = true;
    // 2) 取消所有后台异步工具
    const cancelled = this.tasks.cancelAll();
    const cancelledText = cancelled.length ? cancelled.map((c) => c.taskId).join(', ') : '（无）';
    // 3) 组装打断批次：打断事件 + 系统回执 + 被丢弃的积压事件（留痕）
    const note = makeEvent(
      'system.note',
      `打断回执，取消任务 ${cancelledText}`,
      {
        role: 'user',
        content: `[系统] 已执行打断：取消了后台任务 ${cancelledText}。请向用户简短确认已停止。`,
      },
    );
    const batch = [ev, note, ...this.drainPending()];
    this.work.put(batch);
  }

  /** 逐批处理事件：追加到轨迹后跑一轮可被取消的 LLM */
  private async workerLoop(): Promise<void> {
    while (this.running) {
      const batch = await this.work.get();
      if (isStop(batch)) break;
      this.turnAborted = false;
      this.turnPromise = this.processBatch(batch);
      try {
        await this.turnPromise;
      } catch (err) {
        if (this.turnAborted) this.log('SYSTEM', '当前 LLM turn 已被打断取消');
        else throw err;
      }
      this.turnPromise = null;
    }
  }

  private async processBatch(batch: Event[]): Promise<void> {
    for (const e of batch) this.append(e);
    await this.runLlmTurn();
  }

  // ------------------------------- LLM turn -------------------------------

  private async runLlmTurn(): Promise<void> {
    if (this.offline) return;
    for (let step = 0; step < MAX_STEPS; step++) {
      if (this.turnAborted) return; // 已被打断：不再继续本轮
      const messages = this.buildMessages();
      const t = Date.now();
      const resp = await this.client.chat({
        model: this.model,
        messages: messages as unknown as Message[],
        tools: TOOL_SCHEMAS,
        stream: false,
        options: this.completionParams,
      });
      this.log('SYSTEM', `LLM 调用耗时 ${((Date.now() - t) / 1000).toFixed(2)}s（${messages.length} 条消息）`);
      const msg = resp.message;
      const calls = msg.tool_calls ?? [];
      const assistant: ChatMessage = { role: 'assistant', content: msg.content ?? '' };
      const toolCalls = calls.map((c, i) => ({
        id: `${c.function.name}_${i}`,
        type: 'function' as const,
        function: {
          name: c.function.name,
          // ollama 返回的 arguments 可能是对象或 JSON 字符串；统一归一为对象（服务端期望对象）
          arguments:
            typeof c.function.arguments === 'string'
              ? safeParseToolArgs(c.function.arguments)
              : (c.function.arguments as Record<string, unknown>),
        },
      }));
      if (toolCalls.length) assistant.tool_calls = toolCalls;
      this.append(
        makeEvent(
          toolCalls.length ? 'agent.tool_call' : 'agent.output',
          toolCalls.length ? `调用工具 ${toolCalls.map((tc) => tc.function.name).join(', ')}` : '回复用户',
          assistant,
        ),
      );
      if (msg.content?.trim()) this.log('AGENT', msg.content.trim());
      if (!toolCalls.length) return; // 本轮结束：Agent 给出了最终回复
      if (this.turnAborted) return;
      // 执行每个工具调用（同步工具就地执行；异步工具启动后回占位符）
      for (let i = 0; i < calls.length; i++) {
        const name = calls[i]!.function.name;
        const args = (calls[i]!.function.arguments ?? {}) as Record<string, unknown>;
        const resultText = execTool(name, args, this.tasks);
        this.log('TOOL', `${name}${JSON.stringify(args)} -> ${resultText.slice(0, 60)}`);
        this.append(
          makeEvent('tool.result', `工具结果 ${name}`, {
            role: 'tool',
            content: resultText,
            tool_call_id: toolCalls[i]!.id,
          }),
        );
      }
    }
  }

  // ------------------------------- 收尾 -------------------------------

  /** 阻塞直到系统持续空闲 stableMs 毫秒（或超时） */
  async waitUntilIdle(stableMs = 1300, timeoutMs = 90000): Promise<void> {
    const start = Date.now();
    let lastBusy = Date.now();
    for (;;) {
      const busy =
        this.tasks.anyRunning() ||
        this.work.length > 0 ||
        this.inbox.length > 0 ||
        this.pending.length > 0 ||
        !!this.turnPromise;
      const now = Date.now();
      if (busy) lastBusy = now;
      else if (now - lastBusy >= stableMs) return;
      if (now - start >= timeoutMs) {
        this.log('SYSTEM', 'wait_until_idle 超时返回');
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // ------------------------- 状态检查点（持久化 / 恢复） -------------------------

  snapshot(): Record<string, unknown> {
    return {
      savedAt: new Date().toISOString(),
      model: this.model,
      trajectory: this.trajectory.map((e) => ({
        type: e.type,
        label: e.label,
        message: e.message,
        metadata: e.metadata,
      })),
      tasks: this.tasks.snapshot(),
    };
  }

  saveCheckpoint(path: string): void {
    writeFileSync(path, JSON.stringify(this.snapshot(), null, 2));
    this.log('STATE', `检查点已保存: ${path}`);
  }

  loadCheckpoint(path: string): Record<string, unknown> {
    const data = JSON.parse(readFileSync(path, 'utf-8')) as {
      trajectory?: Array<{
        type: Event['type'];
        label: string;
        message: ChatMessage | null;
        metadata?: Record<string, unknown>;
      }>;
      tasks?: Array<Record<string, unknown>>;
    };
    this.trajectory.length = 0;
    for (const rec of data.trajectory ?? []) {
      this.trajectory.push({
        id: `r${this.trajectory.length}`,
        type: rec.type,
        label: rec.label,
        message: rec.message,
        metadata: rec.metadata ?? {},
        at: 0,
      });
    }
    this.tasks.restore(data.tasks ?? []);
    this.log('STATE', `从检查点恢复: ${path}`);
    return data;
  }
}

/** 默认检查点路径：本文件所在目录的 checkpoints/agent_state.json */
export function defaultCheckpointPath(): string {
  const dir = fileURLToPath(new URL('./checkpoints', import.meta.url));
  mkdirSync(dir, { recursive: true });
  return fileURLToPath(new URL('./checkpoints/agent_state.json', import.meta.url));
}
