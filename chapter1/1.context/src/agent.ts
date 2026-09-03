import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { allTools } from './tools.js';
import type { AblationConfig } from './types.js';

// 系统提示词：赋予 Agent 角色和推理指令
const SYSTEM_PROMPT = `你是一个专业的财务分析助手。
你的任务是帮助用户分析财报、计算数据、转换货币。

【推理规则】
1. 思考时，请先在 <thought> 标签内写出你的思考过程。
2. 如果需要计算，必须使用 calculator 工具，不要心算。
3. 如果需要汇率，必须使用 convert_currency 工具。
4. 如果需要读文件，必须使用 parse_pdf 工具。
5. 只有当你收集齐所有信息后，才能给出最终答案。
6. 最终答案要简洁、专业。
`;

type AgentMessage = HumanMessage | AIMessage | ToolMessage | SystemMessage;

export class FinancialAgent {
  private llm: ChatOllama;
  private config: AblationConfig;
  private messages: AgentMessage[] = [];

  constructor(config: AblationConfig) {
    this.config = config;

    // 初始化 Ollama 模型
    // temperature 设为 0，保证实验的可重复性
    this.llm = new ChatOllama({
      model: process.env.MODEL_NAME || 'gemma4:latest',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      temperature: 0, // 保证实验的可重复性
    });

    // 初始化系统消息
    this.messages.push(new SystemMessage(SYSTEM_PROMPT));
  }

  /**
   * 核心循环：Agent 的思考-行动-观察 循环
   *
   * 返回值说明：
   * - finalAnswer：模型给出的终止回复（最终答案），撑满迭代上限时为 null
   * - answer：finalAnswer 的展示用别名；无终止回复时为占位提示
   * - toolResultTexts：实际发送给模型（可能被隐藏）的工具结果文本
   */
  async run(userInput: string): Promise<{
    answer: string;
    finalAnswer: string | null;
    iterations: number;
    toolCalls: number;
    toolResultTexts: string[];
  }> {
    // 1. 加入用户消息
    this.messages.push(new HumanMessage(userInput));

    let iterations = 0;
    let toolCallCount = 0;
    const toolResultTexts: string[] = [];
    const maxIterations = 10; // 防止死循环

    while (iterations < maxIterations) {
      iterations++;

      // 2. 【消融点 1：历史记录】
      // 如果是 No History 模式，每次只发 System + 原始用户消息（忘记一切历史）
      let messagesToSend: AgentMessage[] = this.messages;
      if (!this.config.withHistory && iterations > 1) {
        const systemMsg = this.messages[0]; // 保留 System
        const firstHuman = this.messages.find(
          (m): m is HumanMessage => m instanceof HumanMessage
        );
        messagesToSend = [systemMsg, firstHuman].filter(
          (m): m is AgentMessage => m != null
        );
      }

      // 3. 【消融点 2：推理能力】
      // 如果是 No Reasoning，修改 System Prompt，禁止思考
      if (!this.config.withReasoning) {
        messagesToSend = messagesToSend.map(msg => {
          if (msg instanceof SystemMessage) {
            return new SystemMessage('你是一个财务助手。不要输出 <thought> 标签，不要解释过程，直接调用工具或给出最终答案。');
          }
          return msg;
        });
      }

      // 4. 调用 LLM
      // 【消融点 3：工具调用】
      // 如果是 No Tool Calls，不传 tools 参数
      const llmWithTools = this.config.withToolCalls
        ? this.llm.bindTools(allTools)
        : this.llm;

      const response = await llmWithTools.invoke(messagesToSend);

      // 5. 记录 AI 的回复
      this.messages.push(response);

      // 6. 检查是否有工具调用
      if (!response.tool_calls || response.tool_calls.length === 0) {
        // 没有工具调用，说明任务结束或 AI 放弃了
        const content = typeof response.content === 'string' ? response.content : '';
        return {
          answer: content,
          finalAnswer: content.trim() !== '' ? content : null,
          iterations,
          toolCalls: toolCallCount,
          toolResultTexts,
        };
      }

      // 7. 处理工具调用
      for (const toolCall of response.tool_calls) {
        toolCallCount++;

        // 找到对应的工具
        const tool = allTools.find(t => t.name === toolCall.name);
        let toolResult = '';

        if (!tool) {
          toolResult = `错误：未找到工具 ${toolCall.name}`;
        } else {
          // 执行工具
          try {
            toolResult = await tool.invoke(toolCall.args);
          } catch (e) {
            toolResult = `工具执行异常: ${e}`;
          }
        }

        // 8. 【消融点 4：工具结果】
        // 如果是 No Tool Results，屏蔽真实结果
        if (!this.config.withToolResults) {
          toolResult = '[工具结果已隐藏：AI 无法看到计算结果，只能猜测]';
        }

        // 记录实际发送给模型的内容（grounding 评估用）
        toolResultTexts.push(toolResult);

        // 将工具结果加入历史
        this.messages.push(new ToolMessage({
          content: toolResult,
          tool_call_id: toolCall.id!,
        }));
      }
    }

    return {
      answer: '⚠️ 达到最大迭代次数，任务未完成',
      finalAnswer: null,
      iterations,
      toolCalls: toolCallCount,
      toolResultTexts,
    };
  }

  // 当前会话消息数（status 命令用）
  get messageCount(): number {
    return this.messages.length;
  }

  // 重置对话，用于新一轮对话 / 交互模式 reset 命令
  reset() {
    this.messages = [new SystemMessage(SYSTEM_PROMPT)];
  }
}