/**
 * 手写 Responses 风格 Agent —— 本地仿真（Ollama）。
 *
 * 学习目标：理解"托管工具"（hosted tools）与 function-calling 的区别。
 *
 * 实现方式：
 * - 复用手写的 Ollama function-calling 机制（模型返回 tool_calls）
 * - 但把工具"包装"成托管类型（web_search / code_interpreter），
 *   模型声明"我要调什么"后，由本层（hosted runner）执行，
 *   并回填成"类型化记录"（web_search_call / code_interpreter_call + citations）
 * - Agent 主循环只看到「已完成的结果记录」，看不到执行过程 ——
 *   这就是 Responses API 与 Chat Completions 的核心差异。
 */

import { tools, findTool, type Tool, type ToolCall } from './tools.js';
import type { Citation, ResponsesResponse, ResponseItem } from './protocol.js';
import { responseText, toolItems, allCitations } from './protocol.js';

export interface AgentOptions {
  baseUrl?: string;
  model?: string;
  maxIterations?: number;
  verbose?: boolean;
  /** 托管 web_search 的 SearXNG 地址 */
  searxngBaseUrl?: string;
  /** 是否强制"澄清优先"（对应官方的 clarify-first 系统提示规则） */
  clarifyFirst?: boolean;
}

export interface AgentRunResult {
  /** 最终纯文本答案 */
  answer: string;
  /** 完整 response 对象（含类型化 tool 记录 + 引用） */
  response: ResponsesResponse;
  iterations: number;
  toolCalls: number;
  /** 类型化工具记录（web_search_call / code_interpreter_call） */
  toolItems: ResponseItem[];
  /** 所有引用 */
  citations: Citation[];
}

/** 类型化消息（仿真 Responses 的 message/tool item） */
type Message = { role: 'user' | 'assistant' | 'system' | 'tool'; content?: string; tool_call_id?: string };

const SYSTEM_PROMPT = `你是一个深度研究助手（deep-research assistant）。

可用工具：
- web_search：搜索实时网络信息（返回带引用的结果）
- code_interpreter：执行 Python/JS 代码做定量计算（返回计算结果）

规则：
1. 需要最新事实或实时数据 → 用 web_search 搜索
2. 所有数学计算必须用 code_interpreter 执行，不得口算
3. 搜索时用精准关键词；一次调用一个查询
4. 当信息足够时，综合搜索与计算结果给出最终答案
5. 最终答案要标注数据来源`;

/** 澄清优先的系统提示（对应官方 clarify-first 规则：先问再搜） */
const CLARIFY_PROMPT = SYSTEM_PROMPT + `

【澄清优先规则】如果用户的研究请求存在关键歧义（例如未指定数据来源、未指定要计算的指标），
必须先向用户提问澄清，在用户回答之前不得调用任何工具。
只有用户明确了偏好后，才能开始搜索与计算。`;

export class HostedToolsAgent {
  private baseUrl: string;
  private model: string;
  private maxIterations: number;
  private verbose: boolean;
  private searxngBaseUrl: string;
  private systemPrompt: string;
  private messages: Message[] = [];

  constructor(options: AgentOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.model = options.model ?? process.env.MODEL_NAME ?? 'gemma4:latest';
    this.maxIterations = options.maxIterations ?? 5;
    this.verbose = options.verbose ?? true;
    this.searxngBaseUrl = options.searxngBaseUrl ?? process.env.SEARXNG_BASE_URL ?? 'http://localhost:8080';
    this.systemPrompt = options.clarifyFirst ? CLARIFY_PROMPT : SYSTEM_PROMPT;
  }

  private log(...args: unknown[]): void {
    if (this.verbose) console.log(...args);
  }

  /** 调 Ollama /api/chat（复用手写 function-calling 协议） */
  private async chat(messages: Message[]): Promise<{ content: string; toolCalls: ToolCall[] }> {
    const body = {
      model: this.model,
      messages,
      tools: tools.map((t) => t.definition),
      temperature: 0,
      stream: false,
    };
    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
    const data = await resp.json() as { message?: { content?: string | Array<unknown>; tool_calls?: ToolCall[] } };
    const msg = data.message ?? {};
    const content = typeof msg.content === 'string' ? msg.content : '';
    return { content, toolCalls: msg.tool_calls ?? [] };
  }

