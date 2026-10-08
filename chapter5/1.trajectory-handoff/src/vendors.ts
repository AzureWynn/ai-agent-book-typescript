// 双"厂商"：A=Ollama /api/chat（messages 结构），B=Ollama /api/generate（prompt 字符串）。
// 同一模型、两种接口形状——测的是格式接管，不是模型差异。如实声明。
// 熔断人为注入：A 在完成 2 次工具调用后开始回 429（官方 INJECTED_OUTAGE 对应）。
import { Ollama } from 'ollama';
import 'dotenv/config';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

export const SWITCH_AFTER = 2;
export const INJECTED_OUTAGE = { injected: true, statuses: [429, 429, 503], note: '人为注入的连续过载，用来触发熔断；非厂商真实故障' };

export class ProviderError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

export const SYSTEM = `你是旅行预算助手。可用工具（一次调一个，用 \`\`\`tool JSON 块）：
- get_flight_price {"city":"东京"}：查机票单价
- get_hotel_price {"city":"东京"}：查酒店单价
- get_meal_budget {"city":"东京"}：查餐饮单价
查全三项再算总额（2人3天），以 FINAL: 开头报分项和总额。先查再算，不许编数字。
你有手，自己调工具办，不给用户写教程。

第一轮示范（你的第一轮回复全文只能是下面三行）：
\`\`\`tool
{"name":"get_flight_price","args":{"city":"东京"}}
\`\`\``;

let aDown = false;
export function resetOutage(): void { aDown = false; }
export function tripOutage(): void { aDown = true; }

export async function callA(messages: { role: string; content: string }[]): Promise<{ text: string; outTokens: number }> {
  if (aDown) {
    // 2 次工具调用完成后 A 持续 429（切走后不再回来）
    throw new ProviderError(429, 'vendorA overloaded (injected): too many requests');
  }
  const ollama = new Ollama({ host: BASE_URL });
  const p = ollama.chat({
    model: MODEL,
    messages: messages as { role: 'user' | 'assistant' | 'system'; content: string }[],
    options: { temperature: 0 },
  });
  const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), CHAT_TIMEOUT_MS));
  const res = await Promise.race([p, timer]);
  return { text: (res.message.content || '').trim(), outTokens: res.eval_count ?? 0 };
}

export async function callB(prompt: string): Promise<{ text: string; outTokens: number }> {
  const ollama = new Ollama({ host: BASE_URL });
  const p = ollama.generate({ model: MODEL, prompt, options: { temperature: 0 } });
  const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), CHAT_TIMEOUT_MS));
  const res = await Promise.race([p, timer]);
  return { text: (res.response || '').trim(), outTokens: res.eval_count ?? 0 };
}
