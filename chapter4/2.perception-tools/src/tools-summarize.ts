import { ToolDef, fail, numArg, ok, strArg } from './types.js';

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export const summarizeTools: ToolDef[] = [
  {
    name: 'text_summarizer',
    description: 'Extractive summary: first sentences up to max_length (offline, no LLM).',
    category: 'summarize',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to summarize' },
        max_length: { type: 'number', description: 'Target length in characters', default: 500 },
      },
      required: ['text'],
    },
    handler: async (args) => {
      try {
        const text = strArg(args, 'text');
        if (!text) return fail('text is required', { tool: 'text_summarizer' });
        const maxLength = numArg(args, 'max_length', 500);
        const sentences = splitSentences(text);
        let out = '';
        let used = 0;
        for (const s of sentences) {
          if (used >= maxLength) break;
          out += (out ? ' ' : '') + s;
          used = out.length;
        }
        const truncated = text.length > out.length;
        return ok(out, {
          tool: 'text_summarizer',
          sentences: sentences.length,
          usedSentences: splitSentences(out).length,
          truncated,
          method: 'extractive-lead',
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err), { tool: 'text_summarizer' });
      }
    },
  },
];
