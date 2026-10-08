// 流式取半截：Ollama stream:true 真流，按字符比例切断（模拟传输中断）。
// 断点只做 text 与 tool_args：本地模型无独立思考通道，reasoning 记 N/A（官方 prefill 在此本就退化）。
import { Ollama } from 'ollama';
import 'dotenv/config';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

export type BreakPoint = 'text' | 'tool_args';
export const TASK_TEXT = '用中文写一份东京3日游简述：分三段，每天一段，每段先写"第X天："再写安排，共约150字。直接输出正文。';
export const TASK_JSON = '只输出一个 JSON（无解释）：{"city":"东京","days":3,"budget_jpy":150000,"must_eat":["寿司","拉面"]}，保持键名与值。';

export interface ChatMsg {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function chatOnce(messages: ChatMsg[]): Promise<{ text: string; outTokens: number }> {
  const ollama = new Ollama({ host: BASE_URL });
  const res = await ollama.chat({ model: MODEL, messages, options: { temperature: 0 } });
  return { text: (res.message.content || '').trim(), outTokens: res.eval_count ?? 0 };
}

// 真流：收到 cutChars 个字符即掐断（固定位置断点，诚实声明非比例）。
export async function streamUntil(task: string, cutChars = 120): Promise<{ partial: string }> {
  const ollama = new Ollama({ host: BASE_URL });
  const stream = await ollama.chat({ model: MODEL, messages: [{ role: 'user', content: task }], options: { temperature: 0 }, stream: true });
  let acc = '';
  for await (const chunk of stream) {
    acc += chunk.message.content;
    if (acc.length >= cutChars) break;
  }
  return { partial: acc };
}
