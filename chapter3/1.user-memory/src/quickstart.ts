import dotenv from "dotenv";
dotenv.config();
import { createOpenAI } from "./config.js";
import { NotesMemoryManager } from "./memory-manager.js";

async function main() {
  console.log("Quickstart: Checking Ollama connection...\n");

  try {
    const client = await createOpenAI();
    const response = await client.chat.completions.create({
      model: process.env.OLLAMA_MODEL || "gemma4:latest",
      messages: [{ role: "user", content: "Say hello in one sentence." }],
      stream: false,
    });
    console.log(`Ollama responded: ${response.choices[0]?.message.content ?? "(empty)"}`);
  } catch (e) {
    console.log(`Error: ${e}`);
    console.log("Make sure Ollama is running: `ollama serve` and a model is pulled: `ollama pull gemma4:latest`");
    return;
  }

  const manager = new NotesMemoryManager("test_user");
  manager.addMemory("User likes coffee", "session-1", ["preferences"]);
  manager.addMemory("User works at TechCorp", "session-1", ["work"]);

  console.log("\nMemory contents:");
  console.log(manager.getContextString());
}

main().catch(console.error);
