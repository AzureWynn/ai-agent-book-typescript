// llm.ts —— Ollama 聊天封装
//
// 提供两类调用：
//   1. chatOnce：非流式，一次拿到完整回复（可能带 tool_calls）。
//   2. chatStream：流式，逐步打印 token；返回完整消息与一个 abort 控制器，
//      供"框架级替换式 steering"中途中止生成使用。

import { Ollama, type ChatResponse, type Message } from 'ollama';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface ChatArgs {
  model: string;
  client: Ollama;
  messages: Message[];
  tools?: object[];
  stream?: boolean;
  /** 流式时每收到一段文本就回调（用于打印/计时） */
  onToken?: (text: string) => void;
  /** 中止当前生成（替换式 steering 用） */
  signal?: AbortSignal;
}

export interface ChatOutcome {
  /** 完整 assistant 消息（含 tool_calls，若有） */
  message: Message;
  /** 流式迭代器，可调用 abort() 中止生成 */
  stream?: { abort: () => void };
}

function normalizeToolCalls(raw: unknown): Message['tool_calls'] {
  if (Array.isArray(raw)) {
    return raw.map((c) => {
      const args =
        typeof c.function.arguments === 'string'
          ? JSON.parse(c.function.arguments || '{}')
          : c.function.arguments ?? {};
      return {
        function: { name: c.function.name, arguments: args },
      };
    });
  }
  return undefined;
}

export async function chat({ model, client, messages, tools, stream, onToken, signal }: ChatArgs): Promise<ChatOutcome> {
  if (stream) {
    const it = await client.chat({
      model,
      messages: messages as unknown as Message[],
      tools: tools as never,
      stream: true,
      options: { temperature: 0.2 },
    });
    let content = '';
    let toolCalls: Message['tool_calls'];
    for await (const chunk of it) {
      if (signal?.aborted) {
        it.abort();
        break;
      }
      const m = chunk as ChatResponse;
      if (m.message?.content) {
        content += m.message.content;
        onToken?.(m.message.content);
      }
      if (m.message?.tool_calls?.length) toolCalls = normalizeToolCalls(m.message.tool_calls);
    }
    return { message: { role: 'assistant', content, tool_calls: toolCalls }, stream: { abort: () => it.abort() } };
  }

  const resp = await client.chat({
    model,
    messages: messages as unknown as Message[],
    tools: tools as never,
    stream: false,
    options: { temperature: 0.2 },
  });
  const m = resp as ChatResponse;
  return { message: { role: 'assistant', content: m.message?.content ?? '', tool_calls: normalizeToolCalls(m.message?.tool_calls) } };
}

/** 把工具结果拼成 role: tool 的消息 */
export function toolResultMessage(content: string): Message {
  return { role: 'tool', content };
}
