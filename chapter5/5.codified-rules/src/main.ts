// demo：R009（改签陷阱，核心演示样例）双臂；eval：8 case × 双臂配对 + 对照表。
import { TASKS } from './tasks.js';
import { runCase, score, isRefundable, type Arm } from './agent.js';

const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'demo';

async function oneCase(taskId: string, arm: Arm, trace: boolean) {
  const t = TASKS.find((x) => x.task_id === taskId) as (typeof TASKS)[number];
  const expect = isRefundable(t.reservation).ok;
  const out = await runCase(t.reservation, t.user_message, arm, trace);
  const s = score(expect, out);
  return { taskId, expect, arm, pass: s.pass, detail: s.detail, turns: out.turns };
}

async function main() {
  if (mode === 'demo') {
    console.log('# R009 改签陷阱：航司改时刻 ≠ 可退（双臂同题）\n');
    for (const arm of ['control', 'codified'] as Arm[]) {
      console.log(`--- ${arm} ---`);
      const r = await oneCase('R009-reschedule-trap', arm, true);
      console.log(`${r.pass ? '✓' : '✗'} 期望${r.expect ? '可退' : '不可退'}：${r.detail}（${r.turns}轮）\n`);
    }
  } else {
    let cOk = 0;
    let eOk = 0;
    console.log('\ncase  期望    control        codified\n----  ----    -------        --------');
    for (const t of TASKS) {
      const c = await oneCase(t.task_id, 'control', false);
      const e = await oneCase(t.task_id, 'codified', false);
      if (c.pass) cOk++;
      if (e.pass) eOk++;
      console.log(`${t.task_id}  ${c.expect ? '可退' : '不可退'}  ${c.pass ? '✓' : '✗'} ${c.detail.slice(0, 24)}  ${e.pass ? '✓' : '✗'} ${e.detail.slice(0, 24)}`);
    }
    console.log(`\ncontrol ${cOk}/8 vs codified ${eOk}/8（配对同题，官方 60 题结论：91.7% vs 95.0%，p=0.6875 未显著）`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
