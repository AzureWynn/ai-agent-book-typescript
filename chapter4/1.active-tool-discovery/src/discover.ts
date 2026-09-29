import { Ollama } from 'ollama';
import { DiscoverHit, RegistryTool } from './types.js';

const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

const EN_STOP = new Set([
  'in', 'to', 'of', 'and', 'or', 'for', 'with', 'the', 'is', 'are', 'was', 'were',
  'be', 'on', 'at', 'by', 'from', 'as', 'an', 'it', 'this', 'that', 'you', 'your',
  'what', 'which', 'how', 'when', 'then', 'than', 'need', 'needs', 'want', 'use',
  'using', 'into', 'over', 'under',
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 1 && !EN_STOP.has(t));
}

function toolText(t: RegistryTool): string {
  return `${t.server} ${t.name.replace(/_/g, ' ')} ${t.description}`;
}

export function keywordDiscover(registry: RegistryTool[], need: string, topK: number): DiscoverHit[] {
  const needTerms = new Set(tokens(need));
  return registry
    .map((t) => {
      const hay = new Set(tokens(toolText(t)));
      let score = 0;
      for (const term of needTerms) if (hay.has(term)) score += 1;
      return { ...t, score };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, topK);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

export async function semanticDiscover(registry: RegistryTool[], need: string, topK: number): Promise<DiscoverHit[]> {
  const ollama = new Ollama({ host: BASE_URL });
  const texts = registry.map(toolText);
  const [needVec, ...vecs] = await ollama.embed({ model: EMBED_MODEL, input: [need, ...texts] }).then((r) => r.embeddings);
  if (!needVec) throw new Error('no need embedding returned');
  return registry
    .map((t, i) => ({ ...t, score: cosine(needVec, vecs[i] ?? []) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function discover(
  registry: RegistryTool[],
  need: string,
  topK: number,
  semantic: boolean
): Promise<{ hits: DiscoverHit[]; method: string }> {
  if (semantic) {
    try {
      return { hits: await semanticDiscover(registry, need, topK), method: 'semantic(nomic-embed-text)' };
    } catch {
      return { hits: keywordDiscover(registry, need, topK), method: 'keyword(fallback: embed failed)' };
    }
  }
  return { hits: keywordDiscover(registry, need, topK), method: 'keyword' };
}

export function thinIndex(registry: RegistryTool[]): string {
  return registry.map((t) => `${t.server}.${t.name} — ${t.description.split('.')[0]?.slice(0, 100) ?? ''}`).join('\n');
}

export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
