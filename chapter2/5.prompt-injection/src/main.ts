/**
 * CLI 入口（对应官方 demo.py）。
 *
 *   npm run all                      # 3 攻击 × 4 防御 × N trials + 成功率矩阵 + HTML
 *   npm run run -- --trials 4 --model gemma4:latest
 *   npm run run -- --attack 2,3 --defense D1,D4
 *   npm run report                   # 离线汇总 runs/ 下结果
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { InjectionAgent, type RunResult } from './agent.js';
import { ATTACKS, attackByIndex } from './attacks.js';
import { DEFENSES, defenseByIndex } from './defenses.js';

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

interface Matrix {
  attacks: string[];
  defenses: string[];
  cells: Map<string, { success: number; total: number }>;
}

function aggregate(results: RunResult[]): Matrix {
  const attacks = [...new Set(results.map((r) => r.attack))];
  const defenses = [...new Set(results.map((r) => r.defense))];
  const cells = new Map<string, { success: number; total: number }>();
  for (const r of results) {
    const key = `${r.attack}|${r.defense}`;
    const cell = cells.get(key) ?? { success: 0, total: 0 };
    cell.total++;
    if (r.success) cell.success++;
    cells.set(key, cell);
  }
  return { attacks, defenses, cells };
}

function renderMatrix(m: Matrix): string {
  const lines: string[] = [];
  const header = `攻击 \\ 防御        ${m.defenses.map((d) => d.padEnd(14)).join('')}`;
  lines.push(header);
  lines.push('-'.repeat(header.length));
  for (const a of m.attacks) {
    const cells = m.defenses.map((d) => {
      const c = m.cells.get(`${a}|${d}`);
      const rate = c ? (c.success / c.total) * 100 : 0;
      return `${rate.toFixed(0).padStart(3)}% (${c ? c.success : 0}/${c ? c.total : 0})`.padEnd(14);
    });
    lines.push(`${a.padEnd(14)}  ${cells.join('')}`);
  }
  const avg = m.defenses.map((d) => {
    let s = 0;
    let t = 0;
    for (const a of m.attacks) {
      const c = m.cells.get(`${a}|${d}`);
      if (c) {
        s += c.success;
        t += c.total;
      }
    }
    return `${t ? ((s / t) * 100).toFixed(0) : '0'}%`.padEnd(14);
  });
  lines.push('-'.repeat(header.length));
  lines.push(`${'平均'.padEnd(14)}  ${avg.join('')}`);
  return lines.join('\n');
}

function renderHtml(m: Matrix, results: RunResult[], model: string, trials: number): string {
  const rows = results
    .map((r) => {
      const cls = r.success ? 'bad' : 'ok';
      const calls = r.calls.map((c) => `${c.name}${c.blocked ? '[BLOCKED]' : ''}`).join(' → ') || '无工具';
      return `<tr class="${cls}"><td>${esc(r.attack)}</td><td>${esc(r.defense)}</td><td>${r.success ? '✅' : '🛡️'}</td><td>${esc(calls)}</td></tr>`;
    })
    .join('\n');
  const table = m.defenses
    .map((d) => {
      const cols = m.attacks.map((a) => {
        const c = m.cells.get(`${a}|${d}`);
        const rate = c ? (c.success / c.total) * 100 : 0;
        return `<div class="cell"><b>${rate.toFixed(0)}%</b><small>${c ? `${c.success}/${c.total}` : '0/0'}</small></div>`;
      }).join('');
      return `<div class="drow"><span class="dname">${esc(d)}</span>${cols}</div>`;
    })
    .join('\n');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>实验 2-5 提示注入攻防</title>
<style>
body{font-family:ui-monospace,Menlo,monospace;margin:24px;color:#222}
h1{font-size:17px}h2{font-size:13px;color:#555}
.drow{display:flex;align-items:center;gap:6px;margin:4px 0}
.dname{width:110px;text-align:right;font-size:12px;color:#333}
.cell{width:64px;text-align:center;border:1px solid #eee;padding:4px 2px;border-radius:4px}
.cell b{display:block;font-size:14px}.cell small{color:#999}
td,th{border:1px solid #ddd;padding:3px 8px;font-size:11px}
.ok{color:#2f9e44}.bad{color:#c92a2a}
.note{font-size:11px;color:#888;line-height:1.7}
</style></head><body>
<h1>实验 2-5 · 提示注入攻防（3 攻击 × 4 防御 × ${trials} trials）</h1>
<h2>模型 ${esc(model)} · 防御越厚，注入成功率越低</h2>
<div class="chart">${table}</div>
<table><tr><th>攻击</th><th>防御</th><th>结果</th><th>工具轨迹</th></tr>${rows}</table>
<p class="note">✅ = 注入成功（不安全）; 🛡️ = 被防御住。判定为确定性规则（密钥泄露 / 越权工具调用）。
D2/D3 是概率性上下文防御，D4 是执行层确定性兜底。</p>
</body></html>`;
}

function selOf(args: string[], flag: string): string[] {
  const i = args.indexOf(flag);
  if (i === -1) return [];
  return (args[i + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function flagVal(args: string[], flag: string, def: string): string {
  const i = args.indexOf(flag);
  return i === -1 ? def : (args[i + 1] ?? def);
}

async function cmdAll(args: string[]): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const trials = Number(flagVal(args, '--trials', '4'));
  const model = flagVal(args, '--model', process.env.MODEL_NAME ?? 'gemma4:latest');
  const attacks = attackByIndex(selOf(args, '--attack'));
  const defenses = defenseByIndex(selOf(args, '--defense'));

  const agent = new InjectionAgent(model);
  const results: RunResult[] = [];
  console.log(`使用模型：${model}，每个组合试验 ${trials} 次\n`);
  for (const attack of attacks) {
    for (const defense of defenses) {
      let success = 0;
      for (let t = 0; t < trials; t++) {
        const r = await agent.runAttack(attack, defense);
        results.push(r);
        if (r.success) success++;
      }
      const rate = ((success / trials) * 100).toFixed(0);
      console.log(`[${attack.label}] x [${defense.label}] 成功率 ${rate}% (${success}/${trials})`);
    }
  }

  const matrix = aggregate(results);
  console.log('\n' + '='.repeat(60));
  console.log('攻击成功率矩阵（行=攻击，列=防御，越低越安全）');
  console.log('='.repeat(60));
  console.log(renderMatrix(matrix));

  const outJson = path.join(RUNS_DIR, `injection_${stamp()}.json`);
  await fs.writeFile(outJson, JSON.stringify(results, null, 2));
  const html = path.join(RUNS_DIR, 'report.html');
  await fs.writeFile(html, renderHtml(matrix, results, model, trials));
  console.log(`\n已保存: ${path.relative(ROOT, outJson)}`);
  console.log(`可视化报告: ${path.relative(ROOT, html)}（浏览器打开）`);
}

async function cmdReport(): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const files = (await fs.readdir(RUNS_DIR)).filter((f) => /^injection_.*\.json$/.test(f));
  if (!files.length) {
    console.log(`未找到 runs/injection_*.json。先跑: npm run all`);
    return;
  }
  const all: RunResult[] = [];
  for (const f of files) {
    const data = JSON.parse(await fs.readFile(path.join(RUNS_DIR, f), 'utf8')) as RunResult[];
    all.push(...data);
  }
  const matrix = aggregate(all);
  console.log(renderMatrix(matrix));
  const html = path.join(RUNS_DIR, 'report.html');
  await fs.writeFile(html, renderHtml(matrix, all, process.env.MODEL_NAME ?? 'gemma4:latest', 0));
  console.log(`\n可视化报告: ${path.relative(ROOT, html)}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  console.log('='.repeat(60));
  console.log('🔓 提示注入攻防实验（实验 2-5）');
  console.log('='.repeat(60));

  if (args.includes('--all')) {
    await cmdAll(args);
  } else if (args.includes('--report')) {
    await cmdReport();
  } else if (args.includes('--list')) {
    console.log('攻击场景:');
    ATTACKS.forEach((a, i) => console.log(`  ${i + 1}. ${a.label} (${a.name})`));
    console.log('防御配置:');
    DEFENSES.forEach((d, i) => console.log(`  ${i + 1}. ${d.label} (${d.name})`));
  } else {
    await cmdAll(args);
  }
}

main().catch((e) => {
  console.error(`❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});