import { PROBLEMS } from './problems.js';
import { runCode, runCot, runSelfcheck as checkProblem } from './modes.js';

interface Args {
  mode: string;
  limit: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  };
  return { mode: get('--mode') ?? 'demo', limit: parseInt(get('--limit') ?? '0', 10) };
}

async function runDemo(): Promise<void> {
  const p = PROBLEMS.find((x) => x.id === 'm08');
  if (!p) throw new Error('m08 missing');
  console.log('\n=== Experiment 5-3: Math Demo (m08, 2^1000 digit sum) ===');
  console.log(`题目：${p.question}（心算不可能，直接考"外包计算"）`);

  const cot = await runCot(p);
  console.log(`\n[cot 纯思维链] ${cot.guess === p.answer ? '✓' : '✗'} 预测=${cot.guess ?? '(解析失败)'}`);

  const code = await runCode(p);
  console.log(`[code 代码辅助] ${code.guess === p.answer ? '✓' : '✗'} 预测=${code.guess ?? '(解析失败)'}`);
  for (const [i, r] of code.rounds.entries()) {
    console.log(`  round ${i + 1}: ${r.ok ? 'ok' : 'FAIL'} → ${r.output.split('\n')[0]?.slice(0, 80)}`);
  }
  console.log('\nRead: 2^1000 有 302 位数字，心算没门；一行代码 0.01 秒。');
}

async function runEval(args: Args): Promise<void> {
  const list = args.limit > 0 ? PROBLEMS.slice(0, args.limit) : PROBLEMS;
  console.log(`\n=== Experiment 5-3: cot vs code (${list.length} 题) ===`);
  let cotCorrect = 0;
  let codeCorrect = 0;
  const rows: string[] = [];
  for (const p of list) {
    let cotOk = false;
    let cotMark = '?';
    try {
      const cot = await runCot(p);
      cotOk = cot.guess === p.answer;
      cotMark = cot.guess === null ? '?' : String(cot.guess);
    } catch (err) {
      cotMark = `ERR:${err instanceof Error ? err.message.slice(0, 40) : 'unknown'}`;
    }
    if (cotOk) cotCorrect += 1;

    let codeOk = false;
    let codeMark = '?';
    try {
      const code = await runCode(p);
      codeOk = code.guess === p.answer;
      codeMark = code.guess === null ? '?' : String(code.guess);
    } catch (err) {
      codeMark = `ERR:${err instanceof Error ? err.message.slice(0, 40) : 'unknown'}`;
    }
    if (codeOk) codeCorrect += 1;

    const row = `${p.id}  ${p.topic.slice(0, 28).padEnd(28)}  cot=${cotOk ? '✓' : '✗'}(${cotMark})  code=${codeOk ? '✓' : '✗'}(${codeMark})`;
    rows.push(row);
    console.log(row);
  }
  console.log('题号   考点                          CoT预测      代码预测');
  for (const r of rows) console.log(r);
  console.log('------------------------------------------------------------');
  console.log(`cot(纯思维链) 准确率: ${(100 * (cotCorrect / list.length)).toFixed(1)}%  (${cotCorrect}/${list.length})`);
  console.log(`code(代码辅助) 准确率: ${(100 * (codeCorrect / list.length)).toFixed(1)}%  (${codeCorrect}/${list.length})`);
}

async function runSelfcheck(): Promise<void> {
  console.log('\n=== Selfcheck: 参考解跑沙箱对真值 ===');
  let ok = 0;
  for (const p of PROBLEMS) {
    const r = await checkProblem(p);
    if (r.ok) ok += 1;
    console.log(`  ${p.id}  真值=${p.answer}  沙箱输出=${r.output.slice(0, 40)}  ${r.ok ? '✓' : '✗'}`);
  }
  console.log(`参考解命中真值：${ok}/${PROBLEMS.length}`);
  if (ok !== PROBLEMS.length) process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArgs();
  try {
    if (args.mode === 'eval') await runEval(args);
    else if (args.mode === 'selfcheck') await runSelfcheck();
    else await runDemo();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    console.error('Note: cot/code 需要 Ollama（`ollama serve` + gemma4）；selfcheck 完全离线。');
    process.exit(1);
  }
}

main();
