import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
dotenv.config();
import { OLLAMA_BASE_URL, OLLAMA_MODEL, VERBOSE } from "./config.js";
import { createMemoryManager, NotesMemoryManager } from "./memory-manager.js";
import { ConversationHistory } from "./conversation-history.js";
import { MemoryMode, ToolCall } from "./types.js";

export interface UserMemoryAgentConfig {
  memoryMode: MemoryMode;
  enableMemoryUpdates: boolean;
  enableMemorySearch: boolean;
  temperature: number;
  verbose: boolean;
}

const DEFAULT_CONFIG: UserMemoryAgentConfig = {
  memoryMode: "notes",
  enableMemoryUpdates: true,
  enableMemorySearch: true,
  temperature: 0.3,
  verbose: true,
};

export class UserMemoryAgent {
  private model: string;
  private memoryManager: ReturnType<typeof createMemoryManager>;
  private conversationHistory: ConversationHistory;
  private config: UserMemoryAgentConfig;
  private conversation: Array<{ role: string; content: string }>;
  private toolCalls: ToolCall[] = [];
  private sessionId: string;

  constructor(userId: string, config: Partial<UserMemoryAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.model = process.env.OLLAMA_MODEL || OLLAMA_MODEL;
    this.sessionId = `session-${randomUUID().slice(0, 8)}`;
    this.memoryManager = createMemoryManager(userId, this.config.memoryMode);
    this.conversationHistory = new ConversationHistory(userId);
    this.conversation = [{ role: "system", content: this._buildSystemPrompt() }];
  }

  private _buildSystemPrompt(): string {
    const memoryContext = this.memoryManager.getContextString();
    let prompt = `You are an intelligent assistant with persistent memory across conversations.
You have access to tools to manage user memories. Use them to add, update, or delete memories.

## Current Memories:
${memoryContext || "(none yet)"}

## Memory Management Tools:
- add_memory(content, tags): Store new important information about the user
- update_memory(memory_id, content): Modify existing memories
- delete_memory(memory_id): Remove outdated or incorrect memories
- search_memories(query): Search existing memories

After finishing memory updates, output STOP without other text.`;
    return prompt;
  }

  private _memoryTools() {
    return [
      {
        type: "function",
        function: {
          name: "add_memory",
          description: "Add a new memory about the user",
          parameters: {
            type: "object",
            properties: {
              content: { type: "string", description: "The memory content to store" },
              tags: { type: "array", items: { type: "string" }, description: "Optional tags" }
            },
            required: ["content"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_memory",
          description: "Update an existing memory",
          parameters: {
            type: "object",
            properties: {
              memory_id: { type: "string", description: "ID of the memory to update" },
              content: { type: "string", description: "New content" }
            },
            required: ["memory_id", "content"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "delete_memory",
          description: "Delete a memory",
          parameters: {
            type: "object",
            properties: {
              memory_id: { type: "string", description: "ID of the memory to delete" }
            },
            required: ["memory_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_memories",
          description: "Search existing memories",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" }
            },
            required: ["query"]
          }
        }
      }
    ];
  }

  private async _callOllama(messages: Array<{ role: string; content: string; tool_calls?: unknown[] }>) {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
    };
    if (this.config.enableMemoryUpdates) {
      body.tools = this._memoryTools();
    }

    if (VERBOSE) {
      console.log(`[${this.sessionId}] Calling ${this.model}...`);
    }

    const resp = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Ollama API error ${resp.status}: ${text.slice(0, 200)}`);
    }

    return resp.json();
  }

  async executeTask(task: string): Promise<{ success: boolean; finalAnswer: string; toolCalls: ToolCall[] }> {
    this.conversation.push({ role: "user", content: task });
    let finalAnswer = "";
    this.toolCalls = [];
    let toolCallCount = 0;

    for (let iteration = 0; iteration < 5; iteration++) {
      const result = await this._callOllama(this.conversation);
      const msg = result.message;

      if (msg.tool_calls && msg.tool_calls.length > 0 && toolCallCount < 3) {
        for (const tc of msg.tool_calls) {
          const toolResult = await this._executeTool(tc.function.name, tc.function.arguments);
          this.toolCalls.push({
            toolName: tc.function.name,
            arguments: tc.function.arguments,
            result: toolResult,
            timestamp: new Date().toISOString()
          });
          this.conversation.push({
            role: "tool",
            content: JSON.stringify(toolResult)
          });
          toolCallCount++;
        }
        if (msg.content?.includes("STOP") || toolCallCount >= 3) {
          finalAnswer = "Memory updated.";
          break;
        }
      } else {
        finalAnswer = msg.content || "";
        this.conversation.push({ role: "assistant", content: finalAnswer });
        break;
      }
    }

    return { success: true, finalAnswer, toolCalls: this.toolCalls };
  }

  private async _executeTool(name: string, args: Record<string, unknown>): Promise<any> {
    try {
      switch (name) {
        case "add_memory": {
          const content = String(args.content);
          const tags = (args.tags as string[]) || [];
          const note = (this.memoryManager as NotesMemoryManager).addMemory(content, this.sessionId, tags);
          return { success: true, memory_id: note.id };
        }
        case "update_memory": {
          const ok = (this.memoryManager as NotesMemoryManager).updateMemory(String(args.memory_id), String(args.content));
          return { success: ok };
        }
        case "delete_memory": {
          const ok = (this.memoryManager as NotesMemoryManager).deleteMemory(String(args.memory_id));
          return { success: ok };
        }
        case "search_memories": {
          const results = this.memoryManager.searchMemories(String(args.query));
          return JSON.stringify(results);
        }
        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (e) {
      return { error: String(e) };
    }
  }

  getToolCalls(): ToolCall[] { return this.toolCalls; }
  getSessionId(): string { return this.sessionId; }
  getMemoryContext(): string { return this.memoryManager.getContextString(); }
}
