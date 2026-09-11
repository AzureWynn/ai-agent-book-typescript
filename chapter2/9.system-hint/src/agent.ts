/**
 * SystemHintAgent（对应官方 agent.py）。
 *
 * 关键机制：每次调用 LLM 前，把状态栏作为一条【临时 user 消息】注入消息数组末尾，
 * 但【不写入对话历史】——避免永久污染上下文，同时让模型每轮都看到最新状态。
 */

import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildStatusBar, errorSuggestion, type StatusConfig, type StatusState, type ToolEvent, type TodoItem } from './status.js';

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
}

export interface RunResult {
  task: string;
  iterations: number;
  finalAnswer: string;
  calls: ToolCall[];
  todos: TodoItem[];
  success: boolean;
  trajectoryFile: string | null;
  config: StatusConfig;
}

interface OllamaMsg {
  role: string;
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
  thinking?: string;
  tool_name?: string;
}

interface OllamaResponse {
  message: OllamaMsg;
}

export class OllamaError extends Error {}

const SYSTEM_PROMPT = [
  'You are a coding agent with file and command tools. A SYSTEM STATUS block is appended to every message you receive; use it to orient yourself.',
  'Rules:',
  '- For tasks requiring 3+ steps, first create a TODO list with update_todo, then work through it. Keep only one item in_progress.',
  '- Watch the TOOL CALLS counter: if you have called the same tool many times without progress, stop and change approach.',
  '- When a tool returns an error, read the LAST ERROR suggestion and adapt; do not blindly repeat the same failing call.',
  '- Complete the task, then give a short final summary.',
].join('\n');

const BASE_URL = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
const MODEL = process.env.MODEL_NAME ?? 'gemma4:latest';

function toolSchemas(): Array<Record<string, unknown>> {
  return [
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read the text content of a file.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write text content to a file at a given path.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['path', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'run_command',
        description: 'Run a shell command in the project directory.',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string', description: 'Shell command to run' } },
          required: ['command'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_todo',
        description: 'Manage the TODO list. action in add / in_progress / complete / cancel.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['add', 'in_progress', 'complete', 'cancel'] },
            text: { type: 'string', description: 'TODO 文本（action=add 时必填）' },
            id: { type: 'integer', description: 'TODO 编号（action 非 add 时必填）' },
          },
          required: ['action'],
        },
      },
    },
  ];
}

function runCommand(command: string, cwd: string): Promise<{ text: string; ok: boolean }> {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], { cwd, timeout: 10000 });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    child.on('error', (e) => resolve({ text: `错误: ${e.message}`, ok: false }));
    child.on('close', (code) => {
      const combined = [out, err].join('').trim();
      if (code === 0) resolve({ text: combined || '(ok)', ok: true });
      else resolve({ text: `命令退出码 ${code}: ${combined.slice(0, 400)}`, ok: false });
    });
  });
}

export class SystemHintAgent {
  readonly projectRoot: string;
  readonly config: StatusConfig;
  readonly trajectoryFile: string | null;
  /** 每轮注入状态栏后回调（用于演示/调试）。 */
  onIteration?: (iteration: number, statusBar: string) => void;
  private history: OllamaMsg[] = [];
  private state: StatusState;
  private todoSeq = 0;
  private maxIterations = 15;

  constructor(projectRoot: string, config: Partial<StatusConfig> = {}, trajectoryFile: string | null = null) {
    this.projectRoot = projectRoot;
    this.config = {
      enableTimestamps: true,
      enableToolCounter: true,
      enableTodoList: true,
      enableDetailedErrors: true,
      enableSystemState: true,
      ...config,
    };
    this.trajectoryFile = trajectoryFile;
    this.state = {
      cwd: projectRoot,
      platform: `${process.platform} ${process.arch}`,
      toolCalls: {},
      toolEvents: [],
      todos: [],
      time: new Date(),
    };
  }

