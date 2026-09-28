export interface RankedDoc {
  id: string;
  text: string;
  score: number;
}

export interface Round {
  sessionId: string;
  roundNo: number;
  user: string;
  assistant: string;
  facets: string[];
}

export interface MemChunk {
  id: string;
  sessionIds: string[];
  text: string;
  facets: string[];
  roundNos: number[];
}

export interface SubQuery {
  text: string;
  facets: string[];
}

export interface QuerySpec {
  query: string;
  relevant: string[];
  facets: string[];
  subqueries: SubQuery[];
  difficulty: 'easy' | 'hard';
  layer: string;
}

export interface ToolCall {
  tool: string;
  args: Record<string, string | number>;
  result: string;
}

export interface AgentRound {
  round: number;
  thought: string;
  toolCalls: ToolCall[];
  newFacets: string[];
  coveredFacets: string[];
  missingFacets: string[];
}

export interface AgentTrace {
  rounds: AgentRound[];
  evidence: string[];
  recall: number;
  retrievals: number;
  toolCalls: number;
}
