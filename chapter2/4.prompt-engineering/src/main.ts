/**
 * CLI 入口（对应官方 run_ablation.py + analyze_results.py 合并）。
 *
 *   npm run all                  # 6 臂 × 5 任务 + 对比表 + HTML 报告
 *   npm run run -- --arm baseline
 *   npm run report               # 离线汇总 runs/ 下已保存轨迹
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AblationAgent } from './agent.js';
import { TASKS } from './env.js';
import { ARMS, armByName } from './ablations.js';
import type { AblationConfig } from './ablations.js';
import type { RunResult } from './agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(ROOT, 'runs');

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* 默认值 */
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function runArm(agent: AblationAgent, cfg: AblationConfig, taskIds: string[]): Promise<RunResult[]> {
  console.log(`\n── 臂: ${cfg.name} ──`);
  const results: RunResult[] = [];
  for (const task of TASKS) {
    if (taskIds.length && !taskIds.includes(task.id)) continue;
    const r = await agent.runTask(task.id, task.request, cfg);
    const verdict = r.reward === 0 ? (r.calls.length ? '✗' : '✗') : '✓';
    console.log(`  ${task.id}: ${verdict} (${r.iterations} 轮, ${r.calls.map((c) => c.name).join('>') || '无工具'})`);
    results.push(r);
  }
  return results;
}

function scoreResults(results: RunResult[]): void {
  for (const r of results) {
    const task = TASKS.find((t) => t.id === r.taskId);
    if (!task) continue;
    const verdict = task.check(r.calls);
    r.reward = verdict.reward;
    r.info = verdict.info;
  }
}

export function summarize(results: RunResult[]): Array<{ arm: string; success: number; total: number; rate: number }> {
  const byArm = new Map<string, RunResult[]>();
  for (const r of results) {
    if (!byArm.has(r.arm)) byArm.set(r.arm, []);
    byArm.get(r.arm)!.push(r);
  }
  return [...byArm.entries()].map(([arm, list]) => {
    const success = list.filter((r) => r.reward === 1).length;
    return { arm, success, total: list.length, rate: list.length ? success / list.length : 0 };
  });
}

export function renderTable(summary: Array<{ arm: string; success: number; total: number; rate: number }>): string {
  const baseline = summary.find((s) => s.arm === 'baseline')?.rate ?? 1;
  const rows = summary
    .sort((a, b) => b.rate - a.rate)
    .map((s) => {
      const rel = baseline > 0 ? (s.rate / baseline) * 100 : 0;
      const star = s.arm === 'baseline' ? '  ⭐' : '';
      return `${s.arm.padEnd(16)} ${(s.rate * 100).toFixed(1).padStart(6)}%  ${String(s.success).padStart(2)}/${String(s.total).padStart(2).padEnd(4)}${rel.toFixed(0).padStart(8)}%${star}`;
    });
  return [
    'Experiment                        Success Rate      Tasks        Relative',
    '----------------------------------------------------------------------',
    ...rows,
  ].join('\n');
}

