import { PUZZLES } from './puzzles.js';
import { formatSolution, runCode, runPure, runSolver, scoreGuess } from './modes.js';

interface Args {
  mode: string;
  limit: number;
  maxPeople: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  };
  return {
    mode: get('--mode') ?? 'demo',
    limit: parseInt(get('--limit') ?? '0', 10),
    maxPeople: parseInt(get('--max-people') ?? '99', 10),
  };
}

function select(args: Args) {
  let list = PUZZLES.filter((p) => p.people.length <= args.maxPeople);
  if (args.limit > 0) list = list.slice(0, args.limit);
  return list;
}

async function runDemo(): Promise<void> {
  const puzzle = PUZZLES.find((p) => p.id === 'kk01');
  if (!puzzle) throw new Error('kk01 missing');
  console.log('\n=== Experiment 5-4: K&K Demo (kk01, 2人) ===');
  console.log(`题面：${puzzle.stem}`);

  const solver = runSolver(puzzle);
  console.log(`\n[solver 离线] 解数=${solver.count} 预测=${solver.guess ? formatSolution(solver.guess, puzzle.people) : '(none)'}`);

  const pure = await runPure(puzzle);
  const pureOk = scoreGuess(pure.guess, puzzle.solution, puzzle.people);
  console.log(`\n[pure 纯思考] ${pureOk ? '✓' : '✗'} 预测=${pure.guess ? formatSolution(pure.guess, puzzle.people) : '(解析失败)'}`);

  const code = await runCode(puzzle);
  const codeOk = scoreGuess(code.guess, puzzle.solution, puzzle.people);
  console.log(`\n[code 代码辅助] 运行${code.runOk ? '成功' : '失败'} ${codeOk ? '✓' : '✗'} 预测=${code.guess ? formatSolution(code.guess, puzzle.people) : '(解析失败)'}`);
  console.log('\nRead: 双条件约束 + 穷举 = 不会心算错；纯思考看模型发挥。');
}

async function runEval(args: Args): Promise<void> {
  const list = select(args);
  console.log(`\n=== Experiment 5-4: pure vs code (${list.length} 题) ===`);
  let pureCorrect = 0;
  let codeCorrect = 0;
  let solverCorrect = 0;
  const rows: string[] = [];
  for (const p of list) {
    const solver = runSolver(p);
    const solverOk = scoreGuess(solver.guess, p.solution, p.people);
    if (solverOk) solverCorrect += 1;

    const pure = await runPure(p);
    const pureOk = scoreGuess(pure.guess, p.solution, p.people);
    if (pureOk) pureCorrect += 1;

    const code = await runCode(p);
    const codeOk = scoreGuess(code.guess, p.solution, p.people);
    if (codeOk) codeCorrect += 1;

    rows.push(`${p.id}  ${p.people.length}人  pure=${pureOk ? '✓' : '✗'}  code=${codeOk ? '✓' : '✗'}${code.runOk ? '' : ' (代码没跑起来)'}`);
  }
  console.log('题号    人数  纯思考  代码辅助');
  for (const r of rows) console.log(r);
  console.log('------------------------------------------------------------');
  console.log(`solver(离线) 准确率: ${(100 * (solverCorrect / list.length)).toFixed(1)}%  (${solverCorrect}/${list.length})`);
  console.log(`pure(纯思考) 准确率: ${(100 * (pureCorrect / list.length)).toFixed(1)}%  (${pureCorrect}/${list.length})`);
  console.log(`code(代码辅助) 准确率: ${(100 * (codeCorrect / list.length)).toFixed(1)}%  (${codeCorrect}/${list.length})`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  try {
    if (args.mode === 'eval') await runEval(args);
    else if (args.mode === 'solver') {
      const list = select(args);
      let ok = 0;
      for (const p of list) {
        const s = runSolver(p);
        const good = scoreGuess(s.guess, p.solution, p.people);
        if (good) ok += 1;
        console.log(`[solver] ${p.id} (${p.people.length}人) ${good ? '✓' : '✗'}  解数=${s.count} 预测=${s.guess ? formatSolution(s.guess, p.people) : '(none)'}`);
      }
      console.log(`准确率 ${(100 * (ok / list.length)).toFixed(1)}%  (${ok}/${list.length})`);
    } else await runDemo();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    console.error('Note: pure/code 需要 Ollama（`ollama serve` + gemma4）；solver 完全离线。');
    process.exit(1);
  }
}

main();
