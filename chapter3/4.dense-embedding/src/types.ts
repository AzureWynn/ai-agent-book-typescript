export interface Document {
  id: string;
  text: string;
  embedding?: number[];
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  distance: number;
}

export interface IndexStats {
  buildTimeMs: number;
  memoryMb: number;
  queryLatencyMs: number;
  recallAtK: number;
  documentsCount: number;
  dimension: number;
}

export interface ComparisonResult {
  annoy: IndexStats;
  hnsw: IndexStats;
  exact: IndexStats;
}

export interface EmbeddingConfig {
  model: string;
  baseUrl: string;
  dimension: number;
  maxDocuments: number;
}