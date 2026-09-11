/**
 * ReAct 工具调用 Agent（对齐 2-1/2-3 的模式，Ollama 原生工具调用）。
 * 运行单个任务，返回轨迹（工具调用序列 + 最终答案），由 env 做客观 reward 判定。
 */

import { executeTool, NORMAL_WIKI, RANDOMIZED_WIKI, TONE, getToolSchemas } from './env.js';
import type { ToolCall } from './env.js';
import type { AblationConfig } from './ablations.js';

export interface RunResult {
  taskId: string;
  arm: string;
  reward: 0 | 1;
  info: string[];
  calls: ToolCall[];
  finalAnswer: string;
  iterations: number;
  error?: string;
}

interface OllamaMsg {
  role: string;
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
  tool_name?: string;
  thinking?: string;
}

interface OllamaResponse {
  message: OllamaMsg;
}

export class OllamaError extends Error {}

export class AblationAgent {
  readonly model: string;
  readonly baseUrl: string;
  private maxIterations = 12;

  constructor() {
    this.model = process.env.MODEL_NAME ?? 'gemma4:latest';
    this.baseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
  }

  /** 按消融配置组装 system prompt（语气 + 策略 wiki）。 */
  private buildSystemPrompt(cfg: AblationConfig): string {
    const tone = TONE[cfg.tone];
    const wiki = cfg.randomizeWiki ? RANDOMIZED_WIKI : NORMAL_WIKI;
    return [
      tone,
      '',
      'You are a travel booking agent. Use the tools to search and book.',
      'A task is NOT complete until you have called book_flight or book_hotel. Merely reporting search results or carrier info is not an answer.',
      'Once you have identified the correct flight or hotel, ALWAYS complete the booking, then reply with a short confirmation.',
      '',
      wiki,
    ].join('\n');
  }

  private async chatOnce(messages: OllamaMsg[], tools: Array<Record<string, unknown>>): Promise<OllamaResponse> {
    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools,
        options: { temperature: 0.2 },
        stream: false,
      }),
    });
    if (!resp.ok) throw new OllamaError(`Ollama HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    return (await resp.json()) as OllamaResponse;
  }

  async runTask(taskId: string, request: string, cfg: AblationConfig): Promise<RunResult> {
    const messages: OllamaMsg[] = [
      { role: 'system', content: this.buildSystemPrompt(cfg) },
      { role: 'user', content: request },
    ];
    const tools = getToolSchemas(cfg.removeToolDescriptions);
    const calls: ToolCall[] = [];
    let finalAnswer = '';
    let iterations = 0;

    for (let i = 0; i < this.maxIterations; i++) {
      iterations++;
      const response = await this.chatOnce(messages, tools);
      const msg = response.message;
      const toolCalls = msg.tool_calls ?? [];

      if (toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: msg.content ?? '',
          tool_calls: toolCalls,
          ...(msg.thinking ? { thinking: msg.thinking } : {}),
        });
        const results = await Promise.all(
          toolCalls.map(async (tc) => {
            const args = typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments || '{}')
              : tc.function.arguments;
            calls.push({ name: tc.function.name, args: args as Record<string, unknown> });
            return executeTool(tc.function.name, args as Record<string, unknown>);
          })
        );
        for (let j = 0; j < toolCalls.length; j++) {
          messages.push({ role: 'tool', tool_name: toolCalls[j]!.function.name, content: results[j]! });
        }
      } else {
        finalAnswer = msg.content ?? '';
        messages.push({ role: 'assistant', content: finalAnswer, ...(msg.thinking ? { thinking: msg.thinking } : {}) });
        break;
      }
    }

    return { taskId, arm: cfg.name, reward: 0, info: [], calls, finalAnswer, iterations };
  }
}