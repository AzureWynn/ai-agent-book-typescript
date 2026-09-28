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
    '根据以下法条证据回答问题。要求：',
    '1. 只依据证据作答，不要编造法条编号以外的内容；',
    '2. 每个结论后用 [编号] 引用证据，如 [1][3]；',
    '3. 回答简洁，不超过 200 字。',
    '',
    '证据：',
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
