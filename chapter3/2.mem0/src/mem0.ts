import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
dotenv.config();
import { MemoryEntry } from "./types.js";
import { OLLAMA_MODEL, VERBOSE } from "./config.js";

export class Mem0Store {
  private memories: MemoryEntry[] = [];

  /** ADD-only：只加不减，旧记忆永不修改 */
  add(content: string, metadata: Record<string, unknown> = {}): MemoryEntry {
    const entry: MemoryEntry = {
      id: randomUUID(),
      type: "semantic",
      content,
      importanceScore: 1.0,
      decayRate: 0.05,
      accessCount: 0,
      createdAt: new Date().toISOString(),
      accessedAt: new Date().toISOString(),
      metadata,
    };
    this.memories.push(entry);
    if (VERBOSE) console.log(`[mem0] ADD: "${content.slice(0, 40)}..."`);
    return entry;
  }

  /** 搜索：语义 + 关键词混合 */
  search(query: string, topK: number = 5): MemoryEntry[] {
    return this.memories
      .map(m => ({
        ...m,
        score: this._relevanceScore(m, query),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private _relevanceScore(entry: MemoryEntry, query: string): number {
    const content = entry.content.toLowerCase();
    const q = query.toLowerCase();
    const keywordScore = q.split(" ").filter(w => content.includes(w)).length;
    return entry.importanceScore * 0.5 + keywordScore * 0.5;
  }

  getAll(): MemoryEntry[] { return [...this.memories]; }
  get size(): number { return this.memories.length; }
}
