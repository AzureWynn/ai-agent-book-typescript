import { Ollama } from 'ollama';
import { Puzzle } from './types.js';
import { assignmentToSolution, solvePuzzle } from './solver.js';
import { runPython } from './sandbox.js';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

function getClient(): Ollama {
  return new Ollama({ host: BASE_URL });
}

export function formatSolution(sol: Record<string, 'knight' | 'knave'>, people: string[]): string {
  return people.map((p) => `${p}=${sol[p] === 'knight' ? '骑士' : '无赖'}`).join('，');
}

function parseAnswer(text: string, people: string[]): Record<string, 'knight' | 'knave'> | null {
  const out: Record<string, 'knight' | 'knave'> = {};
  for (const p of people) {
    const re = new RegExp(`${p}\\s*[是为:：=]\\s*(骑士|无赖|knight|knave)`, 'gi');
    let m: RegExpExecArray | null = null;
    let last: RegExpExecArray | null = null;
    while ((m = re.exec(text)) !== null) last = m;
    if (!last) return null;
    const v = (last[1] ?? '').toLowerCase();
    out[p] = v === '骑士' || v === 'knight' ? 'knight' : 'knave';
  }
  return out;
}

export function scoreGuess(
  guess: Record<string, 'knight' | 'knave'> | null,
  gold: Record<string, 'knight' | 'knave'>,
  people: string[]
): boolean {
  if (!guess) return false;
  return people.every((p) => guess[p] === gold[p]);
}

export async function runPure(puzzle: Puzzle): Promise<{ guess: Record<string, 'knight' | 'knave'> | null; raw: string }> {
  const res = await getClient().chat({
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: `逻辑谜题（骑士永远说真话，无赖永远说假话）：\n${puzzle.stem}\n请逐步推理，最后用"A是骑士，B是无赖"这样的格式给出每个人的身份（一行）。`,
      },
    ],
    options: { temperature: 0 },
  });
  const raw = res.message.content;
  return { guess: parseAnswer(raw, puzzle.people), raw };
}

const CODE_PREAMBLE = `只输出 Python 代码，不要解释，不要 markdown 围栏。
用 itertools 穷举所有可能，把每句话写成"说话人身份 == 这句话真值"的等价约束。
涉及人物用 True=骑士/False=无赖的布尔变量，最后 print 出字典如 {"A": True}。`;

export async function runCode(puzzle: Puzzle): Promise<{
  guess: Record<string, 'knight' | 'knave'> | null;
  code: string;
  stdout: string;
  runOk: boolean;
}> {
  const res = await getClient().chat({
    model: MODEL,
    messages: [{ role: 'user', content: `逻辑谜题（骑士永远说真话，无赖永远说假话）：\n${puzzle.stem}\n${CODE_PREAMBLE}` }],
    options: { temperature: 0 },
  });
  const code = res.message.content.replace(/```python|```/g, '');
  const run = await runPython(code);
  if (!run.ok) return { guess: null, code, stdout: run.stderr.slice(0, 300), runOk: false };
  const parsed = parsePythonDict(run.stdout, puzzle.people);
  return { guess: parsed, code, stdout: run.stdout.slice(0, 300), runOk: true };
}

function parsePythonDict(stdout: string, people: string[]): Record<string, 'knight' | 'knave'> | null {
  const out: Record<string, 'knight' | 'knave'> = {};
  for (const p of people) {
    const re = new RegExp(`['"]${p}['"]\\s*:\\s*(True|False|true|false)`);
    const m = stdout.match(re);
    if (!m) return null;
    out[p] = /true/i.test(m[1] ?? '') ? 'knight' : 'knave';
  }
  return out;
}

export function runSolver(puzzle: Puzzle): { guess: Record<string, 'knight' | 'knave'> | null; count: number } {
  const sols = solvePuzzle(puzzle.people, puzzle.statements);
  if (sols.length !== 1) return { guess: null, count: sols.length };
  return { guess: assignmentToSolution(sols[0] ?? {}), count: 1 };
}
