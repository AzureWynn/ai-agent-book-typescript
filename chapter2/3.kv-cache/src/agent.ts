/**
 * KV Cache 演示 Agent（对应官方 agent.py 的 KVCacheAgent）。
 *
 * 核心：6 种上下文管理模式（1 正确 + 5 反模式），展示对 KV Cache 前缀命中的影响。
 *
 * 官方用 Kimi 上报的 `cached_tokens` 做缓存信号；Ollama 不上报该字段，
 * 但 `prompt_eval_duration`（prompt 求值时长）在命中前缀缓存时大幅下降
 * （实测 358ms → 71ms）。因此本移植用 prompt_eval_duration 作为缓存信号：
 *   cache_ratio_i = 1 - eval_dur_i / 本轮冷启动基线
 *
 * 模式差异只在"请求消息内容是否逐轮稳定"：
 *   1. correct          固定 system + 逐轮追加 → 前缀稳定 → 命中
 *   2. dynamic_system   system 每轮带时间戳 → 整表重建 → 失效
 *   3. shuffled_tools   工具顺序每轮乱序（tools 被模板化进 prompt）→ 失效
 *   4. dynamic_profile  前缀里每轮插入变化的用户额度 → 失效
 *   5. sliding_window   只保留最近 5 条 → 前缀被截断 → 失效
 *   6. text_format      历史写成纯文本单条消息 → 序列化格式全变 → 失效
 */

import { LocalFileTools } from './tools.js';

export type Mode =
  | 'correct'
  | 'dynamic_system'
  | 'shuffled_tools'
  | 'dynamic_profile'
  | 'sliding_window'
  | 'text_format';

export const MODES: Mode[] = [
  'correct',
  'dynamic_system',
  'shuffled_tools',
  'dynamic_profile',
  'sliding_window',
  'text_format',
];

interface OllamaMsg {
  role: string;
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
  tool_name?: string;
  thinking?: string;
}

interface OllamaResponse {
  message: OllamaMsg;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  load_duration: number;
  total_duration: number;
  eval_count: number;
}

export interface IterationMetrics {
  iteration: number;
  /** 首 token 延迟（prompt 求值 + 加载） */
  ttft_ms: number;
  /** 本次 prompt 求值时长（缓存信号） */
  eval_dur_ms: number;
  /** prompt token 数 */
  prompt_tokens: number;
  /** 生成 token 数 */
  completion_tokens: number;
  tool_calls: string[];
  final: boolean;
}

export interface ModeResult {
  mode: Mode;
  model: string;
  task: string;
  iterations: IterationMetrics[];
  total_ms: number;
  first_ttft_ms: number;
  avg_ttft_ms: number;
  improvement_pct: number;
  /** 缓存比例：1 - 总求值时 / 无缓存全量重算基线。>0 表示前缀命中。 */
  cache_ratio_mean: number;
  /** 无缓存基线估计（求值时长，ms） */
  no_cache_eval_ms: number;
  completion_tokens: number;
}

const SYSTEM_PROMPT =
  'You are a helpful coding agent. You work inside a project directory and use the available ' +
  'file tools (read_file / find / grep) to inspect code and answer questions. ' +
  'Always call tools when you need to inspect files; do not guess file contents. ' +
  'When you have enough information, answer concisely.';

export class OllamaError extends Error {}

export class KVCacheAgent {
  readonly model: string;
  readonly baseUrl: string;
  readonly tools = new LocalFileTools('');
  readonly toolSchemas: Array<Record<string, unknown>>;

  private turns: OllamaMsg[] = []; // 追加的 assistant / tool 消息（模式共享的逻辑对话）
  private maxIterations = 8;
  private temperature = 0.1;

  constructor(
    readonly mode: Mode,
    private rootDir: string,
    model?: string
  ) {
    this.model = model ?? process.env.MODEL_NAME ?? 'gemma4:latest';
    this.baseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.tools = new LocalFileTools(rootDir);
    this.toolSchemas = this.tools.getSchemas();
  }

  // ── 模式：system / profile / tools / 消息构建 ──────────────────────

  private systemPrompt(iteration: number): string {
    if (this.mode === 'dynamic_system') {
      // 反模式 2：每轮在 system 里加时间戳 → 前缀每次变化
      return `${SYSTEM_PROMPT}\n[generated_at: ${new Date().toISOString()}]`;
    }
    return SYSTEM_PROMPT;
  }

  private profileMessage(iteration: number): OllamaMsg | null {
    if (this.mode !== 'dynamic_profile') return null;
    // 反模式 4：前缀里插入一个每轮变化的"用户额度"
    const credits = Math.floor(Math.random() * 90) + 10;
    return { role: 'user', content: `(session context) Account credits: $${credits}.` };
  }

  private toolsForIteration(iteration: number): Array<Record<string, unknown>> {
    if (this.mode === 'shuffled_tools') {
      // 反模式 3：工具顺序每轮轮转一位 → 模板化进 prompt 的前缀必然变化
      const n = this.toolSchemas.length;
      const rotated = this.toolSchemas.map((_, i) => this.toolSchemas[(i + iteration) % n]!);
      return rotated;
    }
    return this.toolSchemas;
  }

