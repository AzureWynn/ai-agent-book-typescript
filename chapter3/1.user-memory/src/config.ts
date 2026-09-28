import dotenv from "dotenv";
import { existsSync, mkdirSync } from "node:fs";
import { MemoryMode } from "./types.js";
dotenv.config();

export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:latest";
export const MEMORY_STORAGE_DIR = process.env.MEMORY_STORAGE_DIR || "data/memories";
export const CONVERSATION_HISTORY_DIR = process.env.CONVERSATION_HISTORY_DIR || "data/conversations";
export const MAX_MEMORY_ITEMS = parseInt(process.env.MAX_MEMORY_ITEMS || "100");
export const CONVERSATION_INTERVAL = parseInt(process.env.CONVERSATION_INTERVAL || "2");
export const BACKGROUND_PROCESSING = process.env.BACKGROUND_PROCESSING !== "false";
export const VERBOSE = process.env.VERBOSE !== "false";

export interface MemoryConfig {
  memoryMode: MemoryMode;
  maxMemoryItems: number;
  conversationInterval: number;
  backgroundProcessing: boolean;
  verbose: boolean;
}

export function getMemoryConfig(): MemoryConfig {
  return {
    memoryMode: (process.env.MEMORY_MODE || "notes") as MemoryMode,
    maxMemoryItems: MAX_MEMORY_ITEMS,
    conversationInterval: CONVERSATION_INTERVAL,
    backgroundProcessing: BACKGROUND_PROCESSING,
    verbose: VERBOSE,
  };
}

export async function createOpenAI() {
  const { OpenAI } = await import("openai");
  return new OpenAI({
    baseURL: OLLAMA_BASE_URL,
    apiKey: process.env.OLLAMA_API_KEY || "ollama",
  });
}

export function ensureDirectories() {
  if (!existsSync(MEMORY_STORAGE_DIR)) {
    mkdirSync(MEMORY_STORAGE_DIR, { recursive: true });
  }
  if (!existsSync(CONVERSATION_HISTORY_DIR)) {
    mkdirSync(CONVERSATION_HISTORY_DIR, { recursive: true });
  }
}
