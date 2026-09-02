import { ChatOllama } from '@langchain/ollama';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { WebSearchTool } from './tools.js';

export interface WebSearchAgentOptions {
  model?: string;
  baseUrl?: string;
  verbose?: boolean;
  maxIterations?: number;
  tools: WebSearchTool[];
}

export interface AgentRunResult {
  answer: string;
  iterations: number;
  toolCalls: number;
  trace: TraceStep[];
}

/** ReAct 轨迹步骤：思考 → 行动 → 观察 → 最终答案（对应官方 STEP_LABELS） */
export type TraceStep =
  | { iteration: number; type: 'thought'; content: string }
  | { iteration: number; type: 'action'; tool: string; args: Record<string, unknown> }
  | { iteration: number; type: 'observation'; tool: string; content: string }
  | { iteration: number; type: 'answer'; content: string };

const STEP_LABELS: Record<TraceStep['type'], [string, string]> = {
  thought: ['💭', '思考'],
  action: ['🔧', '行动'],
  observation: ['👀', '观察'],
  answer: ['✅', '最终答案'],
};

export function formatTraceStep(step: TraceStep, maxLen = 500): string {
  const [icon, label] = STEP_LABELS[step.type];
  const prefix = `${icon} [${step.iteration}] ${label}`;
  if (step.type === 'action') {
    const args = JSON.stringify(step.args);
    return `${prefix}: 调用工具 ${step.tool}  参数=${args}`;
  }
  const content = String(step.content).trim();
  const truncated =
    content.length > maxLen
      ? content.slice(0, maxLen) + `…（省略 ${content.length - maxLen} 字）`
      : content;
  return `${prefix}: ${truncated}`;
}

const SYSTEM_PROMPT = `你是一个智能联网搜索助手。

请按照以下步骤处理：
1. 分析用户问题，识别关键信息需求
2. 如果问题需要实时或外部信息，使用 web_search 工具搜索
3. 如果需要更多信息，可以多次调用搜索工具
4. 综合所有信息，生成准确、全面的答案
5. 当信息足够时，直接给出最终答案，不要再调用工具

注意：
- 搜索时使用精准的关键词
- 优先参考最新、最权威的信息
- 答案要结构清晰、有理有据
- 如果多次搜索后仍信息不足，如实说明`;

export class WebSearchAgent {
  private llm: ChatOllama;
  private tools: WebSearchTool[];
  private verbose: boolean;
  private maxIterations: number;
  private messages: (HumanMessage | AIMessage | ToolMessage | SystemMessage)[] = [];
  private trace: TraceStep[] = [];

  constructor(options: WebSearchAgentOptions) {
    this.tools = options.tools;
    this.verbose = options.verbose ?? true;
    this.maxIterations = options.maxIterations ?? 5;

    this.llm = new ChatOllama({
      model: options.model ?? process.env.MODEL_NAME ?? 'qwen2.5:7b',
      baseUrl: options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      temperature: 0,
    });
  }

  private emit(step: TraceStep): void {
    this.trace.push(step);
    if (this.verbose) {
      console.log(formatTraceStep(step));
    }
  }

  /**
   * 执行搜索并生成答案（对应官方 search_and_answer）。
   * ReAct 循环：模型返回 tool_calls → 执行工具 → 观察回填 → 直到给出最终答案。
   */
  async searchAndAnswer(userQuestion: string): Promise<AgentRunResult> {
    this.messages = [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(userQuestion),
    ];
    this.trace = [];

    let iterations = 0;
    let toolCallCount = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      const response = await this.llm.bindTools(this.tools).invoke(this.messages);
      this.messages.push(response);

      // 捕获思考过程（部分模型支持 reasoning_content，若存在则记录）
      const reasoning = (response as { reasoning_content?: string }).reasoning_content;
      if (reasoning) {
        this.emit({ iteration: iterations, type: 'thought', content: reasoning });
      }

      // 没有工具调用 → 模型给出最终答案
      if (!response.tool_calls || response.tool_calls.length === 0) {
        const content = typeof response.content === 'string' ? response.content : '';
        this.emit({ iteration: iterations, type: 'answer', content });
        return {
          answer: content,
          iterations,
          toolCalls: toolCallCount,
          trace: this.trace,
        };
      }

      // 处理工具调用
      for (const toolCall of response.tool_calls) {
        toolCallCount++;
        this.emit({
          iteration: iterations,
          type: 'action',
          tool: toolCall.name ?? 'unknown',
          args: (toolCall.args ?? {}) as Record<string, unknown>,
        });

        const found = this.tools.find((t) => t.name === toolCall.name);
        let toolResult: string;
        if (!found) {
          toolResult = `错误：未找到工具 ${toolCall.name}`;
        } else {
          try {
            const raw = await found.invoke(toolCall.args);
            toolResult = typeof raw === 'string' ? raw : JSON.stringify(raw);
          } catch (e) {
            toolResult = `工具执行异常: ${e instanceof Error ? e.message : String(e)}`;
          }
        }

        this.emit({
          iteration: iterations,
          type: 'observation',
          tool: toolCall.name ?? 'unknown',
          content: toolResult,
        });
        this.messages.push(
          new ToolMessage({ content: toolResult, tool_call_id: toolCall.id ?? '' })
        );
      }
    }

    const msg = '抱歉，搜索过程超过了最大迭代次数，请稍后重试。';
    this.emit({ iteration: iterations, type: 'answer', content: msg });
    return {
      answer: msg,
      iterations,
      toolCalls: toolCallCount,
      trace: this.trace,
    };
  }

  /** 清空对话历史（对应官方 clear_history） */
  clearHistory(): void {
    this.messages = [];
  }
}