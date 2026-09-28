export interface RankedDoc {
  id: string;
  text: string;
  score: number;
}

export interface Chunk {
  id: string;
  docId: string;
  text: string;
  orphan: boolean;
}

export interface QuerySpec {
  query: string;
  relevant: string[];
}

export interface QueryResult {
  query: string;
  plainHits: string[];
  ctxHits: string[];
}
