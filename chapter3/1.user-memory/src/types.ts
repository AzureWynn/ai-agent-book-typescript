export type MemoryMode = "notes" | "enhanced_notes" | "json_cards" | "advanced_json_cards";

export type MemoryItem = {
  id: string;
  content: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
};

export type MemoryCard = {
  category: string;
  subcategory: string;
  key: string;
  value: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
};

export type AdvancedMemoryCard = {
  category: string;
  cardKey: string;
  card: {
    backstory: string;
    dateCreated: string;
    person: string;
    relationship: string;
    [key: string]: unknown;
  };
  sessionId: string;
  createdAt: string;
  updatedAt: string;
};

export type MemoryStorage = {
  userId: string;
  type: string;
  updatedAt: string;
  notes: MemoryItem[];
  jsonCards: MemoryCard[];
  advancedCards: AdvancedMemoryCard[];
};

export type ToolCall = {
  toolName: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  timestamp: string;
};
