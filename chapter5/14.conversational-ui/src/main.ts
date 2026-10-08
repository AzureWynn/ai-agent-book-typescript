// demo：T1 全轨迹；eval：三任务 + 对照表。跑前后重置夹具（eval 逐任务重置）。
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { TASKS, runTask } from './tasks.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = join(ROOT, 'frontend');

const PRISTINE: Record<string, string> = {};
for (const rel of ['src/App.jsx', 'src/theme.css']) {
  PRISTINE[rel] = readFileSync(join(FRONTEND, rel), 'utf8');
}

function reset() {
  for (const [rel, content] of Object.entries(PRISTINE)) writeFileSync(join(FRONTEND, rel), content);
}

const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'demo';

async function main() {
  if (mode === 'demo') {
    reset();
    const t = TASKS[0] as (typeof TASKS)[number];
    console.log(`# ${t.id}\n需求：${t.requirement}\n`);
    const out = await runTask(FRONTEND, t, true);
    console.log(`\n尝试=${out.attempts} 全过=${out.checks.every((c) => c.pass)}`);
    reset();
    console.log('(frontend 已重置回初始状态)');
  } else {
    console.log('\n任务      检查项    结果  说明\n----      ------    ----  ----');
    for (const t of TASKS) {
      reset();
      const out = await runTask(FRONTEND, t, false);
      for (const c of out.checks) console.log(`${t.id}  ${c.name}  ${c.pass ? '✓' : '✗'}  ${c.detail}`);
      console.log(`  （尝试 ${out.attempts}，改写：${out.wrote.join(', ') || '无'}）${out.summary ? `摘要：${out.summary}` : ''}`);
    }
    reset();
    console.log('(frontend 已重置回初始状态)');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
