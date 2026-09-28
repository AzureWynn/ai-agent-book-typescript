import { Ollama } from 'ollama';
import { config } from './config.js';
import { Document, SearchResult } from './types.js';

let client: Ollama | null = null;

function getClient(): Ollama {
  if (!client) {
    client = new Ollama({ host: config.baseUrl });
  }
  return client;
}

export async function embed(text: string): Promise<number[]> {
  const ollama = getClient();
  const response = await ollama.embed({
    model: config.model,
    input: text,
  });
  const embedding = response.embeddings[0];
  if (!embedding) throw new Error('No embedding returned from Ollama');
  return embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const ollama = getClient();
  const response = await ollama.embed({
    model: config.model,
    input: texts,
  });
  return response.embeddings;
}

export async function buildDocumentEmbeddings(documents: Document[]): Promise<Document[]> {
  const texts = documents.map((d) => d.text);
  const embeddings = await embedBatch(texts);
  return documents.map((d, i) => ({ ...d, embedding: embeddings[i] }));
}

export function cosineDistance(a: number[], b: number[]): number {
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
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function exactSearch(
  query: number[],
  documents: Document[],
  k: number
): SearchResult[] {
  const scored = documents.map((doc) => ({
    id: doc.id,
    text: doc.text,
    score: 1 - cosineDistance(query, doc.embedding || []),
    distance: cosineDistance(query, doc.embedding || []),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k) as SearchResult[];
}
