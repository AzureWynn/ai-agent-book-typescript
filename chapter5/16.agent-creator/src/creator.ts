import { Ollama } from 'ollama';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

const TARGET_TASK = [
  'Target: a release-notes Agent working on CHANGELOG.md in its own directory.',
  'It must: (1) draft release notes for a requested version (a draft_notes tool reading CHANGELOG.md),',
  '(2) answer follow-up questions about the changelog (read_file/grep-style tools),',
  'via an Ollama tool-calling loop (model from process.env.OLLAMA_MODEL, max 6 steps),',
  'with a CLI supporting --draft <version> and --ask "<question>".',
  'Conventions: ESM TypeScript, .js import suffixes (mandatory: `./agent.js`, never `./agent`), workspace-relative paths sandboxed to its own directory.',
].join('\n');

const OUTPUT_CONTRACT = [
  'Output exactly three fenced blocks, one per file, in this form:',
  '```ts agent.ts',
  '... full file ...',
  '```',
  '```ts cli.ts',
  '... full file ...',
  '```',
  '```ts test.mts',
  '... full file ...',
  '```',
  'agent.ts must export async function runAgent(question: string): Promise<{ answer: string; trace: Array<{ tool: string; ok: boolean }> }>.',
  'cli.ts must support --draft <version> and --ask "<question>".',
  'test.mts must use only node:assert from the standard library (no vitest/jest/mocha — they are not installed); import runAgent, ask about v2.4.0, assert the answer mentions "dark mode", exit 0/1.',
  'test.mts may only import ./agent.js and node:assert — no other local files (anything else fails the gates).',
  'Only node builtins plus the ollama package may be imported (both resolvable from the parent directory).',
  'No other text outside the three blocks.',
].join('\n');

function referenceSource(): string {
  const dir = resolve(HERE, '../reference');
  const read = (f: string): string => {
    try {
      return readFileSync(join(dir, f), 'utf-8');
    } catch {
      return '(unreadable)';
    }
  };
  return ['agent.ts:', read('agent.ts'), 'cli.ts:', read('cli.ts')].join('\n');
}

export function scratchPrompt(): string {
  return ['Write everything from zero (no reference implementation).', '', TARGET_TASK, '', OUTPUT_CONTRACT].join('\n');
}

export function templatePrompt(): string {
  return [
    'A proven reference agent is provided below. Reuse its message/tool loop and tool protocol verbatim;',
    'only add the domain behavior (draft_notes tool, --draft command, domain test).',
    '',
    'REFERENCE:',
    referenceSource(),
    '',
    TARGET_TASK,
    '',
    OUTPUT_CONTRACT,
  ].join('\n');
}

export interface GeneratedFile {
  name: string;
  content: string;
}

export function parseFiles(text: string): GeneratedFile[] {
  const out: GeneratedFile[] = [];
  const re = /```ts\s+(\S+)\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = (m[1] ?? '').trim();
    if (['agent.ts', 'cli.ts', 'test.mts'].includes(name)) {
      out.push({ name, content: (m[2] ?? '').trim() + '\n' });
    }
  }
  return out;
}

async function chatWithTimeout(ollama: Ollama, prompt: string): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const res = await Promise.race([
      ollama.chat({ model: MODEL, messages: [{ role: 'user', content: prompt }], options: { temperature: 0 } }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`ollama chat timeout after ${CHAT_TIMEOUT_MS}ms`)), CHAT_TIMEOUT_MS);
      }),
    ]);
    return res.message.content;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runArm(arm: 'scratch' | 'template', runDir: string): Promise<{ files: GeneratedFile[]; ms: number; tokens: number; raw: string }> {
  const started = Date.now();
  const ollama = new Ollama({ host: BASE_URL });
  const prompt = arm === 'scratch' ? scratchPrompt() : templatePrompt();
  let raw = await chatWithTimeout(ollama, prompt);
  let files = parseFiles(raw);
  const missing = ['agent.ts', 'cli.ts', 'test.mts'].filter((f) => !files.some((x) => x.name === f));
  if (missing.length > 0) {
    const retry = await chatWithTimeout(ollama, `You forgot these mandatory blocks: ${missing.join(', ')}. Output ONLY the missing fenced block(s) in the same \`\`\`ts <filename> format, full file content, no other text.`);
    const extra = parseFiles(retry);
    files = [...files, ...extra.filter((x) => !files.some((y) => y.name === x.name))];
    raw += `\n[retry]\n${retry}`;
  }
  const ms = Date.now() - started;
  mkdirSync(runDir, { recursive: true });
  for (const f of files) writeFileSync(join(runDir, f.name), f.content, 'utf-8');
  const changelog = readFileSync(resolve(HERE, '../reference/CHANGELOG.md'), 'utf-8');
  writeFileSync(join(runDir, 'CHANGELOG.md'), changelog, 'utf-8');
  return { files, ms, tokens: Math.ceil((prompt.length + raw.length) / 4), raw };
}
