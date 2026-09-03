/**
 * 工具定义 —— 不用 LangChain，就是普通 TypeScript 对象。
 *
 * 发给模型的是这个"声明"（JSON 描述），真正干活的是 execute 里的 JS。
 * 模型"知道"工具，靠的就是 tools.ts 里的 name / description / parameters。
 */

// 工具描述：符合 OpenAI Function Calling 协议
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description?: string }>;
      required: string[];
    };
  };
}

// 执行器：name -> (args) => 结果字符串
export type ToolExecutor = (args: Record<string, unknown>) => Promise<string> | string;

export interface Tool {
  definition: ToolDefinition;
  execute: ToolExecutor;
}

/** 简单四则运算（教学用；生产应换安全解析器，避免 eval 注入） */
function safeCalc(expression: string): string {
  const cleaned = expression.replace(/\s+/g, '');
  if (!/^[\d+\-*/().%]+$/.test(cleaned)) {
    return '表达式含非法字符，仅支持数字和 + - * / ( ) . %';
  }
  try {
    // 教学演示用 Function；生产环境请用 mathjs 或自定义解析器
    const result = Function(`"use strict"; return (${cleaned});`)();
    return `计算结果: ${result}`;
  } catch (e) {
    return `计算失败: ${e instanceof Error ? e.message : '未知错误'}`;
  }
}

export const tools: Tool[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'calculator',
        description: '用于执行数学计算。输入数学表达式，如 "100 * 1.2 + 50"。不要自己心算！',
        parameters: {
          type: 'object',
          properties: {
            expression: { type: 'string', description: '数学表达式' },
          },
          required: ['expression'],
        },
      },
    },
    execute: ({ expression }) => safeCalc(String(expression ?? '')),
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_current_time',
        description: '获取当前本地时间。当用户问"现在几点/今天日期"时使用。',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    execute: () => {
      const now = new Date();
      return `当前时间: ${now.toLocaleString('zh-CN')}`;
    },
  },
];

/** 按名字找工具 */
export function findTool(name: string): Tool | undefined {
  return tools.find((t) => t.definition.function.name === name);
}