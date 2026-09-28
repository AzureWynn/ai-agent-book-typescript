import { HNSW } from 'hnsw';
import { Document, SearchResult } from './types.js';
import { cosineDistance } from './embedding-service.js';
import { hnswConfig } from './config.js';

let index: HNSW | null = null;
let documents: Document[] = [];

export async function buildHnswIndex(docs: Document[], efSearch?: number): Promise<number> {
  const startTime = Date.now();
  documents = docs;
  const dimension = documents[0]?.embedding?.length || 768;

  const idx = new HNSW(
    hnswConfig.M,
    hnswConfig.efConstruction,
    dimension,
    'cosine',
    efSearch ?? hnswConfig.efSearch
  );

  for (let i = 0; i < documents.length; i++) {
    const emb = documents[i]?.embedding;
    if (emb) await idx.addPoint(i, emb);
  }

  index = idx;
  return Date.now() - startTime;
}

export function searchHnsw(query: number[], k: number): SearchResult[] {
  if (!index) throw new Error('HNSW index not built');
  const results = index.searchKNN(query, k);
  return results.map((r) => {
    const doc = documents[r.id];
    if (!doc) throw new Error(`Document ${r.id} not found`);
    return {
      id: doc.id,
      text: doc.text,
      score: r.score,
      distance: cosineDistance(query, doc.embedding || []),
    };
  });
}

export function getHnswMemoryMb(): number {
  return 0;
}

export function setDocuments(docs: Document[]): void {
  documents = docs;
}
