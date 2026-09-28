export interface Chunk {
  id: string;
  text: string;
}

export interface RankedDoc {
  id: string;
  text: string;
  score: number;
}

export interface RaptorNode {
  id: string;
  level: number;
  label: string;
  text: string;
  children: string[];
  chunks: string[];
}

export interface Entity {
  id: string;
  name: string;
  aliases: string[];
  chunkIds: string[];
  community: string;
}

export interface Relation {
  from: string;
  to: string;
  label: string;
}

export interface QuerySpec {
  query: string;
  relevant: string[];
  kind: 'multi-hop' | 'synthesis' | 'overview' | 'exact';
}
