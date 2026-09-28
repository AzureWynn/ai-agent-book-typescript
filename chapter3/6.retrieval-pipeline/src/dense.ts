import { Ollama } from 'ollama';
import { config } from './config.js';
import { Document, RankedDoc } from './types.js';

let client: Ollama | null = null;

function getClient(): Ollama {
  if (!client) client = new Ollama({ host: config.ollamaBaseUrl });
  return client;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const ollama = getClient();
  const response = await ollama.embed({ model: config.ollamaModel, input: texts });
  return response.embeddings;
}

export async function attachEmbeddings(docs: Document[]): Promise<Document[]> {
  const embeddings = await embedBatch(docs.map((d) => d.text));
  return docs.map((d, i) => ({ ...d, embedding: embeddings[i] }));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

export async function denseSearch(query: string, docs: Document[], topK = 20): Promise<RankedDoc[]> {
  const [queryVec] = await embedBatch([query]);
  if (!queryVec) throw new Error('No query embedding returned from Ollama');
  return docs
    .map((d) => ({
      id: d.id,
      text: d.text,
      score: cosineSimilarity(queryVec, d.embedding ?? []),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
