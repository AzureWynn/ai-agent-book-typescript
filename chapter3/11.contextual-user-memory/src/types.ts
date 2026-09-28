export interface RankedDoc {
  id: string;
  text: string;
  score: number;
}

export interface MemChunk {
  id: string;
  text: string;
  orphan: boolean;
}

export interface MemoryCard {
  key: string;
  category: string;
  backstory: string;
  person: string;
  relationship: string;
  facts: Record<string, string>;
}

export interface QuerySpec {
  query: string;
  relevant: string[];
}