  /**
   * 执行一个"托管工具"调用，返回类型化记录 item。
   * 关键：这一步模拟"服务端托管"——Agent 代码不直接执行工具，
   * 而是由 hosted runner 执行并把结果 + 引用封装成记录。
   */
  private async runHostedTool(call: ToolCall): Promise<ResponseItem> {
    const name = call.function.name;
    let args: Record<string, unknown> = {};
    const raw = call.function.arguments;
    try {
      args = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {});
    } catch {
      /* 忽略解析失败 */
    }
    this.log(`🔧 托管执行: ${name}  参数=${JSON.stringify(args)}`);

    if (name === 'web_search') {
      const query = String(args.query ?? '');
      const { runWebSearch, formatSearchResults } = await import('./hosted-tools.js');
      const results = await runWebSearch(query, this.searxngBaseUrl);
      const { text, citations } = formatSearchResults(results);
      return {
        type: 'web_search_call',
        status: 'completed',
        query,
        citations,
        // 结果文本单独记录（模型下一轮会看到）
        _output: text,
      } as ResponseItem;
    }

    if (name === 'code_interpreter') {
      const code = String(args.code ?? '');
      const { runCodeInterpreter } = await import('./hosted-tools.js');
      const output = await runCodeInterpreter(code);
      return {
        type: 'code_interpreter_call',
        status: 'completed',
        code,
        output,
      } as ResponseItem;
    }

    throw new Error(`未知托管工具: ${name}`);
  }

  /**
   * 主循环：像 Responses API 一样收集 output items，直到模型产出最终 message。
   * 返回一个"response 对象"，内含类型化 tool 记录。
   */
  async run(userInput: string): Promise<AgentRunResult> {
    this.messages = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: userInput },
    ];

    const output: ResponseItem[] = [];
    let iterations = 0;
    let toolCallCount = 0;

    while (iterations < this.maxIterations) {
      iterations++;
      this.log(`\n[迭代 ${iterations}/${this.maxIterations}]`);

      const { content, toolCalls } = await this.chat(this.messages);

      // 没有工具调用 → 模型给出最终答案
      if (toolCalls.length === 0) {
        if (content.trim()) {
          output.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: content }] });
          // 也存入对话历史（若是澄清提问，下一轮用户会回答）
          this.messages.push({ role: 'assistant', content });
        }
        const response: ResponsesResponse = { id: `resp_${Date.now()}`, model: this.model, output };
        return {
          answer: responseText(response),
          response,
          iterations,
          toolCalls: toolCallCount,
          toolItems: toolItems(response),
          citations: allCitations(response),
        };
      }

      // 模型请求了托管工具：记录 assistant 的 tool_calls，执行，回填结果
      this.messages.push({ role: 'assistant', content });

      const currentNames = toolCalls.map((c) => c.function.name);
      for (const call of toolCalls) {
        toolCallCount++;
        const item = await this.runHostedTool(call);
        output.push(item);

        // 结果回填给模型（携带类型化记录的结果文本）
        const outputText = (item as { _output?: string })._output ?? (item as { output?: string }).output ?? '';
        this.messages.push({ role: 'tool', content: outputText, tool_call_id: call.id ?? '' });
      }

      // 【编排引导】若本轮到轮已连续只用 web_search 且没用过 code_interpreter，
      // 提示模型进入计算阶段（模拟官方"模型自主编排"，但本地模型需要提示）
      if (currentNames.every((n) => n === 'web_search')) {
        const usedCalc = output.some((i) => i.type === 'code_interpreter_call');
        if (!usedCalc) {
          this.messages.push({
            role: 'user',
            content: '（提示：如果已经收集到所需数据，请改用 code_interpreter 做计算，不要再重复搜索。）',
          });
          this.log('💡 编排引导: 提示模型改用 code_interpreter');
        }
      }
    }

    const response: ResponsesResponse = {
      id: `resp_${Date.now()}`,
      model: this.model,
      output,
    };
    return {
      answer: responseText(response) || '（达到最大迭代次数，未产出最终答案）',
      response,
      iterations,
      toolCalls: toolCallCount,
      toolItems: toolItems(response),
      citations: allCitations(response),
    };
  }
}