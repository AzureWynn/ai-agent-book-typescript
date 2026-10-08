// 语音应答：把转写文本交给 Ollama，拿回一句口语化答复（短，直接进 TTS）。
import { Ollama } from 'ollama';
import 'dotenv/config';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

export const VOICE_SYSTEM = `你是一个语音助手，用户在用说的和你说话。
规则：
- 回一句话，不超过 30 字，口语化，不要 markdown、不要列表、不要标点堆砌。
- 直接说答案，不要"好的我来帮你查"这类铺垫。
- 如果没听清，就反问一句最关键的。

第一轮示范（用户说"今天天气怎么样"）你的回复全文只能是：
今天我没法查天气，要不要打开天气应用看看？`;

// 离线臂用确定性模板（不调模型），如实标注它不代表模型能力
export function offlineReply(transcript: string): string {
  if (/天气/.test(transcript)) return '我没法查天气，要打开天气应用吗';
  if (/时间|几点/.test(transcript)) return '现在时间是下午，你还想问什么';
  if (/你好|hi|hello/i.test(transcript)) return '你好，我在听，你说';
  return `你说的是「${transcript.slice(0, 12)}」，我没听清，能再说一遍吗`;
}

export interface Reply {
  text: string;
  outTokens: number;
  source: 'model' | 'offline-template';
}

export async function reply(transcript: string): Promise<Reply> {
  const ollama = new Ollama({ host: BASE_URL });
  const p = ollama.chat({
    model: MODEL,
    messages: [
      { role: 'system', content: VOICE_SYSTEM },
      { role: 'user', content: `用户说：${transcript}` },
    ],
    options: { temperature: 0 },
  });
  const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ollama timeout')), CHAT_TIMEOUT_MS));
  const res = await Promise.race([p, timer]);
  return { text: ((res.message.content) || '').trim(), outTokens: res.eval_count ?? 0, source: 'model' };
}