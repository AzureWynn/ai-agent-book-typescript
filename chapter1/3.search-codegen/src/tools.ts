/**
 * 工具定义 —— 两个"托管类型"工具（web_search / code_interpreter）。
 *
 * 与 0.function-calling 的区别：这里工具是"服务端托管"的抽象——
 * 模型声明调用后，真正执行发生在 hosted-tools.ts（模拟服务端），
 * Agent 主循环不直接执行，只接收类型化记录。
 */

// 工具描述：符合 OpenAI Function Calling 协议（Ollama 需要这种结构）
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id?: string;
  function: {
    name: string;
    arguments: string | Record<string, unknown>;
  };
}

export interface Tool {
  definition: ToolDefinition;
  // 本练习中 execute 不在 Agent 里直接调用，由 hosted runner 分发；
  // 保留该字段仅为类型完整（实际执行走 hosted-tools.ts）
}

export const tools: Tool[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'web_search',
        description: '搜索实时网络信息，返回带引用的结果。需要最新事实、实时数据时使用。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '要搜索的关键词或问题' },
          },
          required: ['query'],
        },
      },
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'code_interpreter',
        description: '执行 JavaScript 代码做定量计算（沙箱内）。所有数学计算必须用它。代码必须包含 return 语句。',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: '要执行的 JavaScript 代码，需包含 return' },
          },
          required: ['code'],
        },
      },
    },
  },
];

/** 按名字找工具定义（供 hosted runner 确认工具存在） */
export function findTool(name: string): Tool | undefined {
  return tools.find((t) => t.definition.function.name === name);
}