  private async chatOnce(messages: OllamaMsg[]): Promise<OllamaResponse> {
    const resp = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, tools: toolSchemas(), options: { temperature: 0.3 }, stream: false }),
    });
    if (!resp.ok) throw new OllamaError(`Ollama HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    return (await resp.json()) as OllamaResponse;
  }

  private applyTodo(args: Record<string, unknown>): string {
    const action = String(args.action ?? '');
    const text = String(args.text ?? '');
    const id = Number(args.id ?? -1);
    const find = () => this.state.todos.find((t) => t.id === id);
    switch (action) {
      case 'add':
        this.todoSeq++;
        this.state.todos.push({ id: this.todoSeq, text, state: 'pending' });
        return `TODO #${this.todoSeq} 已添加: ${text}`;
      case 'in_progress': {
        const t = find();
        if (!t) return `错误: 没有编号 ${id} 的 TODO`;
        this.state.todos.forEach((x) => { if (x.state === 'in_progress') x.state = 'pending'; });
        t.state = 'in_progress';
        return `TODO #${id} 已设为 in_progress`;
      }
      case 'complete': {
        const t = find();
        if (!t) return `错误: 没有编号 ${id} 的 TODO`;
        t.state = 'completed';
        return `TODO #${id} 已完成`;
      }
      case 'cancel': {
        const t = find();
        if (!t) return `错误: 没有编号 ${id} 的 TODO`;
        t.state = 'cancelled';
        return `TODO #${id} 已取消`;
      }
      default:
        return `错误: 未知 action ${action}`;
    }
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<{ text: string; ok: boolean }> {
    const ev: ToolEvent = { name, ok: true };
    try {
      switch (name) {
        case 'read_file': {
          const abs = path.resolve(this.projectRoot, String(args.path ?? ''));
          const content = await fs.readFile(abs, 'utf8');
          ev.ok = true;
          return { text: content.slice(0, 4000), ok: true };
        }
        case 'write_file': {
          await fs.mkdir(path.dirname(path.resolve(this.projectRoot, String(args.path ?? ''))), { recursive: true });
          await fs.writeFile(path.resolve(this.projectRoot, String(args.path ?? '')), String(args.content ?? ''), 'utf8');
          return { text: `已写入 ${String(args.path)}`, ok: true };
        }
        case 'run_command':
          return await runCommand(String(args.command ?? ''), this.projectRoot);
        case 'update_todo':
          return { text: this.applyTodo(args), ok: true };
        default:
          return { text: `未知工具 ${name}`, ok: false };
      }
    } catch (e) {
      ev.ok = false;
      const message = e instanceof Error ? e.message : String(e);
      this.state.lastError = {
        name,
        args,
        message,
        suggestion: errorSuggestion(name, message),
      };
      return { text: `错误: ${message}`, ok: false };
    } finally {
      this.state.toolEvents.push(ev);
      this.state.toolCalls[name] = (this.state.toolCalls[name] ?? 0) + 1;
    }
  }

  private async saveTrajectory(iteration: number, finalAnswer: string): Promise<void> {
    if (!this.trajectoryFile) return;
    await fs.mkdir(path.dirname(this.trajectoryFile), { recursive: true });
    const payload = {
      task: this.state.todos.map((t) => t.text).join('; '),
      iterations: iteration,
      final_answer: finalAnswer,
      history: this.history.map((m) => ({ role: m.role, content: (m.content ?? '').slice(0, 500) })),
      tool_calls: this.state.toolCalls,
      todos: this.state.todos,
      config: this.config,
    };
    await fs.writeFile(this.trajectoryFile, JSON.stringify(payload, null, 2));
  }

  async run(task: string): Promise<RunResult> {
    this.history = [{ role: 'user', content: task }];
    const calls: ToolCall[] = [];
    let finalAnswer = '';
    let iterations = 0;

    for (let i = 0; i < this.maxIterations; i++) {
      iterations++;
      this.state.time = new Date();

      // 关键：把状态栏作为【临时 user 消息】注入本轮，不写入 history
      const statusHint: OllamaMsg = {
        role: 'user',
        content: buildStatusBar(this.config, this.state),
      };
      if (this.onIteration) this.onIteration(iterations, statusHint.content);
      const messages = [this.history[0]!, { role: 'system', content: SYSTEM_PROMPT }, ...this.history.slice(1), statusHint];

      const response = await this.chatOnce(messages);
      const msg = response.message;
      const toolCalls = msg.tool_calls ?? [];

      if (toolCalls.length > 0) {
        const assistantMsg: OllamaMsg = {
          role: 'assistant',
          content: msg.content ?? '',
          tool_calls: toolCalls,
          ...(msg.thinking ? { thinking: msg.thinking } : {}),
        };
        this.history.push(assistantMsg);
        for (const tc of toolCalls) {
          const args = (typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments || '{}') : tc.function.arguments) as Record<string, unknown>;
          const { text, ok } = await this.executeTool(tc.function.name, args);
          calls.push({ name: tc.function.name, args, ok });
          this.history.push({ role: 'tool', tool_name: tc.function.name, content: text });
        }
      } else {
        finalAnswer = msg.content ?? '';
        this.history.push({ role: 'assistant', content: finalAnswer, ...(msg.thinking ? { thinking: msg.thinking } : {}) });
        break;
      }
      await this.saveTrajectory(iterations, '');
    }

    await this.saveTrajectory(iterations, finalAnswer);
    return {
      task,
      iterations,
      finalAnswer,
      calls,
      todos: this.state.todos,
      success: iterations < this.maxIterations,
      trajectoryFile: this.trajectoryFile,
      config: this.config,
    };
  }
}