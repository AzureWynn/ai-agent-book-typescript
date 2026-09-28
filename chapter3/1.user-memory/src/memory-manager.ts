import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
dotenv.config();
import { MemoryItem, MemoryCard, AdvancedMemoryCard, MemoryStorage } from "./types.js";
import { MEMORY_STORAGE_DIR } from "./config.js";

function getMemoryFile(userId: string): string {
  return `${MEMORY_STORAGE_DIR}/${userId}_memory.json`;
}

function loadStorage(userId: string): MemoryStorage {
  const file = getMemoryFile(userId);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf-8"));
  return { userId, type: "notes", updatedAt: new Date().toISOString(), notes: [], jsonCards: [], advancedCards: [] };
}

function now(): string { return new Date().toISOString(); }

export class NotesMemoryManager {
  protected notes: MemoryItem[] = [];
  private userId: string;
  private storage: MemoryStorage;

  constructor(userId: string) {
    this.userId = userId;
    this.storage = loadStorage(userId);
    this.notes = this.storage.notes;
  }

  addMemory(content: string, sessionId: string, tags: string[] = []): MemoryItem {
    const note: MemoryItem = { id: randomUUID(), content, sessionId, createdAt: now(), updatedAt: now(), tags };
    this.notes.push(note);
    this.save();
    return note;
  }

  updateMemory(memoryId: string, content: string): boolean {
    const note = this.notes.find(n => n.id === memoryId);
    if (note) { note.content = content; note.updatedAt = now(); this.save(); return true; }
    return false;
  }

  deleteMemory(memoryId: string): boolean {
    const idx = this.notes.findIndex(n => n.id === memoryId);
    if (idx >= 0) { this.notes.splice(idx, 1); this.save(); return true; }
    return false;
  }

  getContextString(): string {
    if (this.notes.length === 0) return "";
    return this.notes.map(n => `- ${n.content}`).join("\n");
  }

  searchMemories(query: string): MemoryItem[] {
    return this.notes.filter(n => n.content.toLowerCase().includes(query.toLowerCase()));
  }

  private save() {
    this.storage.notes = this.notes;
    this.storage.updatedAt = now();
    writeFileSync(getMemoryFile(this.userId), JSON.stringify(this.storage, null, 2), "utf-8");
  }
}

export class EnhancedNotesManager extends NotesMemoryManager {
  override getContextString(): string {
    if (this.notes.length === 0) return "";
    return "=== USER CONTEXT ===\n" + this.notes.map(n => n.content).join("\n\n") + "\n";
  }
}

export class JsonCardsManager {
  private cards: MemoryCard[] = [];
  private userId: string;
  private storage: MemoryStorage;

  constructor(userId: string) {
    this.userId = userId;
    this.storage = loadStorage(userId);
    this.cards = this.storage.jsonCards;
  }

  addMemory(content: Record<string, unknown>, sessionId: string): MemoryCard {
    const card: MemoryCard = {
      category: String(content.category || "general"),
      subcategory: String(content.subcategory || "info"),
      key: String(content.key || `note_${Date.now()}`),
      value: JSON.stringify(content.value || content),
      sessionId, createdAt: now(), updatedAt: now()
    };
    this.cards.push(card);
    this.save();
    return card;
  }

  updateMemory(memoryId: string, content: Record<string, unknown>): boolean {
    const card = this.cards.find(c => `${c.category}.${c.subcategory}.${c.key}` === memoryId);
    if (card) { card.value = JSON.stringify(content.value || content); card.updatedAt = now(); this.save(); return true; }
    return false;
  }

  deleteMemory(memoryId: string): boolean {
    const idx = this.cards.findIndex(c => `${c.category}.${c.subcategory}.${c.key}` === memoryId);
    if (idx >= 0) { this.cards.splice(idx, 1); this.save(); return true; }
    return false;
  }

  getContextString(): string {
    if (this.cards.length === 0) return "";
    return this.cards.map(c => `- ${c.category}.${c.subcategory}.${c.key}: ${c.value}`).join("\n");
  }

  searchMemories(query: string): MemoryCard[] {
    return this.cards.filter(c => c.value.toLowerCase().includes(query.toLowerCase()));
  }

  private save() {
    this.storage.jsonCards = this.cards;
    this.storage.updatedAt = now();
    writeFileSync(getMemoryFile(this.userId), JSON.stringify(this.storage, null, 2), "utf-8");
  }
}

export class AdvancedJsonCardsManager {
  private cards: AdvancedMemoryCard[] = [];
  private userId: string;
  private storage: MemoryStorage;

  constructor(userId: string) {
    this.userId = userId;
    this.storage = loadStorage(userId);
    this.cards = this.storage.advancedCards;
  }

  addMemory(content: Record<string, unknown>, sessionId: string): AdvancedMemoryCard {
    const cardData = (content.card || content) as Record<string, unknown>;
    const card: AdvancedMemoryCard = {
      category: String(content.category || "general"),
      cardKey: String(content.cardKey || cardData.bank_account_primary || "unknown"),
      card: { backstory: String(cardData.backstory || ""), dateCreated: String(cardData.dateCreated || now()), person: String(cardData.person || "User"), relationship: String(cardData.relationship || "primary account holder"), ...cardData },
      sessionId, createdAt: now(), updatedAt: now()
    };
    this.cards.push(card);
    this.save();
    return card;
  }

  updateMemory(memoryId: string, content: Record<string, unknown>): boolean {
    const card = this.cards.find(c => c.cardKey === memoryId || `${c.category}.${c.cardKey}` === memoryId);
    if (card) { card.card = { ...card.card, ...(content.card as Record<string, unknown>) }; card.updatedAt = now(); this.save(); return true; }
    return false;
  }

  deleteMemory(memoryId: string): boolean {
    const idx = this.cards.findIndex(c => c.cardKey === memoryId);
    if (idx >= 0) { this.cards.splice(idx, 1); this.save(); return true; }
    return false;
  }

  getContextString(): string {
    if (this.cards.length === 0) return "";
    return this.cards.map(c => `- [${c.category}] ${c.cardKey} (${c.card.person}): ${JSON.stringify(c.card)}`).join("\n");
  }

  searchMemories(query: string): AdvancedMemoryCard[] {
    return this.cards.filter(c => JSON.stringify(c.card).toLowerCase().includes(query.toLowerCase()));
  }

  private save() {
    this.storage.advancedCards = this.cards;
    this.storage.updatedAt = now();
    writeFileSync(getMemoryFile(this.userId), JSON.stringify(this.storage, null, 2), "utf-8");
  }
}

export type MemoryManager = NotesMemoryManager | EnhancedNotesManager | JsonCardsManager | AdvancedJsonCardsManager;

export function createMemoryManager(userId: string, mode: string): MemoryManager {
  switch (mode) {
    case "enhanced_notes": return new EnhancedNotesManager(userId);
    case "json_cards": return new JsonCardsManager(userId);
    case "advanced_json_cards": return new AdvancedJsonCardsManager(userId);
    default: return new NotesMemoryManager(userId);
  }
}
