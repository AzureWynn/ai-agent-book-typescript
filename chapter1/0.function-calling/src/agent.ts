/**
 * 纯手写 Agent —— 不依赖 LangChain，直接调 Ollama /api/chat。
 *
 * 完整演示 Function Calling 协议的三步：
 * 1. 请求带 tools 描述 → 模型知道有哪些工具
 * 2. 响应返回 tool_calls → 模型说"我要用工具 + 参数"
 * 3. 执行工具，结果以 role:"tool" 回填 → 模型看结果继续推理
 */

import { tools, type Tool } from './tools.js';
import { loadSkill, wrapSkill, type LoadedSkill } from './skills.js';

// ---------- 消息类型（简化版 LangChain Message） ----------
export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: Role;
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    index?: number;
    arguments: string | Record<string, unknown>;
  };
}

export interface ChatResponse {
  model: string;
  created_at: string;
  message: Message;
  done: boolean;
}

export interface AgentOptions {
  baseUrl?: string;
  model?: string;
  maxIterations?: number;
  verbose?: boolean;
  /** 注入的 skill（已加载的包），不传则用默认 SYSTEM_PROMPT + 全局工具 */
  skill?: LoadedSkill;
}

export interface AgentRunResult {
  answer: string;
  iterations: number;
  toolCalls: number;
  messages: Message[];
}

const SYSTEM_PROMPT = `你是一个会调用工具的助手。
如果问题需要计算，调用 calculator 工具。
如果问题需要当前时间，调用 get_current_time 工具。
调用工具后，根据工具返回结果给出最终答案。
当不再需要工具时，直接给出最终答案。`;

export class FunctionCallingAgent {
  private baseUrl: string;
  private model: string;
  private maxIterations: number;
  private verbose: boolean;
  private systemPrompt: string;
  /** 模型可用的工具 = 全局工具 + skill 专属工具 */
  private allTools: Tool[];
  /** 当前 skill 声明允许使用的工具（官方字段 allowed-tools；运行时据此授权） */
  private allowedTools: Set<string>;

  constructor(options: AgentOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.model = options.model ?? process.env.MODEL_NAME ?? 'gemma4:latest';
    this.maxIterations = options.maxIterations ?? 5;
    this.verbose = options.verbose ?? true;

    // 注入 skill：方法论拼进 system prompt，专属工具并入工具列表，allowed-tools 授权
    let prompt = SYSTEM_PROMPT;
    this.allTools = [...tools];
    this.allowedTools = new Set();
    if (options.skill) {
      prompt = `${prompt}\n\n${wrapSkill(options.skill.instruction)}`;
      this.allowedTools = new Set(options.skill.allowedTools);
      if (options.skill.tools.length > 0) {
        this.allTools.push(...options.skill.tools);
        this.log(`🗂️ 已加载 skill "${options.skill.name}" 的专属工具: ` +
          options.skill.tools.map((t) => t.definition.function.name).join(', '));
      }
    }
    this.systemPrompt = prompt;
  }

  /** 异步创建：先加载 skill 包（含动态加载专属工具），再构造 Agent */
  static async create(options: AgentOptions & { skillName?: string } = {}): Promise<FunctionCallingAgent> {
    const { skillName, ...rest } = options;
    let skill: LoadedSkill | undefined;
    if (skillName) {
      const loaded = await loadSkill(skillName);
      if (loaded) {
        skill = loaded;
      } else {
        console.warn(`⚠️ 未找到 skill "${skillName}"，使用默认配置`);
      }
    }
    return new FunctionCallingAgent({ ...rest, skill });
  }

  private log(...args: unknown[]): void {
    if (this.verbose) console.log(...args);
  }

  /** 运行时授权检查：工具是否允许执行（对齐 allowed-tools 语义） */
  canExecute(name: string): { allowed: boolean; reason?: string } {
    const tool = this.allTools.find((t) => t.definition.function.name === name);
    if (!tool) return { allowed: false, reason: `未注册工具 ${name}` };
    // 无 skill（allowedTools 为空）→ 放行所有已注册工具；有 skill → 只放行声明允许的
    if (this.allowedTools.size > 0 && !this.allowedTools.has(name)) {
      return { allowed: false, reason: `skill 的 allowed-tools 未包含 ${name}（声明为: ${[...this.allowedTools].join(' ')}）` };
    }
    return { allowed: true };
  }

  /** 发送一轮请求到 Ollama，拿到模型回复 */
  private async chat(messages: Message[]): Promise<Message> {
    const body = {
      model: this.model,
      messages,
      tools: this.allTools.map((t) => t.definition), // 关键：把工具描述给模型
      temperature: 0,
      stream: false, // 一次性返回完整 JSON，而非 NDJSON 流
    };
    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw new Error(`Ollama HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
    }
    const data = await resp.json() as ChatResponse;
    return data.message;
  }

  /** 执行模型请求的工具调用，返回结果文本 */
  private async runToolCall(call: ToolCall): Promise<string> {
    const name = call.function.name;
    // Ollama 可能返回对象或 JSON 字符串，统一解析为对象
    let args: Record<string, unknown> = {};
    const raw = call.function.arguments;
    try {
      args = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {});
    } catch {
      this.log('⚠️ 工具参数不是合法 JSON，按空对象处理');
    }
    this.log(`🔧 调用工具: ${name}  参数=${JSON.stringify(args)}`);

    const tool = this.allTools.find((t) => t.definition.function.name === name);
    if (!tool) {
      return `错误：未找到工具 ${name}`;
    }

    // 【运行时授权】skill 的 allowed-tools 未包含该工具 → 拒绝执行
    const check = this.canExecute(name);
    if (!check.allowed) {
      const msg = `⛔ 无权调用工具 ${name}：${check.reason}`;
      this.log(msg);
      return msg;
    }

    try {
      return await tool.execute(args);
    } catch (e) {
      return `工具执行异常: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /**
   * 主循环：思考-行动-观察，直到模型不再请求工具。
   */
  async run(userInput: string): Promise<AgentRunResult> {
    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: userInput },
    ];

    let iterations = 0;
    let toolCallCount = 0;

    while (iterations < this.maxIterations) {
      iterations++;
      this.log(`\n[迭代 ${iterations}/${this.maxIterations}]`);

      const response = await this.chat(messages);

      // 模型是否要调用工具？
      if (!response.tool_calls || response.tool_calls.length === 0) {
        const answer = response.content ?? '';
        this.log('✅ 模型未请求工具，视为最终答案');
        return { answer, iterations, toolCalls: toolCallCount, messages };
      }

      // 模型请求了工具：把带 tool_calls 的 assistant 消息存进历史
      messages.push(response);

      for (const call of response.tool_calls) {
        toolCallCount++;
        const result = await this.runToolCall(call);
        this.log(`👀 观察: ${result}`);

        // 关键：工具结果必须以 role:"tool" 回填，并带上对应的 tool_call_id
        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: call.id,
        });
      }
    }

    return {
      answer: '抱歉，达到最大迭代次数，任务未完成。',
      iterations,
      toolCalls: toolCallCount,
      messages,
    };
  }
}