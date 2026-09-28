import { Ollama } from 'ollama';
import { answerConfig } from './config.js';
import { CASES } from './data.js';
import { FACTOR_LABELS, discoverSchema } from './discovery.js';

export async function llmDiscover(batchSize = 7): Promise<string[]> {
  const ollama = new Ollama({ host: answerConfig.ollamaBaseUrl });
  const found = new Set<string>();
  for (let i = 0; i < CASES.length; i += batchSize) {
    const batch = CASES.slice(i, i + batchSize);
    const prompt = [
      '下面是几起刑事判例的案情描述。请列出所有可能影响判决的因素，每行一个，只写因素名：',
      '',
      ...batch.map((c) => `- ${c.fact}`),
    ].join('\n');
    const response = await ollama.chat({
      model: answerConfig.ollamaModel,
      messages: [{ role: 'user', content: prompt }],
    });
    for (const line of response.message.content.split('\n')) {
      const cleaned = line.replace(/^[\d.\-、\s]+/, '').trim();
      if (cleaned) found.add(cleaned);
    }
  }
  return [...found];
}

function coversRuleFactor(line: string, label: string): boolean {
  const chars = [...label].filter((ch) => !/[的量级与或]/g.test(ch));
  return chars.length > 0 && chars.some((ch) => line.includes(ch));
}

export async function compareDiscovery(): Promise<{ rule: string[]; llm: string[]; covered: string[]; missed: string[] }> {
  const { schema } = discoverSchema();
  const rule = [...new Set([...schema.core, ...schema.extensions.theft, ...schema.extensions.injury, ...schema.extensions.fraud])];
  const llm = await llmDiscover();
  const covered: string[] = [];
  const missed: string[] = [];
  for (const f of rule) {
    const label = FACTOR_LABELS[f] ?? f;
    if (llm.some((line) => coversRuleFactor(line, label))) covered.push(f);
    else missed.push(f);
  }
  return { rule, llm, covered, missed };
}
