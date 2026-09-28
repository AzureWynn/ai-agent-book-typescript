export interface Document {
  id: string;
  text: string;
  embedding?: number[];
}

export interface RankedDoc {
  id: string;
  text: string;
  score: number;
}

export interface RerankedDoc extends RankedDoc {
  phraseBonus: number;
  coverageBonus: number;
  baseScore: number;
}

export interface StageTrace {
  sparse: RankedDoc[];
  dense: RankedDoc[] | null;
  fused: RankedDoc[];
  reranked: RankedDoc[] | null;
}

export interface QueryMetrics {
  query: string;
  recall: number;
  mrr: number;
  ndcg: number;
}