function renderHtml(results: RunResult[], summary: Array<{ arm: string; success: number; total: number; rate: number }>): string {
  const sorted = [...summary].sort((a, b) => b.rate - a.rate);
  const max = Math.max(...sorted.map((s) => s.rate), 1e-6);
  const bars = sorted
    .map((s) => {
      const w = Math.max(1, (s.rate / max) * 280);
      const color = s.arm === 'baseline' ? '#2f9e44' : '#4263eb';
      return `<div class="row"><span class="mode">${esc(s.arm)}</span>
        <span class="bar"><span class="fill" style="width:${w.toFixed(0)}px;background:${color}"></span></span>
        <span class="val">${(s.rate * 100).toFixed(1)}% (${s.success}/${s.total})</span></div>`;
    })
    .join('\n');
  const detail = results
    .map((r) => `<tr class="${r.reward ? 'ok' : 'bad'}"><td>${esc(r.arm)}</td><td>${esc(r.taskId)}</td><td>${r.reward ? '✅' : '❌'}</td><td>${esc(r.calls.map((c) => `${c.name}(${JSON.stringify(c.args)})`).join(' → ') || '无工具')}</td></tr>`)
    .join('\n');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>实验 2-4 提示工程消融</title>
<style>
body{font-family:ui-monospace,Menlo,monospace;margin:24px;color:#222}
h1{font-size:17px}h2{font-size:13px;color:#555}
.row{display:flex;align-items:center;gap:8px;margin:5px 0;font-size:12px}
.mode{width:120px;text-align:right}.bar{display:inline-block}
.fill{display:block;height:16px;border-radius:3px}.val{width:110px;color:#888}
table{border-collapse:collapse;font-size:11px;margin-top:16px}
td,th{border:1px solid #ddd;padding:3px 8px;max-width:520px;overflow:hidden}
th{background:#f4f4f4}.ok{color:#2f9e44}.bad{color:#c92a2a}
.note{font-size:11px;color:#888}
</style></head><body>
<h1>实验 2-4 · 提示工程消融（τ-bench-like 航空域）</h1>
<h2>模型 ${esc(process.env.MODEL_NAME ?? 'gemma4:latest')} · ${results.length} 个任务-臂组合</h2>
<div class="chart"><h3>成功率（基线为绿色）</h3>${bars}</div>
<table><tr><th>臂</th><th>任务</th><th>reward</th><th>工具轨迹</th></tr>${detail}</table>
<p class="note">reward = 规则化客观判定（0/1）。结构/清晰度（wiki 随机化、工具描述）应比语气更影响成功率。</p>
</body></html>`;
}

async function cmdAll(): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const agent = new AblationAgent();
  const all: RunResult[] = [];
  for (const cfg of ARMS) {
    const results = await runArm(agent, cfg, []);
    scoreResults(results);
    all.push(...results);
  }
  const summary = summarize(all);
  console.log('\n📊 成功率对比表:');
  console.log(renderTable(summary));

  const outJson = path.join(RUNS_DIR, `ablation_${stamp()}.json`);
  await fs.writeFile(outJson, JSON.stringify(all, null, 2));
  const html = path.join(RUNS_DIR, 'report.html');
  await fs.writeFile(html, renderHtml(all, summary));
  console.log(`\n已保存: ${path.relative(ROOT, outJson)}`);
  console.log(`可视化报告: ${path.relative(ROOT, html)}（浏览器打开）`);
}

async function cmdOne(armName: string): Promise<void> {
  const cfg = armByName(armName);
  if (!cfg) {
    console.log(`未知臂。可用: ${ARMS.map((a) => a.name).join(', ')}`);
    return;
  }
  const agent = new AblationAgent();
  const results = await runArm(agent, cfg, []);
  scoreResults(results);
  for (const r of results) {
    console.log(`  [${r.taskId}] ${r.reward ? '✅' : '❌'} ${r.info.join('; ') || '无'}`);
  }
}

async function cmdReport(): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const files = (await fs.readdir(RUNS_DIR)).filter((f) => /^ablation_.*\.json$/.test(f));
  if (!files.length) {
    console.log(`未找到 runs/ablation_*.json。先跑: npm run all`);
    return;
  }
  const all: RunResult[] = [];
  for (const f of files) {
    const data = JSON.parse(await fs.readFile(path.join(RUNS_DIR, f), 'utf8')) as RunResult[];
    all.push(...data);
  }
  const summary = summarize(all);
  console.log(renderTable(summary));
  const html = path.join(RUNS_DIR, 'report.html');
  await fs.writeFile(html, renderHtml(all, summary));
  console.log(`\n可视化报告: ${path.relative(ROOT, html)}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  console.log('='.repeat(60));
  console.log('🎯 提示工程消融实验（实验 2-4）');
  console.log('='.repeat(60));
  console.log(`模型: ${process.env.MODEL_NAME ?? 'gemma4:latest'}`);

  if (args.includes('--all')) {
    await cmdAll();
  } else if (args.includes('--report')) {
    await cmdReport();
  } else if (args.includes('--arm')) {
    await cmdOne(args[args.indexOf('--arm') + 1] ?? '');
  } else {
    console.log('用法:');
    console.log('  npm run all                      # 6 臂 × 5 任务 + 对比表 + 报告');
    console.log('  npm run run -- --arm baseline    # 单臂');
    console.log('  npm run report                   # 离线汇总 runs/ 轨迹');
  }
}

main().catch((e) => {
  console.error(`❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});