import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config();
import { CONVERSATION_HISTORY_DIR } from "./config.js";

export interface ConversationTurn {
  sessionId: string;
  turnNumber: number;
  timestamp: string;
  userMessage: string;
  assistantMessage: string;
}

export class ConversationHistory {
  private turns: ConversationTurn[] = [];
  private userId: string;
  private sessionId: string;

  constructor(userId: string, sessionId?: string) {
    this.userId = userId;
    this.sessionId = sessionId || `session-${Date.now()}`;
    this.loadHistory();
  }

  addTurn(userMessage: string, assistantMessage: string) {
    const turn: ConversationTurn = {
      sessionId: this.sessionId,
      turnNumber: this.turns.length + 1,
      timestamp: new Date().toISOString(),
      userMessage,
      assistantMessage
    };
    this.turns.push(turn);
    this.save();
  }

  getSessionTurns(sessionId: string): ConversationTurn[] {
    return this.turns.filter(t => t.sessionId === sessionId);
  }

  getRecentTurns(limit: number = 10): ConversationTurn[] {
    return this.turns.slice(-limit);
  }

  getSessionId(): string { return this.sessionId; }

  private loadHistory() {
    const dir = `${CONVERSATION_HISTORY_DIR}/${this.userId}`;
    const file = `${dir}/history.json`;
    if (existsSync(file)) {
      try { this.turns = JSON.parse(readFileSync(file, "utf-8")); } catch { this.turns = []; }
    }
  }

  private save() {
    const dir = `${CONVERSATION_HISTORY_DIR}/${this.userId}`;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/history.json`, JSON.stringify(this.turns, null, 2), "utf-8");
  }
}
