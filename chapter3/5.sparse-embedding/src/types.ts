export interface Document {
  id: string;
  text: string;
}

export interface TermScore {
  term: string;
  tf: number;
  df: number;
  idf: number;
  contribution: number;
}

export interface ScoredDoc {
  id: string;
  text: string;
  score: number;
  docLen: number;
  matchedTerms: string[];
  termScores: TermScore[];
}

export interface QueryMetrics {
  query: string;
  recall: number;
  precision: number;
  rr: number;
  hits: string[];
  relevant: string[];
}
