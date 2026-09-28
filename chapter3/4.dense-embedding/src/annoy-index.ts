import { createRequire } from 'module';
import { Document, SearchResult } from './types.js';
import { cosineDistance } from './embedding-service.js';
import { annoyConfig } from './config.js';

const require = createRequire(import.meta.url);
const Annoy = require('annoy') as any;

let index: any = null;
let documents: Document[] = [];

export async function buildAnnoyIndex(docs: Document[], nTrees?: number): Promise<number> {
  const startTime = Date.now();
  documents = docs;
  const dimension = documents[0]?.embedding?.length || 768;
  const t = new Annoy(dimension, 'angular');

  for (let i = 0; i < documents.length; i++) {
    const emb = documents[i]?.embedding;
    if (emb) t.addItem(i, emb);
  }

  t.build(nTrees ?? annoyConfig.nTrees);
  index = t;
  return Date.now() - startTime;
}

export function getAnnoyRawIndex(): any {
  return index;
}

export function searchAnnoy(query: number[], k: number): SearchResult[] {
  if (!index) throw new Error('Annoy index not built');
  const indices = index.getNNsByVector(query, k);
  return indices.map((i: number) => {
    const doc = documents[i];
    if (!doc) throw new Error(`Document ${i} not found`);
    return {
      id: doc.id,
      text: doc.text,
      score: 1 - cosineDistance(query, doc.embedding || []),
      distance: cosineDistance(query, doc.embedding || []),
    };
  });
}

export function getAnnoyMemoryMb(): number {
  return 0;
}

export function setDocuments(docs: Document[]): void {
  documents = docs;
}
