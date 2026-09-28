import dotenv from "dotenv";
dotenv.config();
import { OLLAMA_BASE_URL, OLLAMA_MODEL } from "./config.js";

export type MemoryType = "episodic" | "semantic" | "procedural" | "working";

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  importanceScore: number;
  decayRate: number;
  accessCount: number;
  createdAt: string;
  accessedAt: string;
  metadata: Record<string, unknown>;
}

export interface Profile {
  userId: string;
  attributes: Record<string, string>;
  updatedAt: string;
}

export interface Event {
  userId: string;
  timestamp: string;
  description: string;
  category: string;
}
