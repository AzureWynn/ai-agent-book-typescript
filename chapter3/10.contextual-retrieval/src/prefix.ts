import { Ollama } from 'ollama';
import { answerConfig } from './config.js';
import { PREFIXES } from './corpus.js';

export function handPrefix(chunkId: string): string {
  return PREFIXES[chunkId] ?? '';
}

export function contextualText(chunkId: string, text: string): string {
  const prefix = handPrefix(chunkId);
  return prefix ? `${prefix} ${text}` : text;
}

export async function generatePrefix(docText: string, chunkText: string): Promise<string> {
  const ollama = new Ollama({ host: answerConfig.ollamaBaseUrl });
  const prompt = [
    '请用2-3句话说明下面片段在整个文档中的定位（哪份文档、什么主题），只写定位信息，不要回答任何问题：',
    '',
    '<document>',
    docText,
    '</document>',
    '',
    '<chunk>',
    chunkText,
    '</chunk>',
  ].join('\n');
  const response = await ollama.chat({
    model: answerConfig.ollamaModel,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.message.content.trim();
}
