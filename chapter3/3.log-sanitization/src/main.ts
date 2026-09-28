import dotenv from "dotenv";
dotenv.config();
import { sanitize, sanitizeAll, getSummary } from "./regex-sanitizer.js";
import { llmSanitize } from "./llm-sanitizer.js";
import { OLLAMA_MODEL } from "./config.js";
import { VERBOSE } from "./config.js";

const SAMPLES = [
  "API Key: sk-abc123def456ghi789jkl012mno345pqr",
  "Connected to postgres://admin:S3cr3tP@ss@db.example.com:5432/production",
  "User email: alice@example.com called 13800138000, ID: 110101199003071234",
  "Card number: 4532 1234 5678 9012 and SSN: 123-45-6789",
  "Bearer xoxb-12345678901234567890123456789012",
  "AWS key: AKIAIOSFODNN7EXAMPLE and GitHub token: ghp_abc123def456ghi789jkl012mno345pqr",
  "IP address: 192.168.1.100 and private key: -----BEGIN RSA PRIVATE KEY-----MII...",
  "Authorization: Basic dXNlcjpwYXNz",
  "password = \"supersecret123\" and secret: mytoken456",
  "User 13912345678 with email test@mail.com visited 10.0.0.1",
];

async function demo() {
  console.log("\n" + "=".repeat(60));
  console.log("  Chapter 3-3: Log Sanitization - Demo Mode");
  console.log("=".repeat(60));
  console.log("  Regex engine: offline, no model needed");
  console.log("  LLM engine: Ollama + semantic detection\n");

  const results = sanitizeAll(SAMPLES);

  for (const r of results) {
    console.log(`\n  BEFORE: ${r.original}`);
    console.log(`  AFTER : ${r.sanitized}`);
    if (r.redactions.length > 0) {
      console.log(`  Redactions: ${r.redactions.map(x => x.category).join(", ")}`);
    }
  }

  // Also test LLM engine on one sample
  console.log("\n" + "-".repeat(40));
  console.log("  LLM engine test:");
  console.log("-".repeat(40));
  const llmResult = await llmSanitize(SAMPLES[0]);
  console.log(`\n  BEFORE: ${llmResult.original}`);
  console.log(`  AFTER : ${llmResult.sanitized}`);
  console.log(`  Detections: ${llmResult.detections.length}`);

  const summary = getSummary(results);
  console.log("\n" + "=".repeat(60));
  console.log(`  Summary: ${summary.totalRedactions} redactions`);
  for (const [cat, count] of Object.entries(summary.byCategory)) {
    console.log(`    ${cat}: ${count}`);
  }
  console.log("=".repeat(60));
}

async function interactive() {
  const readline = await import("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\n  Log Sanitization - Interactive Mode");
  console.log("  Engines: regex (default), llm, compare");
  console.log("  Type 'engine <mode>' to switch, 'quit' to exit.\n");

  let engine: "regex" | "llm" = "regex";

  const ask = () => new Promise<string>(resolve => rl.question("📝 > ", resolve));

  for (;;) {
    const input = await ask();
    if (input.toLowerCase() === "quit" || input.toLowerCase() === "exit") break;
    if (input.startsWith("engine ")) {
      engine = input.slice(7) as "regex" | "llm";
      console.log(`  Engine switched to: ${engine}`);
      continue;
    }

    if (engine === "llm") {
      const result = await llmSanitize(input);
      console.log(`\n✅ LLM Sanitized:\n   ${result.sanitized}`);
      if (result.detections.length > 0) {
        console.log(`🔍 Detected: ${result.detections.map(d => `${d.category}(${d.value.slice(0, 15)}...)`).join(", ")}`);
      } else {
        console.log("   No sensitive info found.");
      }
    } else {
      const result = sanitize(input);
      console.log(`\n✅ Regex Sanitized:\n   ${result.sanitized}`);
      if (result.redactions.length > 0) {
        console.log(`🔍 Found: ${result.redactions.map(r => `${r.category}(${r.originalValue.slice(0, 15)}...)`).join(", ")}`);
      } else {
        console.log("   No sensitive info found.");
      }
    }
    console.log();
  }

  rl.close();
}

async function llmMode() {
  const readline = await import("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\n  LLM Engine - Interactive");
  console.log("  Ollama model: " + (process.env.OLLAMA_MODEL || "gemma4:latest"));
  console.log("  Type text to detect PII, 'quit' to exit.\n");

  const ask = () => new Promise<string>(resolve => rl.question("🤖 > ", resolve));

  for (;;) {
    const input = await ask();
    if (input.toLowerCase() === "quit" || input.toLowerCase() === "exit") break;
    const result = await llmSanitize(input);
    console.log(`\n✅ LLM Sanitized:\n   ${result.sanitized}`);
    if (result.detections.length > 0) {
      console.log(`🔍 Detected: ${result.detections.map(d => `${d.category}(${d.value.slice(0, 15)}...)`).join(", ")}`);
    } else {
      console.log("   No sensitive info found.");
    }
    console.log();
  }

  rl.close();
}

function main() {
  const args = process.argv.slice(2);
  const mode = args.find(a => !a.startsWith("--")) || "demo";

  switch (mode) {
    case "demo": demo(); break;
    case "interactive": interactive(); break;
    case "llm": llmMode(); break;
    default: console.log(`Unknown mode: ${mode}. Use: demo, interactive, llm`);
  }
}

main();
