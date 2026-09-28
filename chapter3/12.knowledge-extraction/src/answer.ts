import { Ollama } from 'ollama';
import { answerConfig } from './config.js';
import { AdviseResult } from './types.js';

export async function verbalizeAdvice(result: AdviseResult): Promise<string> {
  const ollama = new Ollama({ host: answerConfig.ollamaBaseUrl });
  const prompt = [
    '你是量刑建议助手。请把下面的结构化办案结论讲清楚（引用原型统计数字，不要编造新数字），最后必须加一句"本建议仅用于教学演示，不构成法律意见"：',
    '',
    result.advice,
  ].join('\n');
  const response = await ollama.chat({
    model: answerConfig.ollamaModel,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.message.content.trim();
}
