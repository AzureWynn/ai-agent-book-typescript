import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
dotenv.config();
import { MemoryEntry, MemoryType, Profile, Event } from "./types.js";
import { VERBOSE } from "./config.js";

export class MemobaseStore {
  private memories: Map<MemoryType, MemoryEntry[]> = new Map();
  private profiles: Map<string, Profile> = new Map();
  private events: Event[] = [];

  constructor() {
    const types: MemoryType[] = ["episodic", "semantic", "procedural", "working"];
    types.forEach(t => this.memories.set(t, []));
  }

  add(type: MemoryType, content: string, metadata: Record<string, unknown> = {}): MemoryEntry {
    const entry: MemoryEntry = {
      id: randomUUID(),
      type,
      content,
      importanceScore: 1.0,
      decayRate: 0.1,
      accessCount: 0,
      createdAt: new Date().toISOString(),
      accessedAt: new Date().toISOString(),
      metadata,
    };
    const list = this.memories.get(type) || [];
    list.push(entry);
    this.memories.set(type, list);
    this._applyDecay(type);
    if (VERBOSE) console.log(`[memobase] ADD ${type}: "${content.slice(0, 40)}..."`);
    return entry;
  }

  addProfile(userId: string, attributes: Record<string, string>): void {
    this.profiles.set(userId, {
      userId, attributes, updatedAt: new Date().toISOString(),
    });
    if (VERBOSE) console.log(`[memobase] Profile updated for ${userId}`);
  }

  addEvent(userId: string, description: string, category: string): void {
    const event: Event = {
      userId, timestamp: new Date().toISOString(), description, category,
    };
    this.events.push(event);
    if (VERBOSE) console.log(`[memobase] Event: ${description}`);
  }

  getByType(type: MemoryType, minImportance: number = 0.5): MemoryEntry[] {
    return (this.memories.get(type) || []).filter(m => m.importanceScore >= minImportance);
  }

  search(query: string, topK: number = 5): MemoryEntry[] {
    const all: MemoryEntry[] = [];
    this.memories.forEach(list => all.push(...list));
    return all
      .map(m => ({ ...m, score: this._relevanceScore(m, query) * m.importanceScore }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private _applyDecay(type: MemoryType): void {
    const list = this.memories.get(type) || [];
    list.forEach(m => {
      const hoursSinceAccess = (Date.now() - new Date(m.accessedAt).getTime()) / 3600000;
      m.importanceScore *= Math.pow(1 - m.decayRate, hoursSinceAccess / 24);
      m.importanceScore = Math.max(0.1, m.importanceScore);
    });
  }

  access(entry: MemoryEntry): void {
    entry.accessCount++;
    entry.importanceScore = Math.min(10.0, entry.importanceScore * 1.1);
    entry.accessedAt = new Date().toISOString();
  }

  compress(type: MemoryType, threshold: number = 5): string[] {
    const list = this.memories.get(type) || [];
    if (list.length < threshold) return [];
    const summaries: string[] = [];
    const groups = new Map<string, MemoryEntry[]>();
    list.forEach(m => {
      const prefix = m.content.slice(0, 5);
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix)!.push(m);
    });
    groups.forEach((members, prefix) => {
      if (members.length > 1) {
        const summary = `Cluster of ${members.length} memories starting with "${prefix}": ${members.map(m => m.content.slice(0, 20)).join(", ")}`;
        summaries.push(summary);
        if (VERBOSE) console.log(`[memobase] Compressed ${members.length} memories`);
      }
    });
    return summaries;
  }

  getProfile(userId: string): Profile | undefined { return this.profiles.get(userId); }
  getEvents(userId: string): Event[] { return this.events.filter(e => e.userId === userId); }
  get size(): number { return Array.from(this.memories.values()).reduce((s, l) => s + l.length, 0); }

  private _relevanceScore(entry: MemoryEntry, query: string): number {
    const content = entry.content.toLowerCase();
    const q = query.toLowerCase();
    return q.split(" ").filter(w => content.includes(w)).length;
  }
}
