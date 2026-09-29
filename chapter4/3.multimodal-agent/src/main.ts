import { answerExtract, answerNative, answerWithTools } from './paradigms.js';
import { ParadigmResult } from './types.js';

interface Args {
  mode: string;
  query: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  };
  return { mode: get('--mode') ?? 'demo', query: get('--query') ?? get('-q') ?? '' };
}

const EVALS: Array<{ query: string; check: (answer: string) => boolean; expect: string }> = [
  {
    query: 'Which quarter had the highest revenue, and what was the exact value?',
    check: (a) => /Q4/i.test(a) && /63\.2/.test(a),
    expect: 'Q4 + 63.2',
  },
  {
    query: 'What was Q2 revenue, exactly?',
    check: (a) => /58\.3/.test(a),
    expect: '58.3',
  },
  {
    query: 'Did revenue grow every quarter?',
    check: (a) => /(\bno\b|not every|didn.?t|did not|dip|decreas|fell|decline|q3)/i.test(a),
    expect: 'No (Q3 dipped)',
  },
];

function printResult(r: ParadigmResult): void {
  console.log(`[${r.paradigm}] (${r.elapsedMs}ms)`);
  for (const n of r.notes) console.log(`  trace: ${n}`);
  console.log(`  answer: ${r.answer.split('\n')[0]?.slice(0, 220)}`);
}

async function runDemo(query: string): Promise<void> {
  const q = query || EVALS[0]?.query || '';
  console.log('\n=== Experiment 4-3: Three Paradigms Demo ===');
  console.log(`Question: "${q}" (exact figures live only in chart bars)`);
  const extract = await answerExtract(q);
  printResult({ ...extract, exactCorrect: (EVALS[0]?.check(extract.answer) ?? false) || /63\.2/.test(extract.answer) });
  const tools = await answerWithTools(q, 'And how did Q2 compare to Q3?');
  printResult(tools);
  printResult(answerNative());
  console.log('\nRead: extract preserves numbers cheaply; tools answer follow-ups selectively; native needs a vision endpoint (blocked here, honestly).');
}

async function runEval(): Promise<void> {
  console.log('\n=== Experiment 4-3: Paradigm Comparison ===');
  console.log('Paradigm        Q1 exact   Q2 exact   Q3 no-dip');
  const rows: Array<{ name: string; cells: boolean[] }> = [];
  const extractCells: boolean[] = [];
  for (const e of EVALS) {
    const r = await answerExtract(e.query);
    extractCells.push(e.check(r.answer));
  }
  rows.push({ name: 'extract-to-text', cells: extractCells });
  const toolCells: boolean[] = [];
  for (const e of EVALS) {
    const r = await answerWithTools(e.query);
    toolCells.push(e.check(r.answer));
  }
  rows.push({ name: 'tool-based     ', cells: toolCells });
  for (const r of rows) {
    console.log(`${r.name}   ${r.cells.map((c) => (c ? '✓' : '✗')).join('         ')}`);
  }
  console.log('native          — (blocked: no verified vision endpoint; see demo output)');
  console.log('\nFidelity: exact figures must come from measurement; cost: extract is one pass, tools cost per call; flexibility: tools win follow-ups.');
}

async function main(): Promise<void> {
  const args = parseArgs();
  try {
    if (args.mode === 'eval') await runEval();
    else await runDemo(args.query);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    console.error('Note: extract/tool modes need Ollama running (`ollama serve`) + gemma4 pulled.');
    process.exit(1);
  }
}

main();
