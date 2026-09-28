import dotenv from "dotenv";
dotenv.config();
import { OLLAMA_BASE_URL, OLLAMA_MODEL } from "./config.js";
import { VERBOSE } from "./config.js";

async function callOllama(messages: Array<{ role: string; content: string }>) {
  const resp = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false }),
  });
  if (!resp.ok) throw new Error(`Ollama API error ${resp.status}`);
  return resp.json();
}

const PII_PROMPT = `You are a PII (Personally Identifiable Information) detection expert.
Analyze the following text and identify ALL sensitive information.

For each piece of sensitive information found, output:
- category: the type (API_KEY, EMAIL, PHONE, ID_CARD, CREDIT_CARD, IP, etc.)
- value: the exact sensitive value
- placeholder: the appropriate [REDACTED_xxx] placeholder

Return ONLY a JSON array. No other text. Example:
[
  {"category": "API_KEY", "value": "sk-abc123...", "placeholder": "[REDACTED_API_KEY]"},
  {"category": "EMAIL", "value": "user@example.com", "placeholder": "[REDACTED_EMAIL]"}
]

Text to analyze:
{{TEXT}}`;

export interface PIIDetection {
  category: string;
  value: string;
  placeholder: string;
}

export async function llmSanitize(text: string): Promise<{
  original: string;
  sanitized: string;
  detections: PIIDetection[];
}> {
  const prompt = PII_PROMPT.replace("{{TEXT}}", text);

  if (VERBOSE) console.log("  [LLM] Sending request to Ollama...");

  const result = await callOllama([{ role: "user", content: prompt }]);
  const content = result.message?.content || "";

  // Parse JSON array from response
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  let detections: PIIDetection[] = [];

  if (jsonMatch) {
    try {
      detections = JSON.parse(jsonMatch[0]);
    } catch {
      if (VERBOSE) console.log("  [LLM] Failed to parse JSON:", content.slice(0, 100));
    }
  }

  // Apply replacements
  let sanitized = text;
  for (const det of detections) {
    if (det.value && det.placeholder) {
      sanitized = sanitized.replace(det.value, det.placeholder);
      if (VERBOSE) console.log(`  [LLM] ${det.category}: "${det.value.slice(0, 20)}..." → ${det.placeholder}`);
    }
  }

  return { original: text, sanitized, detections };
}