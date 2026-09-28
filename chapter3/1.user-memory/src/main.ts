import dotenv from "dotenv";
dotenv.config();
import { getMemoryConfig, ensureDirectories, OLLAMA_MODEL } from "./config.js";
import { BackgroundMemoryProcessor } from "./background-processor.js";
import { ConversationalAgent } from "./conversational-agent.js";
import { UserMemoryAgent } from "./user-memory-agent.js";
import { MemoryMode } from "./types.js";

async function demo() {
  const config = getMemoryConfig();
  ensureDirectories();

  console.log("\n" + "=".repeat(60));
  console.log("  Chapter 3-1: User Memory System - Demo Mode");
  console.log("=".repeat(60));
  console.log(`  Model: ${OLLAMA_MODEL}`);
  console.log(`  Memory Mode: ${config.memoryMode}`);
  console.log("=".repeat(60) + "\n");

  const agent = new UserMemoryAgent("demo_user", { memoryMode: config.memoryMode, verbose: config.verbose });

  const demoConversation = [
    "Hi, I'm Alice and I work at TechCorp as a senior engineer.",
    "I love Python and I have two cats named Whiskers and Mittens.",
    "My email is alice@techcorp.com and my phone is 555-0123.",
  ];

  for (const msg of demoConversation) {
    console.log(`\n👤 User: ${msg}`);
    const result = await agent.executeTask(msg);
    console.log(`🤖 Assistant: ${result.finalAnswer}`);
    if (result.toolCalls.length > 0) {
      console.log(`🔧 Memory operations: ${result.toolCalls.length}`);
      for (const tc of result.toolCalls) {
        console.log(`   - ${tc.toolName}: ${JSON.stringify(tc.arguments).slice(0, 60)}...`);
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("  Memory Contents:");
  console.log("=".repeat(60));
  const memContext = agent.getMemoryContext();
  console.log(memContext || "(empty)");

  const searchResult = await agent.executeTask("Search for Alice's email");
  console.log(`\n🔍 Search result: ${searchResult.finalAnswer}`);
}

async function interactive() {
  const config = getMemoryConfig();
  ensureDirectories();

  const agent = new ConversationalAgent("interactive_user", config.memoryMode);

  console.log("\n" + "=".repeat(60));
  console.log("  Chapter 3-1: User Memory System - Interactive Mode");
  console.log("=".repeat(60));
  console.log("  Type 'quit' or 'exit' to end.");
  console.log("  Type 'memory' to see current memories.");
  console.log("=".repeat(60));

  const readline = await import("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = () => new Promise<string>(resolve => rl.question("\n👤 > ", resolve));

  for (;;) {
    const input = await ask();
    if (input.toLowerCase() === "quit" || input.toLowerCase() === "exit") break;
    if (input.toLowerCase() === "memory") {
      console.log(`\n📝 Current memories:\n${agent.getMemoryContext() || "(empty)"}`);
      continue;
    }
    const response = await agent.chat(input);
    console.log(`\n🤖 ${response}`);
  }

  rl.close();
}

async function backgroundMode() {
  const config = getMemoryConfig();
  ensureDirectories();

  console.log("\n" + "=".repeat(60));
  console.log("  Chapter 3-1: User Memory System - Background Processing Mode");
  console.log("=".repeat(60));
  console.log(`  Model: ${OLLAMA_MODEL}`);
  console.log(`  Memory Mode: ${config.memoryMode}`);
  console.log(`  Conversation Interval: ${config.conversationInterval}`);
  console.log("=".repeat(60) + "\n");

  const processor = new BackgroundMemoryProcessor("background_user", config.memoryMode, config.conversationInterval);

  const demoMessages = [
    { user: "I like coffee and I'm allergic to peanuts.", assistant: "Got it, I'll remember that." },
    { user: "I just got promoted to team lead at work.", assistant: "Congratulations! That's great news." },
    { user: "My birthday is in March and I love hiking.", assistant: "Nice! I'll note that for future conversations." },
  ];

  for (const msg of demoMessages) {
    processor.incrementConversationCount();
    processor.getConversationHistory().addTurn(msg.user, msg.assistant);

    if (processor.shouldProcess()) {
      console.log(`\n🔄 Processing recent conversations (count: ${processor.getConversationCount()})...`);
      const summary = processor.processRecentConversations();
      console.log(`📊 Summary: ${summary.added} added, ${summary.updated} updated, ${summary.deleted} deleted`);
      processor.markProcessed();
    } else {
      console.log(`\n⏭️  Skip processing (count: ${processor.getConversationCount()}, interval: ${processor.getConversationInterval()})`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("  Final Memory Contents:");
  console.log("=".repeat(60));
  const agent = processor.getAgent();
  console.log(agent.getMemoryContext() || "(empty)");
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.find(a => !a.startsWith("--")) || "demo";

  switch (mode) {
    case "demo":
      await demo();
      break;
    case "interactive":
      await interactive();
      break;
    case "background":
      await backgroundMode();
      break;
    default:
      console.log(`Unknown mode: ${mode}. Use: demo, interactive, background`);
  }
}

main().catch(console.error);
