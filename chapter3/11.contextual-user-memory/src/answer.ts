import { Ollama } from 'ollama';
import { answerConfig } from './config.js';
import { MemoryCard } from './types.js';

export async function generateDualAnswer(
  query: string,
  cards: MemoryCard[],
  chunks: Array<{ id: string; text: string }>
): Promise<string> {
  const ollama = new Ollama({ host: answerConfig.ollamaBaseUrl });
  const cardText = cards
    .map((c) => `- [${c.key}] ${c.backstory}；${Object.entries(c.facts).map(([k, v]) => `${k}=${v}`).join('，')}`)
    .join('\n');
  const chunkText = chunks.map((c, i) => `[${i + 1}] (${c.id}) ${c.text}`).join('\n');
  const prompt = [
    '你是用户记忆助手，结合常驻记忆卡片和检索到的对话片段回答。要求：',
    '1. 卡片是稳定的事实，片段是出处证据，两者冲突时以卡片为准并说明；',
    '2. 后来的记录覆盖旧偏好，以最新记录为准；',
    '3. 结论后用 [卡片key] 或 [编号] 引用，如 [travel.tokyo_trip][2]；',
    '4. 回答简洁，不超过 200 字。',
    '',
    '记忆卡片：',
    cardText,
    '',
    '对话片段：',
    chunkText,
    '',
    `问题：${query}`,
  ].join('\n');
  const response = await ollama.chat({
    model: answerConfig.ollamaModel,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.message.content.trim();
}