  /** 按模式构造本轮请求消息。correct 之外的模式都在每轮重建 → 内容变化 → 缓存失效。 */
  private buildMessages(iteration: number, task: string): OllamaMsg[] {
    const sys: OllamaMsg = { role: 'system', content: this.systemPrompt(iteration) };
    const profile = this.profileMessage(iteration);

    switch (this.mode) {
      case 'correct':
        // 前缀稳定：system 固定，只追加 turns
        return [sys, { role: 'user', content: task }, ...this.turns];
      case 'dynamic_system':
        return [sys, { role: 'user', content: task }, ...this.turns];
      case 'dynamic_profile':
        return [sys, profile!, { role: 'user', content: task }, ...this.turns];
      case 'shuffled_tools':
        // 消息与 correct 相同，但 tools 顺序每轮变（见 toolsForIteration）
        return [sys, { role: 'user', content: task }, ...this.turns];
      case 'sliding_window': {
        // 反模式 5：只留最近 5 条 → 前缀被截断
        return [sys, ...this.turns.slice(-5)];
      }
      case 'text_format': {
        // 反模式 6：全部历史写成纯文本单条消息
        const lines = [
          `SYSTEM: ${this.systemPrompt(iteration)}`,
          `TASK: ${task}`,
          ...this.turns.map((m) => `[${m.role.toUpperCase()}]: ${m.content}`),
        ];
        return [{ role: 'user', content: lines.join('\n') }];
      }
    }
  }

  // ── Ollama 调用 ─────────────────────────────────────────────────────

  private async chatOnce(messages: OllamaMsg[], tools: Array<Record<string, unknown>>): Promise<OllamaResponse> {
    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools,
        options: { temperature: this.temperature },
        stream: false,
      }),
    });
    if (!resp.ok) {
      throw new OllamaError(`Ollama HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    }
    return (await resp.json()) as OllamaResponse;
  }

  // ── 主流程 ──────────────────────────────────────────────────────────

  async run(task: string): Promise<ModeResult> {
    this.turns = [];
    const started = Date.now();
    const iterations: IterationMetrics[] = [];
    let coldSpeed: number | null = null; // 冷启动求值速度（token/ms），用于估算无缓存基线

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      const messages = this.buildMessages(iteration, task);
      const tools = this.toolsForIteration(iteration);
      const response = await this.chatOnce(messages, tools);
      const evalDur = response.prompt_eval_duration / 1e6;
      const promptTokens = response.prompt_eval_count;
      if (coldSpeed === null && evalDur > 0) coldSpeed = promptTokens / evalDur;

      const msg = response.message;
      const toolCalls = (msg.tool_calls ?? []).map((tc) => tc.function.name);
      iterations.push({
        iteration,
        ttft_ms: (response.load_duration + response.prompt_eval_duration) / 1e6,
        eval_dur_ms: evalDur,
        prompt_tokens: promptTokens,
        completion_tokens: response.eval_count,
        tool_calls: toolCalls,
        final: toolCalls.length === 0,
      });

      if (toolCalls.length > 0) {
        // 追加 assistant（含 tool_calls）到逻辑对话
        this.turns.push({
          role: 'assistant',
          content: msg.content ?? '',
          tool_calls: msg.tool_calls ?? [],
          ...(msg.thinking ? { thinking: msg.thinking } : {}),
        });
        // 执行工具（并行），结果追加到同一对话
        const results = await Promise.all(
          (msg.tool_calls ?? []).map((tc) => {
            const args = typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments || '{}')
              : tc.function.arguments;
            return this.tools.execute(tc.function.name, args as Record<string, unknown>);
          })
        );
        for (let i = 0; i < toolCalls.length; i++) {
          this.turns.push({ role: 'tool', tool_name: toolCalls[i]!, content: results[i]! });
        }
      } else {
        // 无工具调用 → 最终答案
        this.turns.push({
          role: 'assistant',
          content: msg.content ?? '',
          ...(msg.thinking ? { thinking: msg.thinking } : {}),
        });
        break;
      }
    }

    const nonFirst = iterations.slice(1);
    const first = iterations[0]!;
    const avgTtft = nonFirst.length
      ? nonFirst.reduce((s, it) => s + it.ttft_ms, 0) / nonFirst.length
      : first.ttft_ms;
    // 无缓存基线：每轮全量重算整段 prompt 的求值时 = sum(prompt_i / coldSpeed)
    const noCacheEvalMs = coldSpeed
      ? iterations.reduce((s, it) => s + it.prompt_tokens / coldSpeed, 0)
      : iterations.reduce((s, it) => s + it.eval_dur_ms, 0);
    const totalEvalMs = iterations.reduce((s, it) => s + it.eval_dur_ms, 0);
    const cacheRatio = noCacheEvalMs > 0 ? 1 - totalEvalMs / noCacheEvalMs : 0;

    return {
      mode: this.mode,
      model: this.model,
      task,
      iterations,
      total_ms: Date.now() - started,
      first_ttft_ms: first.ttft_ms,
      avg_ttft_ms: avgTtft,
      improvement_pct: first.ttft_ms > 0 ? (1 - avgTtft / first.ttft_ms) * 100 : 0,
      cache_ratio_mean: Math.max(0, Math.min(1, cacheRatio)),
      no_cache_eval_ms: noCacheEvalMs,
      completion_tokens: iterations.reduce((s, it) => s + it.completion_tokens, 0),
    };
  }
}