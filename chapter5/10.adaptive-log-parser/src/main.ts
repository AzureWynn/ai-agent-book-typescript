import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ParseEngine } from './engine.js';
import { cannedParser, generateParser } from './agent.js';
import { testParser } from './tester.js';
import { writeTextFile } from './pyrun.js';
import { BRACKET_LOGS, BRACKET_REQUIRED, JSON_LOGS, MIXED_STREAM, PIPE_LOGS, PIPE_REQUIRED } from './samples.js';
import { HealResult } from './types.js';

interface Args {
  mode: string;
  offline: boolean;
  quick: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  };
  const has = (name: string): boolean => argv.includes(name);
  return { mode: get('--mode') ?? 'demo', offline: has('--offline'), quick: has('--quick') };
}

function parsersDir(): string {
  const dir = resolve(process.cwd(), 'parsers');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanLearned(dir: string): void {
  for (const entry of readdirSync(dir)) {
    if (entry.endsWith('.py')) {
      try {
        unlinkSync(join(dir, entry));
      } catch {
        /* ignore */
      }
    }
  }
}

async function selfHeal(
  engine: ParseEngine,
  dir: string,
  parserName: string,
  samples: string[],
  requiredKeys: string[],
  offline: boolean,
  maxAttempts = 3,
  verbose = true
): Promise<HealResult> {
  const log = (msg: string): void => {
    if (verbose) console.log(msg);
  };
  const first = await engine.parseLine(samples[0] ?? '');
  if (first.parser) {
    log(`  已有解析器能处理（${first.parser}），跳过自愈。`);
    return { formatName: parserName, healed: true, attempts: 0, parserName: first.parser, lastError: '' };
  }
  log(`  ❌ 解析失败，触发自愈：${(samples[0] ?? '').slice(0, 70)}`);
  let feedback = '';
  let lastError = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`  --- 第 ${attempt}/${maxAttempts} 次：生成解析代码 ---`);
    let code: string;
    try {
      if (offline) {
        const canned = cannedParser(parserName);
        if (!canned) throw new Error(`no canned parser for ${parserName}`);
        code = canned;
      } else {
        code = await generateParser(samples[0] ?? '', requiredKeys, feedback);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      log(`  生成失败：${lastError}`);
      continue;
    }
    if (verbose) {
      console.log('    | ' + code.split('\n').slice(0, 6).join('\n    | '));
      if (code.split('\n').length > 6) console.log('    | ...');
    }
    const candidate = join(dir, `_candidate_${parserName}.py`);
    writeTextFile(candidate, code);
    const report = await testParser(engine, candidate, samples, requiredKeys);
    for (const d of report.details) log(`  🧪 ${d}`);
    if (report.passed) {
      const file = engine.persistParser(parserName, code);
      try {
        unlinkSync(candidate);
      } catch {
        /* ignore */
      }
      log(`  ✅ 通过，已热更新注册 '${parserName}' 并持久化到 ${file.split('/').pop()}`);
      const recheck = await engine.parseLine(samples[0] ?? '');
      return {
        formatName: parserName,
        healed: recheck.parser === parserName,
        attempts: attempt,
        parserName,
        lastError: '',
      };
    }
    lastError = report.details.join('；');
    feedback = `自动测试失败：${lastError}。请修正正则/字段名后重写完整代码。`;
    try {
      unlinkSync(candidate);
    } catch {
      /* ignore */
    }
  }
  return { formatName: parserName, healed: false, attempts: maxAttempts, parserName: null, lastError };
}

async function runDemo(args: Args): Promise<void> {
  const dir = parsersDir();
  cleanLearned(dir);
  console.log('\n=== Experiment 5-10: Adaptive Log Parser Demo ===');
  console.log(`模式：${args.offline ? 'offline（预置解析器，无需 Ollama）' : 'online（gemma4 现场写代码）'}`);
  const engine = new ParseEngine(dir);

  console.log('\n[原生 JSON 行]');
  for (const line of JSON_LOGS) {
    const r = await engine.parseLine(line);
    console.log(`  ${r.parser ? '✓' : '✗'} [${r.parser ?? 'none'}] ${line.slice(0, 60)}`);
  }

  console.log('\n[新格式 A：竖线分隔]');
  const healA = await selfHeal(engine, dir, 'pipe_parser', PIPE_LOGS, PIPE_REQUIRED, args.offline);
  console.log(`  自愈结果：${healA.healed ? '成功' : '失败'}（${healA.attempts} 次尝试）`);

  let healB: HealResult | null = null;
  if (!args.quick) {
    console.log('\n[新格式 B：嵌套括号]');
    healB = await selfHeal(engine, dir, 'bracket_parser', BRACKET_LOGS, BRACKET_REQUIRED, args.offline);
    console.log(`  自愈结果：${healB.healed ? '成功' : '失败'}（${healB.attempts} 次尝试）`);
  } else {
    console.log('\n[quick 模式跳过格式 B]');
  }

  console.log('\n[持久化复用：全新引擎从 parsers/ 加载]');
  const fresh = new ParseEngine(dir);
  const loaded = fresh.loadPersisted();
  console.log(`  加载：[${loaded.join(', ') || 'none'}]`);
  let ok = 0;
  for (const line of MIXED_STREAM) {
    const r = await fresh.parseLine(line);
    if (r.parser) ok += 1;
    console.log(`  ${r.parser ? '✓' : '✗'} [${r.parser ?? 'none'}] ${line.slice(0, 60)}`);
  }
  console.log(`\n混合流解析：${ok}/${MIXED_STREAM.length}`);
  console.log(`总结：A=${healA.healed ? '成功' : '失败'} B=${healB ? (healB.healed ? '成功' : '失败') : '跳过'} 复用=${ok === MIXED_STREAM.length ? '成功' : '失败'}`);
}

async function runEval(args: Args): Promise<void> {
  const dir = parsersDir();
  cleanLearned(dir);
  console.log('\n=== Experiment 5-10: Self-heal Eval ===');
  const engine = new ParseEngine(dir);
  const rows: Array<{ name: string; healed: boolean; attempts: number }> = [];
  const targets = args.quick
    ? [{ name: 'pipe_parser', samples: PIPE_LOGS, required: PIPE_REQUIRED }]
    : [
      { name: 'pipe_parser', samples: PIPE_LOGS, required: PIPE_REQUIRED },
      { name: 'bracket_parser', samples: BRACKET_LOGS, required: BRACKET_REQUIRED },
    ];
  for (const t of targets) {
    const r = await selfHeal(engine, dir, t.name, t.samples, t.required, args.offline, 3, false);
    rows.push({ name: t.name, healed: r.healed, attempts: r.attempts });
    console.log(`${t.name}: ${r.healed ? '✓' : '✗'}（${r.attempts} 次尝试）${r.healed ? '' : ' 原因：' + r.lastError.slice(0, 100)}`);
  }
  const fresh = new ParseEngine(dir);
  fresh.loadPersisted();
  let ok = 0;
  for (const line of MIXED_STREAM) {
    const r = await fresh.parseLine(line);
    if (r.parser) ok += 1;
  }
  console.log('------------------------------------------------------------');
  console.log(`自愈成功：${rows.filter((r) => r.healed).length}/${rows.length}，持久化复用：${ok}/${MIXED_STREAM.length}`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  try {
    if (args.mode === 'eval') await runEval(args);
    else await runDemo(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    console.error('Note: 在线模式需要 Ollama（`ollama serve` + gemma4）；离线加 --offline。');
    process.exit(1);
  }
}

main();
