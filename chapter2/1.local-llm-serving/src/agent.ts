/**
 * Ollama 原生工具调用 Agent（对应官方 ollama_native.py 的 OllamaNativeAgent）。
 *
 * 三个核心机制：
 * 1. think 回退：支持思维链的模型传 think=true，思考内容走独立的 thinking 字段；
 *    不支持的模型（HTTP 400）自动回退，每个模型只探测一次并缓存。
 * 2. 流式 ReAct 循环：一轮最多 10 次迭代，产出四种 chunk（thinking / tool_call /
 *    tool_result / content）；本轮内多个工具调用并行执行。
 * 3. 内联 thinking 标签解析：某些服务端会把 <thinking> 原样放进 content，
 *    chat_stream 负责把它拆出来重新归类。
 */

import { ToolRegistry } from './tools.js';

export type Chunk =
  | { type: 'thinking' | 'tool_result' | 'content'; content: string }
  | { type: 'tool_call'; content: { name: string; arguments: Record<string, unknown> } }
  | { type: 'error'; content: string };

interface OllamaMessage {
  role: string;
  content?: string;
  thinking?: string;
  tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
  [key: string]: unknown;
}

interface ChatResponse {
  message: OllamaMessage;
  [key: string]: unknown;
}

export class OllamaError extends Error {
  readonly status: number;
  constructor(status: number, body: string) {
    super(`Ollama HTTP ${status}: ${body.slice(0, 200)}`);
    this.status = status;
  }
}

export interface AgentOptions {
  model?: string;
  baseUrl?: string;
}

export class OllamaNativeAgent {
  readonly model: string;
  readonly baseUrl: string;
  readonly toolRegistry = new ToolRegistry();
  conversationHistory: OllamaMessage[] = [];
  private thinkDisabled = new Set<string>();
  private maxIterations = 10;

  constructor(options: AgentOptions = {}) {
    this.model = options.model ?? process.env.MODEL_NAME ?? 'gemma4:latest';
    this.baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
  }

