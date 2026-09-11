/**
 * CLI 入口（对应官方 main.py）。
 *
 *   npm run run -- --mode correct
 *   npm run compare                       # 依次跑全部 6 种模式并对比
 *   npm run report                        # 离线对比（读 result_*.json，无需模型）
 *   npm run run -- --mode correct --task "..." --root-dir ../..
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { KVCacheAgent, MODES, type Mode, type ModeResult } from './agent.js';
import { printReport } from './report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(ROOT, 'runs');

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* 默认值 */
}

const DEFAULT_TASK =
  'Find the .ts files in this project, read src/agent.ts and src/tools.ts, ' +
  'then summarize what this project does in 3 sentences.';

interface CliArgs {
  mode?: Mode;
  compare: boolean;
  report: boolean;
  input: string[];
  task: string;
  rootDir: string;
  output?: string;
  cachePriceRatio: number;
}

function parseArgs(argv: string[]): CliArgs {
  const a: CliArgs = {
    compare: false,
    report: false,
    input: [],
    task: DEFAULT_TASK,
    rootDir: ROOT,
    cachePriceRatio: 0.1,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    switch (k) {
      case '--mode':
        a.mode = argv[++i] as Mode;
        break;
      case '--compare':
        a.compare = true;
        break;
      case '--report':
        a.report = true;
        break;
      case '--input':
        while (i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) a.input.push(argv[++i]!);
        break;
      case '--task':
        a.task = argv[++i]!;
        break;
      case '--root-dir':
        a.rootDir = path.resolve(ROOT, argv[++i]!);
        break;
      case '--output':
        a.output = argv[++i]!;
        break;
      case '--cache-price-ratio':
        a.cachePriceRatio = Number(argv[++i]);
        break;
      case '--no-interactive':
        break;
    }
  }
  return a;
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function printMetrics(r: ModeResult): void {
  const fmt = (ms: number) => (ms / 1000).toFixed(2);
  console.log(`\n── 模式 ${r.mode} ──`);
  console.log(`  TTFT（首 token 延迟）: 首次 ${fmt(r.first_ttft_ms)}s, 之后平均 ${fmt(r.avg_ttft_ms)}s, 改善 ${r.improvement_pct.toFixed(1)}%`);
  console.log('  每轮:');
  for (const it of r.iterations) {
    console.log(
      `    Iteration ${it.iteration}: TTFT ${fmt(it.ttft_ms)}s  prompt ${it.prompt_tokens} tok  ` +
      `eval ${it.eval_dur_ms.toFixed(0)}ms` +
      (it.tool_calls.length ? `  tools: ${it.tool_calls.join(', ')}` : '  → 最终答案')
    );
  }
  console.log(`  总时间: ${(r.total_ms / 1000).toFixed(2)}s · 缓存命中比例: ${(r.cache_ratio_mean * 100).toFixed(1)}%`);
}

async function runMode(mode: Mode, args: CliArgs): Promise<ModeResult> {
  console.log(`\n运行模式 ${mode}...`);
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const agent = new KVCacheAgent(mode, args.rootDir);
  const result = await agent.run(args.task);
  printMetrics(result);

  const outFile = args.output ?? path.join(RUNS_DIR, `result_${mode}_${stamp()}.json`);
  await fs.writeFile(outFile, JSON.stringify(result, null, 2));
  console.log(`已保存 ${path.relative(ROOT, outFile)}`);
  return result;
}

async function collectGlob(pattern: string): Promise<string[]> {
  const out: string[] = [];
  for await (const f of fs.glob(pattern)) out.push(String(f));
  return out;
}

async function cmdReport(args: CliArgs): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const files: string[] = [];
  if (args.input.length) {
    for (const p of args.input) {
      const abs = path.resolve(ROOT, p);
      if (abs.includes('*')) {
        files.push(...(await collectGlob(abs)).filter((f) => /result_.*\.json$/.test(f)));
        continue;
      }
      try {
        const stat = await fs.stat(abs);
        if (stat.isDirectory()) {
          for (const f of await fs.readdir(abs)) if (/^result_.*\.json$/.test(f)) files.push(path.join(abs, f));
        } else {
          files.push(abs);
        }
      } catch {
        /* 忽略不存在的文件 */
      }
    }
  } else {
    files.push(...(await fs.readdir(RUNS_DIR))
      .filter((f) => /^result_.*\.json$/.test(f))
      .map((f) => path.join(RUNS_DIR, f)));
  }

  if (!files.length) {
    console.log(`未找到 result_*.json（默认扫 ${RUNS_DIR}）。先跑: npm run compare`);
    return;
  }
  // 按模式去重，保留最新一份（同一模式多次运行只显示最近结果）
  const parsed: Array<{ file: string; result: ModeResult }> = [];
  for (const f of files) {
    try {
      parsed.push({ file: f, result: JSON.parse(await fs.readFile(f, 'utf8')) as ModeResult });
    } catch (e) {
      console.log(`⚠️  跳过无法解析的 ${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
  const byMode = new Map<string, { file: string; result: ModeResult }>();
  for (const p of parsed) {
    const old = byMode.get(p.result.mode);
    if (!old) byMode.set(p.result.mode, p);
    else {
      // 文件名带时间戳，按文件名排序取最新
      const aTs = path.basename(old.file).match(/(\d{4}-\d{2}-\d{2}T[\d-]+)/)?.[0] ?? '';
      const bTs = path.basename(p.file).match(/(\d{4}-\d{2}-\d{2}T[\d-]+)/)?.[0] ?? '';
      if (bTs > aTs) byMode.set(p.result.mode, p);
    }
  }
  const results: ModeResult[] = [...byMode.values()].map((p) => p.result);
  printReport(results, args.cachePriceRatio);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log('='.repeat(60));
  console.log('🔑 KV Cache 演示（实验 2-3）');
  console.log('='.repeat(60));
  console.log(`模型: ${process.env.MODEL_NAME ?? 'gemma4:latest'} · root: ${args.rootDir}`);

  if (args.report) {
    await cmdReport(args);
    return;
  }

  if (args.compare) {
    await fs.mkdir(RUNS_DIR, { recursive: true });
    const results: ModeResult[] = [];
    for (const mode of MODES) results.push(await runMode(mode, args));
    const compareFile = path.join(RUNS_DIR, `comparison_${stamp()}.json`);
    await fs.writeFile(compareFile, JSON.stringify(results, null, 2));
    console.log(`\n已保存 ${path.relative(ROOT, compareFile)}`);
    printReport(results, args.cachePriceRatio);
    return;
  }

  if (args.mode) {
    await runMode(args.mode, args);
    return;
  }

  console.log('用法:');
  console.log('  npm run run -- --mode correct          # 单模式');
  console.log('  npm run run -- --mode sliding_window');
  console.log('  npm run compare                         # 全部 6 模式 + 对比表 + 图表');
  console.log('  npm run report                          # 离线对比（读 runs/ 下 result_*.json）');
  console.log('  --task "..." --root-dir ../.. --cache-price-ratio 0.5   # 可选参数');
  console.log(`结果 JSON 统一保存在 ${path.relative(ROOT, RUNS_DIR)}/；report 会顺带生成可视化图表 HTML。`);
}

main().catch((e) => {
  console.error(`❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});