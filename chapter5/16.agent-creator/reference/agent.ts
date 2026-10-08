import { Ollama } from 'ollama';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MAX_STEPS = 4;

export interface TraceStep {
  tool: string;
  ok: boolean;
}

export interface AgentResult {
  answer: string;
  trace: TraceStep[];
}

function root(): string {
  return resolve(HERE);
}

function readFile(rel: string): string {
  const abs = resolve(root(), rel);
  if (!abs.startsWith(root())) throw new Error('path escapes workspace');
  if (!existsSync(abs)) throw new Error(`file not found: ${rel}`);
  return readFileSync(abs, 'utf-8');
}

function grepFiles(pattern: string): string[] {
  const out: string[] = [];
  const re = new RegExp(pattern, 'i');
  for (const entry of readdirSync(root())) {
    if (!entry.endsWith('.md')) continue;
    const lines = readFileSync(join(root(), entry), 'utf-8').split('\n');
    lines.forEach((line, i) => {
      if (out.length < 20 && re.test(line)) out.push(`${entry}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  return out;
}

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read a markdown file in the workspace directory.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'grep_files',
      description: 'Regex-search markdown files in the workspace directory.',
      parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
    },
  },
];

export async function runAgent(question: string): Promise<AgentResult> {
  const ollama = new Ollama({ host: BASE_URL });
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: 'Answer questions about CHANGELOG.md using the tools. Reply concisely.' },
    { role: 'user', content: question },
  ];
  const trace: TraceStep[] = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await ollama.chat({ model: MODEL, messages: messages as never, tools: TOOLS as never, options: { temperature: 0 } });
    const msg = res.message;
    const calls = (msg.tool_calls ?? []) as Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
    if (calls.length === 0) return { answer: msg.content.trim(), trace };
    messages.push({ role: 'assistant', content: msg.content });
    for (const c of calls) {
      let text = '';
      let ok = true;
      try {
        if (c.function.name === 'read_file') text = readFile(String(c.function.arguments?.['path'] ?? '')).slice(0, 3000);
        else if (c.function.name === 'grep_files') text = grepFiles(String(c.function.arguments?.['pattern'] ?? '')).join('\n') || '(no matches)';
        else text = `unknown tool ${c.function.name}`;
        if (text.startsWith('unknown tool')) ok = false;
      } catch (err) {
        ok = false;
        text = err instanceof Error ? err.message : String(err);
      }
      trace.push({ tool: c.function.name, ok });
      messages.push({ role: 'tool', content: text.slice(0, 3000) });
    }
  }
  return { answer: '(unfinished: step budget exhausted)', trace };
}
