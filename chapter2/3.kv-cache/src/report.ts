/**
 * 离线对比报告（对应官方 --report）：从已保存的 result_*.json 生成对比表。
 * 无需模型/API。附带生成零依赖 HTML 图表（SVG 条形图），浏览器直接打开。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { ModeResult } from './agent.js';

export interface ReportRow {
  mode: string;
  iters: number;
  first_ttft_ms: number;
  avg_ttft_ms: number;
  total_ms: number;
  prompt_tokens: number;
  cache_ratio_pct: number;
  bill_tokens: number;
  save_pct: number;
}

/** 从单个 ModeResult 汇总一行（成本示意：cache 按 --cache-price-ratio 计价）。 */
export function summarizeResult(r: ModeResult, cachePriceRatio = 0.1): ReportRow {
  const promptTokens = r.iterations.reduce((s, it) => s + it.prompt_tokens, 0);
  const completionTokens = r.completion_tokens;
  const cachedEst = promptTokens * r.cache_ratio_mean;
  // 可计费 token = 未命中部分全价 + 命中部分按 ratio 计价 + 生成全价
  const billTokens = (promptTokens - cachedEst) + cachedEst * cachePriceRatio + completionTokens;
  const baseline = promptTokens + completionTokens;
  const savePct = baseline > 0 ? (1 - billTokens / baseline) * 100 : 0;
  return {
    mode: r.mode,
    iters: r.iterations.length,
    first_ttft_ms: r.first_ttft_ms,
    avg_ttft_ms: r.avg_ttft_ms,
    total_ms: r.total_ms,
    prompt_tokens: promptTokens,
    cache_ratio_pct: r.cache_ratio_mean * 100,
    bill_tokens: Math.round(billTokens),
    save_pct: savePct,
  };
}

export function renderTable(rows: ReportRow[]): string {
  const header =
    'Mode             Iters  1st TTFT   Avg TTFT   Total(s)   Prompt    Cache%    Bill.Tok   Save%';
  const sep = '-'.repeat(header.length);
  const lines = rows.map((r) => {
    const mode = r.mode.padEnd(16).slice(0, 16);
    return (
      `${mode} ${String(r.iters).padStart(5)}  ` +
      `${(r.first_ttft_ms / 1000).toFixed(2).padStart(7)}s  ` +
      `${(r.avg_ttft_ms / 1000).toFixed(2).padStart(7)}s  ` +
      `${(r.total_ms / 1000).toFixed(2).padStart(7)}  ` +
      `${String(r.prompt_tokens).padStart(8)}  ` +
      `${r.cache_ratio_pct.toFixed(1).padStart(6)}%  ` +
      `${String(r.bill_tokens).padStart(9)}  ` +
      `${r.save_pct.toFixed(1).padStart(5)}%`
    );
  });
  return [header, sep, ...lines].join('\n');
}

