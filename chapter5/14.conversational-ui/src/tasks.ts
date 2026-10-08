// 三个定制任务 + 机器验收。每个任务：需求 → customize（最多2次重试）→ 落盘 → 断言 + build。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { customize } from './agent.js';
import { applyEdits, runBuild } from './verify.js';

export interface Task {
  id: string;
  requirement: string;
  asserts: { name: string; file: string; must: string[]; mustNot?: string[] }[];
}

export const TASKS: Task[] = [
  {
    id: 'T1 按钮变蓝',
    requirement: '把发送按钮（.btn）的背景改成蓝色 #2563eb，其他不动。',
    asserts: [{ name: '按钮蓝色', file: 'src/theme.css', must: ['#2563eb'] }],
  },
  {
    id: 'T2 改标题文案',
    requirement: '把页面大标题从"我的应用"改成"任务看板"，副标题不变。',
    asserts: [{ name: '标题已换', file: 'src/App.jsx', must: ['任务看板'], mustNot: ['我的应用'] }],
  },
  {
    id: 'T3 标题放大',
    requirement: '把大标题字号从 28px 放大到 40px，颜色不变。',
    asserts: [{ name: '字号40', file: 'src/theme.css', must: ['40px'], mustNot: ['28px'] }],
  },
];

export interface TaskOutcome {
  id: string;
  summary: string;
  wrote: string[];
  diffs: string[];
  checks: { name: string; pass: boolean; detail: string }[];
  attempts: number;
}

export async function runTask(frontendDir: string, task: Task, trace: boolean): Promise<TaskOutcome> {
  let feedback = '';
  let attempts = 0;
  for (let round = 1; round <= 3; round++) {
    attempts = round;
    let res;
    try {
      res = await customize(frontendDir, task.requirement, feedback);
    } catch (e) {
      feedback = `上一轮被拒：${(e as Error).message}。只输出白名单文件。`;
      if (trace) console.log(`[retry${round}] ${(e as Error).message}`);
      continue;
    }
    if (res.files.length === 0) {
      feedback = '上一轮一个文件都没返回。必须输出至少一个 ```file: 路径块（文件全文）。';
      if (trace) console.log(`[retry${round}] 空结果`);
      continue;
    }
    const { wrote, diffs } = applyEdits(frontendDir, res.files);
    const checks: TaskOutcome['checks'] = [];
    for (const a of task.asserts) {
      const text = readFileSync(join(frontendDir, a.file), 'utf8');
      const hitMiss = a.must.filter((s) => !text.includes(s));
      const badKept = (a.mustNot ?? []).filter((s) => text.includes(s));
      checks.push({
        name: a.name,
        pass: hitMiss.length === 0 && badKept.length === 0,
        detail: hitMiss.length ? `缺：${hitMiss.join('、')}` : badKept.length ? `残留：${badKept.join('、')}` : '命中',
      });
    }
    const build = await runBuild(frontendDir);
    checks.push({ name: 'vite构建', pass: build.ok, detail: build.ok ? 'built' : build.out.slice(-200) });
    if (trace) {
      console.log(`\n[SUMMARY] ${res.summary || '（无）'}`);
      console.log(`[wrote] ${wrote.join(', ')}`);
      for (const d of diffs) console.log(`  ${d}`);
      for (const c of checks) console.log(`${c.pass ? '✓' : '✗'} ${c.name}: ${c.detail}`);
    }
    if (checks.every((c) => c.pass)) return { id: task.id, summary: res.summary, wrote, diffs, checks, attempts };
    feedback = `上一轮验收没过：${checks.filter((c) => !c.pass).map((c) => `${c.name}(${c.detail})`).join('；')}。请修正后重发文件全文。`;
    if (trace) console.log(`[retry${round}] ${feedback}`);
  }
  const checks: TaskOutcome['checks'] = [{ name: '三轮内完成', pass: false, detail: `用完 ${attempts} 次仍未全过` }];
  return { id: task.id, summary: '', wrote: [], diffs: [], checks, attempts };
}
