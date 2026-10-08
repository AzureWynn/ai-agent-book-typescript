import { DatabaseSync } from 'node:sqlite';
import { QUESTIONS } from './questions.js';
import { GOLD_SQL } from './gold.js';
import { generateSql } from './agent.js';
import { compareResults } from './compare.js';
import { openDatabase, seedDatabase, generateSeed, createTables } from './seed.js';
import { referenceAnswer } from './reference.js';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';

interface Args {
  mode: string;
  only: number[];
  query: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  };
  const onlyRaw = get('--only') ?? '';
  return {
    mode: get('--mode') ?? 'demo',
    only: onlyRaw ? onlyRaw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n)) : [],
    query: get('--query') ?? get('-q') ?? '',
  };
}

function setupDb(file?: string): DatabaseSync {
  if (!file) {
    const db = openDatabase();
    seedDatabase(db, generateSeed());
    return db;
  }
  try {
    unlinkSync(file);
  } catch {
    /* fresh file */
  }
  const db = new DatabaseSync(file);
  createTables(db);
  seedDatabase(db, generateSeed());
  return db;
}

function runSql(db: DatabaseSync, sql: string): { rows?: Record<string, unknown>[]; error?: string } {
  try {
    const rows = db.prepare(sql).all() as Record<string, unknown>[];
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function runGold(): Promise<void> {
  console.log('\n=== gold: 标准 SQL 跑 10 题（离线） ===');
  const db = setupDb();
  let ok = 0;
  for (const q of QUESTIONS) {
    const sql = GOLD_SQL[q.id] ?? '';
    const r = runSql(db, sql);
    const expected = referenceAnswer(q.id, { employees: generateSeed().employees, salaries: generateSeed().salaries });
    const ordered = q.id === 9;
    const pass = r.rows !== undefined && compareResults(r.rows, expected, ordered);
    if (pass) ok += 1;
    console.log(`  Q${q.id} ${pass ? '✓' : '✗'}${r.rows === undefined ? ` SQL报错：${r.error?.slice(0, 80)}` : ''}`);
  }
  console.log(`gold 通过率：${ok}/${QUESTIONS.length}`);
  db.close();
  if (ok !== QUESTIONS.length) process.exit(1);
}

async function runAgentEval(args: Args, demo: boolean): Promise<void> {
  const list = args.only.length > 0 ? QUESTIONS.filter((q) => args.only.includes(q.id)) : QUESTIONS;
  console.log(`\n=== Experiment 5-13: agent NL→SQL (${list.length} 题${demo ? ' · demo 只展示' : ''}) ===`);
  const db = setupDb();
  const seed = generateSeed();
  let ok = 0;
  for (const q of list) {
    const expected = referenceAnswer(q.id, seed);
    const ordered = q.id === 9;
    let sql = await generateSql(q);
    let r = sql ? runSql(db, sql) : { rows: undefined, error: 'no SQL generated' };
    if (r.rows === undefined) {
      const retry = await generateSql({ ...q, hint: `${q.hint} 上次报错：${r.error?.slice(0, 200)}，请修正重写。` });
      sql = retry;
      r = sql ? runSql(db, sql) : { rows: undefined, error: 'no SQL generated' };
    }
    const pass = r.rows !== undefined && compareResults(r.rows, expected, ordered);
    if (pass) ok += 1;
    console.log(`Q${q.id} ${pass ? '✓' : '✗'} ${q.text.slice(0, 24)}`);
    if (demo || !pass) {
      console.log(`  SQL: ${(sql ?? '(none)').split('\n').slice(0, 4).join(' / ').slice(0, 160)}`);
      if (!pass && r.rows === undefined) console.log(`  ERR: ${r.error?.slice(0, 120)}`);
    }
  }
  console.log('------------------------------------------------------------');
  console.log(`agent 通过率：${ok}/${list.length}`);
  db.close();
}

async function runAsk(query: string): Promise<void> {
  const db = setupDb();
  const sql = await generateSql({ id: 0, text: query, hint: '返回所有相关列。' });
  console.log(`\nSQL:\n${sql ?? '(none)'}`);
  if (sql) {
    const r = runSql(db, sql);
    if (r.rows === undefined) console.log(`ERR: ${r.error}`);
    else console.log(JSON.stringify(r.rows.slice(0, 20), null, 2));
  }
  db.close();
}

async function main(): Promise<void> {
  const args = parseArgs();
  try {
    if (args.mode === 'gold') await runGold();
    else if (args.mode === 'ask') {
      if (!args.query) {
        console.log('用法：--mode ask --query "研发部现在有多少在职员工？"');
        return;
      }
      await runAsk(args.query);
    } else if (args.mode === 'initdb') {
      if (!existsSync('data')) mkdirSync('data', { recursive: true });
      const db = setupDb('data/erp.db');
      db.close();
      console.log('已写入 data/erp.db（gitignored），可用 sqlite3 查看。');
    } else if (args.mode === 'eval') {
      await runAgentEval(args, false);
    } else {
      await runAgentEval({ ...args, only: args.only.length > 0 ? args.only : [2, 6] }, true);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    console.error('Note: agent 模式需要 Ollama（`ollama serve` + gemma4）；gold/selfcheck 完全离线。');
    process.exit(1);
  }
}

main();
