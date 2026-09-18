/**
 * CLI 入口（对应官方 attention_cli.py + agent.py 的合并入口）。
 *
 *   npm run heatmap                        # 默认提示词热力图（最后一层，头平均）
 *   npm run heatmap -- --prompt "..." --layer 0 --head 3 --output out.html
 *   npm run heatmap -- --max-new-tokens 40
 *   npm run heatmap -- --compare-layers 0 -1 --output compare.html
 *   npm run trajectories                   # 生成 5 条轨迹给前端
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractAttention } from './extract.js';
import { attentionSinkStats, causalViolations, rowEntropies, positionalSinkStats } from './stats.js';
import { writeHeatmap, renderAscii } from './heatmap.js';
import { generateTrajectories } from './trajectory.js';
import { runStatusBarExperiment } from './status-bar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_PROMPT = '北京 的 天气 怎么样';

interface HeatmapArgs {
  prompt: string;
  layer: number;
  head: number;
  maxNewTokens: number;
  temperature: number;
  noChatTemplate: boolean;
  output: string;
  compareLayers: number[] | null;
}

function parseHeatmapArgs(argv: string[]): HeatmapArgs {
  const a: HeatmapArgs = {
    prompt: DEFAULT_PROMPT,
    layer: -1,
    head: -1,
    maxNewTokens: 0,
    temperature: 0.7,
    noChatTemplate: false,
    output: 'attention_heatmap.html',
    compareLayers: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    const next = () => argv[++i]!;
    switch (k) {
      case '--prompt': case '-p': a.prompt = next(); break;
      case '--layer': case '-l': a.layer = Number(next()); break;
      case '--head': a.head = Number(next()); break;
      case '--max-new-tokens': a.maxNewTokens = Number(next()); break;
      case '--temperature': a.temperature = Number(next()); break;
      case '--output': case '-o': a.output = next(); break;
      case '--compare-layers': {
        a.compareLayers = [];
        while (i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) a.compareLayers.push(Number(argv[++i]!));
        break;
      }
      case '--no-chat-template': a.noChatTemplate = true; break;
      case '--model': next(); break; // 模型默认取 .env
      default: if (!k.startsWith('--')) a.prompt = k;
    }
  }
  return a;
}

function printStats(matrix: number[][], label: string): void {
  const sink = attentionSinkStats(matrix);
  const causal = causalViolations(matrix);
  const ent = rowEntropies(matrix);
  const pos = positionalSinkStats(matrix);
  console.log(`\n── ${label} ──`);
  console.log(`attention sink（首 token 占每行注意力比例）: mean ${(sink.mean_sink_share * 100).toFixed(1)}%, max ${(sink.max_sink_share * 100).toFixed(1)}%`);
  console.log(`因果三角校验: 上三角非零 ${causal.upper_nonzero} 处, 最大 ${causal.max_upper.toExponential(2)} → ${causal.pass ? '✅ 通过' : '⚠️ 违规'}`);
  console.log(`行熵: mean ${(ent.reduce((s, v) => s + v, 0) / (ent.length || 1)).toFixed(2)} bit, min ${Math.min(...ent).toFixed(2)} bit`);
  console.log(`按位置 sink: 开头 ${(pos.beginning * 100).toFixed(1)}% / 中间 ${(pos.middle * 100).toFixed(1)}% / 结尾 ${(pos.end * 100).toFixed(1)}%`);
}

async function cmdHeatmap(argv: string[]): Promise<void> {
  const a = parseHeatmapArgs(argv);
  const model = process.env.ATTENTION_MODEL ?? 'Qwen/Qwen3-0.6B';

  if (a.compareLayers) {
    // 多层层对比：逐层提取并输出统计，分别保存单层图
    for (let i = 0; i < a.compareLayers.length; i++) {
      const layer = a.compareLayers[i]!;
      const payload = await extractAttention(ROOT, {
        prompt: a.prompt,
        model,
        layer,
        head: a.head,
        maxNewTokens: a.maxNewTokens,
        temperature: a.temperature,
        noChatTemplate: a.noChatTemplate,
      });
      const headDesc = payload.head === 'avg' ? 'avg heads' : `head ${payload.head}`;
      const title = `Layer ${payload.layer} (${headDesc}) - '${a.prompt.slice(0, 40)}'`;
      const out = a.output.replace(/\.(html|svg)$/, `_${i}.$1`);
      const html = writeHeatmap(payload.attention_matrix, payload.tokens, {
        title,
        contextBoundary: a.maxNewTokens > 0 ? payload.context_length : undefined,
        annotateSink: true,
        sinkMean: attentionSinkStats(payload.attention_matrix).mean_sink_share,
      }, out);
      await fs.promises.writeFile(out, html);
      printStats(payload.attention_matrix, `layer ${payload.layer} (${headDesc})`);
      console.log(`saved ${out}`);
    }
    return;
  }

  const payload = await extractAttention(ROOT, {
    prompt: a.prompt,
    model,
    layer: a.layer,
    head: a.head,
    maxNewTokens: a.maxNewTokens,
    temperature: a.temperature,
    noChatTemplate: a.noChatTemplate,
  });

  const sink = attentionSinkStats(payload.attention_matrix);
  const headDesc = payload.head === 'avg' ? 'avg heads' : `head ${payload.head}`;
  const html = writeHeatmap(
    payload.attention_matrix,
    payload.tokens,
    {
      title: `Layer ${payload.layer} (${headDesc}) - '${a.prompt.slice(0, 40)}'`,
      contextBoundary: a.maxNewTokens > 0 ? payload.context_length : undefined,
      annotateSink: true,
      sinkMean: sink.mean_sink_share,
      sinkMax: sink.max_sink_share,
    },
    a.output
  );
  await fs.promises.writeFile(a.output, html);
  console.log(`\n序列: ${payload.seq_len} tokens（prompt ${payload.context_length} + 生成 ${payload.seq_len - payload.context_length}）`);

  printStats(payload.attention_matrix, `Layer ${payload.layer} (${headDesc})`);
  console.log('\nASCII 预览（左上角深色 = attention sink）:');
  console.log(renderAscii(payload.attention_matrix));
  console.log(`\n✅ 热力图已保存到 ${a.output}`);
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'heatmap';
  const rest = process.argv.slice(3);

  console.log('='.repeat(60));
  console.log('🎯 Attention Visualization（实验 2-2）');
  console.log('='.repeat(60));

  if (cmd === 'heatmap') {
    await cmdHeatmap(rest);
  } else if (cmd === 'trajectories') {
    await generateTrajectories(ROOT);
    console.log('\n启动前端查看: npm run frontend  →  http://localhost:5174');
  } else if (cmd === 'statusbar') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await runStatusBarExperiment(ROOT, `runs/exp2-8-${stamp}`);
  } else {
    console.log('用法:');
    console.log('  npm run heatmap [--prompt "..." --layer N --head N --max-new-tokens N --compare-layers 0 -1]');
    console.log('  npm run trajectories');
    console.log('  npm run statusbar   # 实验 2-8：状态栏对照');
  }
}

main().catch((e) => {
  console.error(`❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});