export function printReport(results: ModeResult[], cachePriceRatio = 0.1): Promise<string | null> {
  console.log('\n📊 对比表（缓存命中 = prompt_eval_duration 下降幅度）');
  console.log(`   成本示意: 缓存 token 按正常价格的 ${cachePriceRatio} 计价`);
  console.log('');
  const rows = results.map((r) => summarizeResult(r, cachePriceRatio));
  console.log(renderTable(rows));
  console.log('');
  console.log('Cache% = 1 - 实际总求值时 / 无缓存全量重算基线估计（Ollama 用 prompt_eval_duration 作信号）。');
  console.log('Save% = 相对全量计费的示意节省。Bill.Tok 仅作成本示意，非厂商报价。');
  return writeHtmlReport(rows, results, cachePriceRatio);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 一条水平条形图（SVG）。值越大条越长，可选反转（如 total 时间越短越好）。 */
function barChart(
  label: string,
  items: Array<{ mode: string; value: number; hint: string }>,
  fmt: (v: number) => string,
  invert = false
): string {
  const max = Math.max(...items.map((i) => i.value), 1e-6);
  const rows = items
    .map((it) => {
      const w = Math.max(1, (it.value / max) * 300);
      const color = invert ? '#2f9e44' : '#4263eb';
      return `<div class="row"><span class="mode">${esc(it.mode)}</span>
        <span class="bar"><span class="fill" style="width:${w.toFixed(0)}px;background:${color}" title="${esc(it.hint)}"></span></span>
        <span class="val">${fmt(it.value)}</span></div>`;
    })
    .join('\n');
  return `<div class="chart"><h3>${esc(label)}</h3>${rows}</div>`;
}

/** 生成自包含 HTML 报告（对比表 + 条形图）。返回写入路径；runs 目录不存在则返回 null。 */
export async function writeHtmlReport(
  rows: ReportRow[],
  results: ModeResult[],
  cachePriceRatio: number
): Promise<string | null> {
  if (!results.length) return null;
  const runsDir = path.resolve(process.cwd(), 'runs');
  const outPath = path.join(runsDir, 'report.html');
  await fs.mkdir(runsDir, { recursive: true });

  const table = renderTable(rows).split('\n').map((l) => esc(l)).join('<br>');
  const items = rows.map((r) => ({ mode: r.mode, value: r.cache_ratio_pct, hint: `Cache% ${r.cache_ratio_pct.toFixed(1)}` }));
  const itemsTotal = rows.map((r) => ({ mode: r.mode, value: r.total_ms / 1000, hint: `Total ${(r.total_ms / 1000).toFixed(2)}s` }));
  const itemsTTFT = rows.map((r) => ({ mode: r.mode, value: r.avg_ttft_ms / 1000, hint: `Avg TTFT ${(r.avg_ttft_ms / 1000).toFixed(2)}s` }));

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>KV Cache 实验 2-3 · 六模式对比</title>
<style>
  body { font-family: ui-monospace, Menlo, monospace; margin: 24px; color: #222; }
  h1 { font-size: 17px; } h2 { font-size: 14px; color: #555; }
  .charts { display: flex; flex-wrap: wrap; gap: 28px; }
  .chart h3 { font-size: 12px; margin: 6px 0; color: #444; }
  .row { display: flex; align-items: center; gap: 8px; margin: 5px 0; font-size: 12px; }
  .mode { width: 130px; text-align: right; color: #333; }
  .bar { display: inline-block; }
  .fill { display: block; height: 16px; border-radius: 3px; }
  .val { width: 70px; color: #888; }
  table { border-collapse: collapse; font-size: 12px; margin: 14px 0; }
  td, th { border: 1px solid #ddd; padding: 4px 10px; }
  th { background: #f4f4f4; }
  .note { font-size: 11px; color: #888; line-height: 1.7; }
</style></head><body>
<h1>KV Cache 实验 2-3 · 六种上下文管理模式对比</h1>
<h2>模型 ${esc(results[0]!.model)} · 成本示意: 缓存 token = 正常价格 × ${cachePriceRatio}</h2>
<div class="charts">
  ${barChart('缓存命中比例 Cache%（越高越好）', items, (v) => v.toFixed(1) + '%')}
  ${barChart('总时长 Total(s)（越低越好）', itemsTotal, (v) => v.toFixed(2) + 's', true)}
  ${barChart('平均 TTFT (s)（越低越好）', itemsTTFT, (v) => v.toFixed(2) + 's', true)}
</div>
<pre style="font-size:12px">${table}</pre>
<p class="note">
Cache% = 1 - 实际总求值时 / 无缓存全量重算基线估计（Ollama 用 prompt_eval_duration 作信号）。
总时长越低越好；Cache% 越高越好。sliding_window 可能 Cache% 高但总时长最长——截断上下文反而更慢。
Bill.Tok / Save% 仅作成本示意（缓存 token 按 ${cachePriceRatio}× 计价），非厂商报价。
</p>
</body></html>`;
  await fs.writeFile(outPath, html);
  console.log(`\n📈 可视化报告已生成: ${path.relative(process.cwd(), outPath)}（浏览器打开）`);
  return outPath;
}