/**
 * CLI 入口（对应官方 experiment.py）。
 *
 *   npm run experiment              # 6 策略对比表 + JSON + HTML
 *   npm run run -- --strategy context_aware
 *   npm run run -- --max-iterations 8 --window 6000
 *   npm run report                  # 离线汇总 runs/
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ResearchAgent, type RunResult } from './agent.js';
import { STRATEGIES, type StrategyName } from './compressor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(ROOT, 'runs');

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* 默认值 */
}

const TASK =
  'Find the current affiliations of all the OpenAI co-founders listed in the system prompt. Fetch pages and report each co-founder with their current role.';

function flagVal(args: string[], flag: string, def: string): string {
  const i = args.indexOf(flag);
  return i === -1 ? def : (args[i + 1] ?? def);
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function runOne(strategy: StrategyName, args: string[]): Promise<RunResult> {
  const model = process.env.MODEL_NAME ?? 'gemma4:latest';
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
  const window = Number(flagVal(args, '--window', process.env.CONTEXT_WINDOW_SIZE ?? '8000'));
  const maxLen = Number(process.env.MAX_WEBPAGE_LENGTH ?? '5000');
  const sumTok = Number(process.env.SUMMARY_MAX_TOKENS ?? '400');

  console.log(`\n── 策略: ${strategy}（预算 ${window} tok）──`);
  const agent = new ResearchAgent(
    { strategy, query: TASK, contextWindowTokens: window, summaryMaxTokens: sumTok, model, baseUrl },
    maxLen
  );
  const r = await agent.run();
  console.log(
    `  ${r.success ? '✅ 成功' : '❌ 失败'} · ${r.iterations} 轮 · tokens ${r.tokens} · 溢出 ${r.overflows} · 摘要调用 ${r.summaryCalls} · 压缩比 ${(r.compressionRatio * 100).toFixed(1)}%` +
    (r.error ? `\n  ${r.error}` : '') +
    (r.finalAnswer ? `\n  提到联创: ${r.cofoundersMentioned}/8` : '')
  );
  return r;
}

function renderTable(results: RunResult[]): string {
  const header =
    'Strategy              Succ  Iters  Tokens   Compress  Overflows  SumCalls  #Cofounders';
  const sep = '-'.repeat(header.length);
  const rows = results.map((r) => {
    const s = r.strategy.padEnd(20).slice(0, 20);
    return `${s} ${r.success ? '✓' : '✗'}   ${String(r.iterations).padStart(4)}   ${String(r.tokens).padStart(7)}   ${(r.compressionRatio * 100).toFixed(1).padStart(7)}%  ${String(r.overflows).padStart(8)}   ${String(r.summaryCalls).padStart(7)}   ${String(r.cofoundersMentioned).padStart(8)}`;
  });
  return [header, sep, ...rows].join('\n');
}

function renderHtml(results: RunResult[], window: number): string {
  const bars = results
    .map((r) => {
      const width = Math.max(1, (r.tokens / Math.max(...results.map((x) => x.tokens), 1)) * 300);
      return `<div class="row"><span class="mode">${esc(r.strategy)}</span>
        <span class="bar"><span class="fill" style="width:${width.toFixed(0)}px;background:${r.success ? '#4263eb' : '#c92a2a'}"></span></span>
        <span class="val">${r.tokens} tok</span><span class="stat">溢出${r.overflows} · 压缩${(r.compressionRatio * 100).toFixed(1)}% · 提到${r.cofoundersMentioned}/8</span></div>`;
    })
    .join('\n');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>实验 2-10 上下文压缩策略</title>
<style>
body{font-family:ui-monospace,Menlo,monospace;margin:24px;color:#222}
h1{font-size:17px}h2{font-size:13px;color:#555}
.row{display:flex;align-items:center;gap:8px;margin:5px 0;font-size:12px}
.mode{width:150px;text-align:right}.bar{display:inline-block}
.fill{display:block;height:16px;border-radius:3px}.val{width:80px;color:#888}
.stat{color:#666;font-size:11px}
.note{font-size:11px;color:#888;line-height:1.7}
</style></head><body>
<h1>实验 2-10 · 上下文压缩策略对比</h1>
<h2>模型 ${esc(process.env.MODEL_NAME ?? 'gemma4:latest')} · 预算 ${window} tok · 横条长度 = 累计 token</h2>
<div class="chart">${bars}</div>
<p class="note">no_compression 保留全部网页原文 → 超预算溢出失败；压缩策略保持体积 → 完成。
context_aware 通常 token 最省；windowed 保留最近全文、压缩更早历史。</p>
</body></html>`;
}

async function cmdExperiment(args: string[]): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const selected = flagVal(args, '--strategy', '');
  const strategies: StrategyName[] = selected
    ? STRATEGIES.filter((s) => selected.split(',').map((x) => x.trim()).includes(s))
    : STRATEGIES;

  const results: RunResult[] = [];
  for (const s of strategies) {
    results.push(await runOne(s, args));
  }

  console.log('\n📊 对比表:');
  console.log(renderTable(results));

  const outJson = path.join(RUNS_DIR, `experiment_${stamp()}.json`);
  await fs.writeFile(outJson, JSON.stringify(results, null, 2));
  const window = Number(flagVal(args, '--window', process.env.CONTEXT_WINDOW_SIZE ?? '8000'));
  const html = path.join(RUNS_DIR, 'report.html');
  await fs.writeFile(html, renderHtml(results, window));
  console.log(`\n已保存: ${path.relative(ROOT, outJson)}`);
  console.log(`可视化报告: ${path.relative(ROOT, html)}（浏览器打开）`);
}

async function cmdReport(): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const files = (await fs.readdir(RUNS_DIR)).filter((f) => /^experiment_.*\.json$/.test(f));
  if (!files.length) {
    console.log(`未找到 runs/experiment_*.json。先跑: npm run experiment`);
    return;
  }
  const all: RunResult[] = [];
  for (const f of files) {
    const data = JSON.parse(await fs.readFile(path.join(RUNS_DIR, f), 'utf8')) as RunResult[];
    all.push(...data);
  }
  console.log(renderTable(all));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  console.log('='.repeat(60));
  console.log('🧠 上下文压缩策略对比（实验 2-10）');
  console.log('='.repeat(60));

  if (args.includes('--report')) {
    await cmdReport();
  } else if (args.includes('--list-strategies')) {
    console.log(STRATEGIES.join('\n'));
  } else {
    await cmdExperiment(args);
  }
}

main().catch((e) => {
  console.error(`❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});