  /** 单次 /api/chat 调用，返回原始 Response（流式时调用方逐行读 body）。 */
  private async chatOnce(body: Record<string, unknown>): Promise<Response> {
    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new OllamaError(resp.status, text);
    }
    return resp;
  }

  /** 带 think 回退的调用：think=true 失败（400 / 未知错误）→ 去掉 think 重试，缓存结论。 */
  private async chatWithThinkFallback(body: Record<string, unknown>): Promise<Response> {
    if (this.thinkDisabled.has(this.model)) {
      return this.chatOnce(body);
    }
    try {
      return await this.chatOnce({ ...body, think: true });
    } catch (e) {
      if (e instanceof OllamaError && e.status === 400) {
        // 该模型不支持 thinking
        this.thinkDisabled.add(this.model);
        return this.chatOnce(body);
      }
      // 未知错误（旧客户端等）：去掉 think 重试；若错误与 think 无关会再次抛出
      this.thinkDisabled.add(this.model);
      return this.chatOnce(body);
    }
  }

  /** 解析 tool_calls 里的参数（可能是对象，也可能是 JSON 字符串）。 */
  private static normalizeArgs(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return {};
  }

  /** 并行执行多个工具调用（Promise.all 保持顺序）。 */
  private async executeToolCalls(
    toolCalls: Array<{ function: { name: string; arguments: unknown } }>
  ): Promise<string[]> {
    return Promise.all(
      toolCalls.map((tc) =>
        this.toolRegistry.executeTool(tc.function.name, OllamaNativeAgent.normalizeArgs(tc.function.arguments))
      )
    );
  }

  /** 清理 content 里残留的内联 thinking 标签（服务端把标签放回 content 的兜底路径）。 */
  private static stripThinkingTags(content: string): string {
    return content.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
  }

  /** 把 content 中内联的 <thinking> 段拆出来，转成 thinking chunk（官方 chat_stream 逻辑）。 */
  private static *splitInlineThinking(content: string): Generator<Chunk> {
    const re = /<thinking>([\s\S]*?)<\/thinking>/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const before = content.slice(lastIndex, m.index);
      if (before) yield { type: 'content', content: before };
      yield { type: 'thinking', content: m[1]! };
      lastIndex = re.lastIndex;
    }
    const rest = content.slice(lastIndex);
    if (rest) yield { type: 'content', content: rest };
  }

  /** 非流式：单轮调用 + 工具执行 + 最终回复（保持 tools 在第二轮仍可用）。 */
  async chat(
    message: string,
    opts: { useTools?: boolean; temperature?: number; stream?: boolean } = {}
  ): Promise<string> {
    if (opts.stream) {
      // stream 走 chatStream；这里是纯文本返回，直接把最终内容拼出来
      let final = '';
      for await (const chunk of this.chatStream(message, opts)) {
        if (chunk.type === 'content') final += chunk.content;
        else if (chunk.type === 'error') return `Error: ${chunk.content}`;
      }
      return final.trim();
    }

    const useTools = opts.useTools ?? true;
    const temperature = opts.temperature ?? 0.3;
    this.conversationHistory.push({ role: 'user', content: message });

    const tools = useTools ? this.toolRegistry.getToolSchemas() : undefined;
    const data = (await (await this.chatWithThinkFallback({
      model: this.model,
      messages: this.conversationHistory,
      tools,
      options: { temperature },
      stream: false, // 新版本 Ollama 默认 stream=true，必须显式关掉
    })).json()) as ChatResponse;
    const msg = data.message;
    if (msg.tool_calls?.length) {
      const toolCalls = msg.tool_calls;
      this.conversationHistory.push({
        role: 'assistant',
        content: msg.content ?? '',
        tool_calls: toolCalls,
        ...(msg.thinking ? { thinking: msg.thinking } : {}),
      });

      const results = await this.executeToolCalls(toolCalls);
      for (let i = 0; i < toolCalls.length; i++) {
        this.conversationHistory.push({
          role: 'tool',
          tool_name: toolCalls[i]!.function.name,
          content: results[i]!,
        });
      }

      const finalData = (await (await this.chatWithThinkFallback({
        model: this.model,
        messages: this.conversationHistory,
        tools, // 关键：保持工具可用，模型可继续决策
        options: { temperature },
        stream: false,
      })).json()) as ChatResponse;
      const finalContent = OllamaNativeAgent.stripThinkingTags(finalData.message.content ?? '');
      this.conversationHistory.push({
        role: 'assistant',
        content: finalContent,
        ...(finalData.message.thinking ? { thinking: finalData.message.thinking } : {}),
      });
      return finalContent;
    }

    const content = msg.content ?? '';
    this.conversationHistory.push({
      role: 'assistant',
      content,
      ...(msg.thinking ? { thinking: msg.thinking } : {}),
    });
    return content;
  }

  /** 流式 ReAct 循环，产出 thinking / tool_call / tool_result / content / error 块。 */
  async *chatStream(
    message: string,
    opts: { useTools?: boolean; temperature?: number } = {}
  ): AsyncGenerator<Chunk> {
    const useTools = opts.useTools ?? true;
    const temperature = opts.temperature ?? 0.3;
    this.conversationHistory.push({ role: 'user', content: message });

    const tools = useTools ? this.toolRegistry.getToolSchemas() : undefined;
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      const streamResponse = await this.chatWithThinkFallback({
        model: this.model,
        messages: this.conversationHistory,
        tools,
        options: { temperature },
        stream: true,
      });

      let collectedContent = '';
      let collectedThinking = '';
      const pendingToolCalls: Array<{ function: { name: string; arguments: unknown } }> = [];

      for await (const chunk of this.readNdjson(streamResponse)) {
        const msg = (chunk.message ?? {}) as OllamaMessage;

        if (msg.thinking) {
          collectedThinking += msg.thinking;
          yield { type: 'thinking', content: msg.thinking };
        }
        if (msg.content) {
          // 内联 <thinking> 标签拆分；否则原样作为 content
          for (const piece of OllamaNativeAgent.splitInlineThinking(msg.content)) {
            if (piece.type === 'thinking') collectedThinking += piece.content;
            else collectedContent += piece.content;
            yield piece;
          }
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            // 去重：部分服务端会在每个 chunk 里带累计的完整 tool_calls 列表
            const dup = pendingToolCalls.some(
              (p) => p.function.name === tc.function.name && JSON.stringify(p.function.arguments) === JSON.stringify(tc.function.arguments)
            );
            if (!dup) {
              pendingToolCalls.push(tc);
              yield {
                type: 'tool_call',
                content: { name: tc.function.name, arguments: OllamaNativeAgent.normalizeArgs(tc.function.arguments) },
              };
            }
          }
        }
      }

      if (pendingToolCalls.length > 0) {
        this.conversationHistory.push({
          role: 'assistant',
          content: collectedContent,
          tool_calls: pendingToolCalls,
          ...(collectedThinking ? { thinking: collectedThinking } : {}),
        });

        const results = await this.executeToolCalls(pendingToolCalls);
        for (let i = 0; i < pendingToolCalls.length; i++) {
          yield { type: 'tool_result', content: results[i]! };
          this.conversationHistory.push({
            role: 'tool',
            tool_name: pendingToolCalls[i]!.function.name,
            content: results[i]!,
          });
        }
        // 继续循环，让模型基于工具结果决策
      } else {
        this.conversationHistory.push({
          role: 'assistant',
          content: collectedContent,
          ...(collectedThinking ? { thinking: collectedThinking } : {}),
        });
        break;
      }
    }

    if (iteration >= this.maxIterations) {
      yield { type: 'error', content: 'Maximum iterations reached in ReAct loop' };
    }
  }

  /** 逐行解析 /api/chat 的 NDJSON 流式响应。 */
  private async *readNdjson(resp: Response): AsyncGenerator<Record<string, unknown>> {
    const reader = resp.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) yield JSON.parse(line) as Record<string, unknown>;
      }
    }
  }

  resetConversation(): void {
    this.conversationHistory = [];
  }
}