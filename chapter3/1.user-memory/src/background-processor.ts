import { UserMemoryAgent } from "./user-memory-agent.js";
import { MemoryMode, ToolCall } from "./types.js";
import { VERBOSE } from "./config.js";
import { ConversationHistory } from "./conversation-history.js";

export interface MemoryUpdate {
  action: string;
  memoryId?: string;
  content?: string;
  reason?: string;
  tags: string[];
}

export class BackgroundMemoryProcessor {
  private agent: UserMemoryAgent;
  private memoryMode: MemoryMode;
  private conversationInterval: number;
  private conversationCount: number = 0;
  private lastProcessedCount: number = 0;
  private processedTurnIds: Set<string> = new Set();
  private conversationHistory: ConversationHistory;
  private verbose: boolean;

  constructor(userId: string, memoryMode: MemoryMode = "notes", conversationInterval: number = 2) {
    this.memoryMode = memoryMode;
    this.conversationInterval = conversationInterval;
    this.verbose = VERBOSE;
    this.agent = new UserMemoryAgent(userId, { memoryMode, enableMemoryUpdates: true, enableMemorySearch: true });
    this.conversationHistory = new ConversationHistory(userId);
  }

  async analyzeConversation(conversationContext: Array<{ role: string; content: string }>): Promise<MemoryUpdate[]> {
    if (conversationContext.length < 2) return [];

    const conversationStr = conversationContext.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
    const task = `Analyze this recent conversation and update my memory accordingly.
Extract any important facts, preferences, or information that should be remembered.

Recent Conversation:
{conversationStr}

Please:
1. Add any new important information as memories
2. Update existing memories if there's new or changed information
3. Delete any memories that are no longer accurate`;

    const result = await this.agent.executeTask(task);
    if (VERBOSE) {
      console.log(`[Background] Analysis completed. Tool calls: ${result.toolCalls.length}`);
    }
    return [];
  }

  processRecentConversations(limit: number = 10): { added: number; updated: number; deleted: number; analyzedTurns: number } {
    const recentTurns = this.conversationHistory.getRecentTurns(limit);
    const unprocessed = recentTurns.filter(t => !this.processedTurnIds.has(`${t.sessionId}_${t.turnNumber}_${t.timestamp}`));

    if (unprocessed.length === 0) {
      return { added: 0, updated: 0, deleted: 0, analyzedTurns: 0 };
    }

    const conversationContext: Array<{ role: string; content: string }> = [];
    for (const turn of unprocessed) {
      conversationContext.push({ role: "user", content: turn.userMessage });
      conversationContext.push({ role: "assistant", content: turn.assistantMessage });
      this.processedTurnIds.add(`${turn.sessionId}_${turn.turnNumber}_${turn.timestamp}`);
    }

    const summary = { added: 0, updated: 0, deleted: 0, analyzedTurns: unprocessed.length };

    for (const tc of this.agent.getToolCalls()) {
      switch (tc.toolName) {
        case "add_memory": summary.added++; break;
        case "update_memory": summary.updated++; break;
        case "delete_memory": summary.deleted++; break;
      }
    }

    if (VERBOSE) {
      console.log(`[Background] Processed ${unprocessed.length} turns: ${summary.added} added, ${summary.updated} updated, ${summary.deleted} deleted`);
    }

    return summary;
  }

  incrementConversationCount() { this.conversationCount++; }

  shouldProcess(): boolean {
    return this.conversationCount - this.lastProcessedCount >= this.conversationInterval;
  }

  markProcessed() { this.lastProcessedCount = this.conversationCount; }

  getAgent(): UserMemoryAgent { return this.agent; }

  getConversationCount(): number { return this.conversationCount; }

  getConversationInterval(): number { return this.conversationInterval; }

  getConversationHistory(): ConversationHistory { return this.conversationHistory; }
}
