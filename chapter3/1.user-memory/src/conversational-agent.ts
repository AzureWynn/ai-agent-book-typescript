import dotenv from "dotenv";
dotenv.config();
import { OLLAMA_MODEL, VERBOSE } from "./config.js";
import { NotesMemoryManager } from "./memory-manager.js";
import { UserMemoryAgent } from "./user-memory-agent.js";
import { ConversationHistory } from "./conversation-history.js";

export class ConversationalAgent {
  private memoryManager: NotesMemoryManager;
  private agent: UserMemoryAgent;
  private conversationHistory: ConversationHistory;

  constructor(userId: string, memoryMode: string = "notes") {
    this.memoryManager = new NotesMemoryManager(userId);
    this.agent = new UserMemoryAgent(userId, { memoryMode: memoryMode as any, enableMemoryUpdates: false, enableMemorySearch: false });
    this.conversationHistory = new ConversationHistory(userId);
  }

  async chat(message: string): Promise<string> {
    const memoryContext = this.memoryManager.getContextString();
    const context = memoryContext ? `\n\n=== USER MEMORIES ===\n${memoryContext}` : "";

    const result = await this.agent.executeTask(`${message}${context}\n\nPlease respond to the user's message based on the memory context above. Do not update memories - only respond.`);
    this.addConversationTurn(message, result.finalAnswer);
    return result.finalAnswer;
  }

  getMemoryContext(): string { return this.memoryManager.getContextString(); }
  getSessionId(): string { return this.agent.getSessionId(); }

  addConversationTurn(userMsg: string, assistantMsg: string) {
    this.conversationHistory.addTurn(userMsg, assistantMsg);
  }
}
