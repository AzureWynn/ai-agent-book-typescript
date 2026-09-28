import { Ollama } from 'ollama';
import { answerConfig } from './config.js';

export interface Evidence {
  id: string;
  text: string;
}

export async function generateAnswer(query: string, evidence: Evidence[]): Promise<string> {
  const ollama = new Ollama({ host: answerConfig.ollamaBaseUrl });
  const context = evidence.map((e, i) => `[${i + 1}] (${e.id}) ${e.text}`).join('\n');
  const prompt = [
    '根据以下用户对话记忆回答问题。要求：',
    '1. 只依据记忆作答；注意后来的记录会覆盖旧偏好（如取消旅行），以最新记录为准；',
    '2. 每个结论后用 [编号] 引用记忆，如 [1][2]；',
    '3. 回答简洁，不超过 200 字。',
    '',
    '记忆：',
    context,
    '',
    `问题：${query}`,
  ].join('\n');
  const response = await ollama.chat({
    model: answerConfig.ollamaModel,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.message.content.trim();
}
