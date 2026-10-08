// demo：T1 全轨迹展示；eval：T1+T2 验收对照表。
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync, existsSync, writeFileSync } from 'node:fs';
import { T1, T2, checkT1, checkT2, runTask } from './tasks.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = join(ROOT, 'workspace');
const REPO = resolve(ROOT, '..', '..');

const BUGGY_CALC = `// 加法工具（T2 任务：这里有个 bug，test.mjs 会挂）
export function add(a, b) {
  return a - b; // TODO: fix operator, should be +
}
`;

// 每次跑前重置：eval 会修掉 bug，不重置第二次跑就是"开卷考"
function resetFixtures() {
  const list = join(WORKSPACE, 'TODO_LIST.md');
  if (existsSync(list)) rmSync(list);
  writeFileSync(join(WORKSPACE, 'sample-project/calc.mjs'), BUGGY_CALC);
}

const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'demo';

function clean() {
  resetFixtures();
}

async function main() {
  if (mode === 'demo') {
    clean();
    console.log(`# T1 只读任务\n${T1}\n`);
    const out = await runTask(T1, WORKSPACE, REPO, true);
    console.log(`\n轮数=${out?.iterations} 工具调用=${out?.toolCalls} 格式错误=${out?.formatErrors} 完成=${out?.finished}`);
    for (const c of checkT1(WORKSPACE)) console.log(`${c.pass ? '✓' : '✗'} ${c.name}: ${c.detail}`);
    resetFixtures();
    console.log('(workspace 已重置回初始状态)');
  } else {
    const rows: { task: string; checks: { name: string; pass: boolean; detail: string }[]; iterations: number; toolCalls: number }[] = [];
    clean();
    const o1 = await runTask(T1, WORKSPACE, REPO, false);
    rows.push({ task: 'T1 TODO清单', checks: checkT1(WORKSPACE), iterations: o1?.iterations ?? 0, toolCalls: o1?.toolCalls ?? 0 });
    const o2 = await runTask(T2, WORKSPACE, REPO, false);
    rows.push({ task: 'T2 修复循环', checks: checkT2(WORKSPACE), iterations: o2?.iterations ?? 0, toolCalls: o2?.toolCalls ?? 0 });
    console.log('\n任务      检查项        结果  说明\n----      ------        ----  ----');
    for (const r of rows) {
      for (const c of r.checks) console.log(`${r.task}  ${c.name}  ${c.pass ? '✓' : '✗'}  ${c.detail}`);
      console.log(`  （轮数 ${r.iterations}，工具调用 ${r.toolCalls}）`);
    }
    resetFixtures();
    console.log('(workspace 已重置回初始状态)');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
