import { Ollama } from 'ollama';
import { Problem } from './types.js';
import { runPython } from './sandbox.js';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MAX_ROUNDS = 2;
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

function getClient(): Ollama {
  return new Ollama({ host: BASE_URL });
}

async function chatWithTimeout(ollama: Ollama, payload: Parameters<Ollama['chat']>[0]): Promise<Awaited<ReturnType<Ollama['chat']>>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      ollama.chat(payload),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`ollama chat timeout after ${CHAT_TIMEOUT_MS}ms`)), CHAT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function extractFinalAnswer(text: string): number | null {
  const clean = text.replace(/\*/g, '');
  const marked =
    clean.match(/FINAL ANSWER\s*:?\s*(-?\d+)/i) ?? clean.match(/最终答案\s*[:：是为]?\s*(-?\d+)/);
  if (marked) return parseInt(marked[1] ?? '', 10);
  const bare = clean.match(/(-?\d+)(?!.*\d)/s);
  return bare ? parseInt(bare[1] ?? '', 10) : null;
}

function cleanCode(text: string): string {
  return text.replace(/```python|```/g, '').trim();
}

export async function runCot(p: Problem): Promise<{ guess: number | null; raw: string }> {
  const res = await chatWithTimeout(getClient(), {
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: `数学题（只能心算，不许写代码）：\n${p.question}\n逐步推理，最后用"FINAL ANSWER: <整数>"给出答案。`,
      },
    ],
    options: { temperature: 0 },
  });
  const raw = res.message.content;
  return { guess: extractFinalAnswer(raw), raw };
}

export interface CodeTrace {
  guess: number | null;
  rounds: Array<{ code: string; ok: boolean; output: string }>;
}

function lastInteger(text: string): number | null {
  const all = text.match(/-?\d+/g);
  if (!all || all.length === 0) return null;
  return parseInt(all[all.length - 1] ?? '', 10);
}

export async function runCode(p: Problem): Promise<CodeTrace> {
  const ollama = getClient();
  const messages: Array<{ role: string; content: string }> = [
    {
      role: 'system',
      content: '你有 run_python 工具（执行 Python 代码，返回 stdout）。第一次执行成功得到数字后，直接用该数字作答，不要再写验证代码。',
    },
    { role: 'user', content: `数学题：\n${p.question}` },
  ];
  const tools = [
    {
      type: 'function' as const,
      function: {
        name: 'run_python',
        description: '执行 Python 代码并返回 stdout（可用 math/itertools/numpy）',
        parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
      },
    },
  ];
  const rounds: CodeTrace['rounds'] = [];
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const res = await chatWithTimeout(ollama, { model: MODEL, messages: messages as never, tools: tools as never, options: { temperature: 0 } });
    const msg = res.message;
    const calls = (msg.tool_calls ?? []) as Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
    if (calls.length === 0) {
      const guess = extractFinalAnswer(msg.content);
      if (guess !== null) return { guess, rounds };
      messages.push({ role: 'assistant', content: msg.content });
      messages.push({ role: 'user', content: '请用"FINAL ANSWER: <整数>"给出最终答案。' });
      continue;
    }
    messages.push({ role: 'assistant', content: msg.content });
    for (const c of calls) {
      if (c.function.name !== 'run_python') continue;
      const code = cleanCode(String(c.function.arguments?.['code'] ?? ''));
      const run = await runPython(code);
      rounds.push({ code, ok: run.ok, output: (run.stdout + run.stderr).slice(0, 500) });
      messages.push({ role: 'tool', content: `stdout:\n${run.stdout.slice(0, 2000)}\nstderr:\n${run.stderr.slice(0, 500)}` });
    }
  }
  const res = await chatWithTimeout(ollama, {
    model: MODEL,
    messages: [...messages, { role: 'user', content: '刚才工具算出的数字是多少？只回一个整数，不要其他文字。' }] as never,
    options: { temperature: 0 },
  });
  const reported = extractFinalAnswer(res.message.content);
  if (reported !== null) return { guess: reported, rounds };
  const lastOk = [...rounds].reverse().find((r) => r.ok);
  const measured = lastOk ? lastInteger(lastOk.output) : null;
  return { guess: measured, rounds };
}

export async function runSelfcheck(p: Problem): Promise<{ ok: boolean; output: string }> {
  const run = await runPython(p.reference);
  const m = run.stdout.match(/-?\d+/);
  const value = m ? parseInt(m[0], 10) : null;
  return { ok: run.ok && value === p.answer, output: run.stdout.trim().slice(0, 100) };
}
