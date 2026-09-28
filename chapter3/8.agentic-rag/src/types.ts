export interface LawChunk {
  id: string;
  text: string;
  facets: string[];
}

export interface RankedDoc {
  id: string;
  text: string;
  score: number;
}

export interface QuestionSpec {
  query: string;
  relevant: string[];
  facets: string[];
  subqueries: string[];
  difficulty: 'easy' | 'hard';
}

export interface AgentRound {
  round: number;
  query: string;
  hits: string[];
  newFacets: string[];
  coveredFacets: string[];
  missingFacets: string[];
}

export interface AgentTrace {
  rounds: AgentRound[];
  evidence: string[];
  recall: number;
  retrievals: number;
}
