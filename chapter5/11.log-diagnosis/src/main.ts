// demo：S1 全链（诊断→用例→重放→Issue草稿）；eval：三场景对照表。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTask, SCENARIOS } from './sut.js';
import { diagnose, genTestCases } from './diagnoser.js';
import { replay } from './replay.js';
import { writeIssueDraft } from './issue.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'demo';

const ARCH = readFileSync(join(DATA, 'architecture.md'), 'utf8');
const PRD = readFileSync(join(DATA, 'prd.md'), 'utf8');

async function chain(scenarioId: string, trace: boolean) {
  const sc = SCENARIOS.find((s) => s.id === scenarioId) as (typeof SCENARIOS)[number];
  const buggy = runTask(sc.input, false);
  const fixed = runTask(sc.input, true);
  writeFileSync(join(DATA, 'trajectories.jsonl'), JSON.stringify(buggy) + '\n');
  const problems = await diagnose(ARCH, PRD, [buggy]);
  if (trace) {
    console.log(`[诊断] ${problems.length} 个问题：`);
    for (const p of problems) console.log(`  ${p.priority} ${p.module} ${p.prd_ref}：${p.title}`);
  }
  const cases = await genTestCases(problems);
  if (trace) {
    console.log(`[用例] ${cases.length} 条：`);
    for (const c of cases) console.log(`  ${c.test_id} ${c.assertion?.type} ${JSON.stringify(c.assertion?.params)}`);
  }
  const verdicts = cases.map((c) => replay(c, buggy, fixed));
  const draft = writeIssueDraft(ROOT, sc.id, problems, verdicts);
  return { sc, problems, cases, verdicts, draft };
}

async function main() {
  if (mode === 'demo') {
    console.log('# S1 退款网关抖动：全链\n');
    const { verdicts, draft } = await chain('S1 退款网关抖动', true);
    console.log('\n[重放]');
    for (const v of verdicts) console.log(`  ${v.test_id}: ${v.detail} ${v.flip ? '✓翻转' : '✗未翻转'}`);
    console.log(`\nIssue 草稿：${draft}`);
  } else {
    console.log('\n场景          诊断命中  用例  翻转     Issue草稿\n----          --------  ----  ------     --------');
    for (const sc of SCENARIOS) {
      const { problems, cases, verdicts, draft } = await chain(sc.id, false);
      const refs = problems.map((p) => p.prd_ref ?? '').join(',');
      const hit = sc.expectProblems.filter((e) => refs.includes(e)).length;
      const flips = verdicts.filter((v) => v.flip).length;
      console.log(`${sc.id}  ${hit}/${sc.expectProblems.length}(${refs || '无'})  ${cases.length}条  ${flips}/${verdicts.length}翻转  ${draft.split('/').pop()}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
