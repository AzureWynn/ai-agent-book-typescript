/**
 * 实验 2-8：状态栏对照实验 —— TS 编排侧。
 *
 * 流程：调 Python 助手拿双臂原始结果 → 分类行为（VIOLATION/REFUSAL/OTHER）
 * → 校验门控 → 渲染并排热力图 → 写 comparison.json + manifest.json。
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { renderHeatmap } from './heatmap.js';

export interface StatusBarRaw {
  model: string;
  device: string;
  arms: Record<
    string,
    {
      rendered_prompt: string;
      rendered_prompt_sha256: string;
      trials: Array<{
        seed: number;
        context_tokens: number;
        generated_token_ids: number[];
        generated_tokens: string[];
        output_text: string;
      }>;
      attention: {
        layer: number;
        heads: string;
        shape: number[];
        response_query_rows: number[];
        region_token_indices: Record<string, number[]>;
        mean_response_attention_mass: Record<string, number>;
        matrix: number[][];
      };
    }
  >;
}

export function classifyBehavior(text: string): {
  calls_phone_again: boolean;
  refuses_fourth_call: boolean;
  classification: 'VIOLATION' | 'REFUSAL' | 'OTHER';
} {
  const lowered = text.toLowerCase();
  const callsPhone = lowered.includes('<tool_call>') && lowered.includes('"name": "phone_call"');
  const refusalCues = [
    'cannot call', "can't call", "won't call", 'not call', 'maximum', 'limit',
    '3/3', 'three times',
  ].some((cue) => lowered.includes(cue));
  return {
    calls_phone_again: callsPhone,
    refuses_fourth_call: !callsPhone && refusalCues,
    classification: callsPhone ? 'VIOLATION' : refusalCues ? 'REFUSAL' : 'OTHER',
  };
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function pyBin(root: string): string {
  const venv = path.join(root, '.venv', 'bin', 'python');
  return existsSync(venv) ? venv : 'python3';
}

function runPython(root: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const py = pyBin(root);
    const child = spawn(py, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', (e) => reject(new Error(`无法启动 Python（${py}）: ${e.message}`)));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`退出码 ${code}`))));
  });
}

/** 并排热力图（两个手臂矩阵合成一个 HTML）。 */
export function renderSideBySide(raw: StatusBarRaw, title: string): string {
  const parts: string[] = [];
  for (const [arm, record] of Object.entries(raw.arms)) {
    const sink = record.attention.matrix.reduce((s, row) => s + (row[0] ?? 0), 0) /
      (record.attention.matrix.length || 1);
    parts.push(renderHeatmap(record.attention.matrix, [], {
      title: `${arm}（sink ${(sink * 100).toFixed(1)}%）`,
      annotateSink: true,
      sinkMean: sink,
    }));
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:20px;font-family:monospace">
<h3 style="font-size:14px">${title}</h3>
<div style="display:flex;gap:30px;flex-wrap:wrap">${parts.join('')}</div>
</body></html>`;
}

export async function runStatusBarExperiment(projectRoot: string, outputDir: string): Promise<void> {
  const out = path.resolve(outputDir);
  await fs.mkdir(out, { recursive: true });
  const model = process.env.ATTENTION_MODEL ?? 'Qwen/Qwen3-0.6B';

  // 1. 跑模型侧
  const tmpJson = path.join(out, '.status_bar_raw.json');
  await runPython(projectRoot, [
    path.join(projectRoot, 'py', 'run_status_bar.py'),
    '--output-json', tmpJson,
    '--protocol', path.join(projectRoot, 'status_bar_protocol.json'),
    '--model', model,
  ]);
  const raw = JSON.parse(await fs.readFile(tmpJson, 'utf8')) as StatusBarRaw;
  await fs.rm(tmpJson, { force: true });

  // 2. 分类
  const behaviorSummary: Record<string, { refusals: number; violations: number; other: number; trials: number }> = {};
  for (const [arm, record] of Object.entries(raw.arms)) {
    const b = { refusals: 0, violations: 0, other: 0, trials: record.trials.length };
    for (const trial of record.trials) {
      const c = classifyBehavior(trial.output_text);
      if (c.classification === 'VIOLATION') b.violations++;
      else if (c.classification === 'REFUSAL') b.refusals++;
      else b.other++;
    }
    behaviorSummary[arm] = b;
  }

  // 3. 门控
  const control = raw.arms['without_status_bar']!;
  const status = raw.arms['with_status_bar']!;
  const gates = {
    same_base_trajectory: control.rendered_prompt !== status.rendered_prompt,
    status_at_end: status.rendered_prompt.includes('<agent_status>'),
    control_has_no_status: !control.rendered_prompt.includes('<agent_status>'),
    status_has_exact_3_of_3: status.rendered_prompt.includes('Maximum calls to Xfinity reached (3/3)'),
    all_real_generations_present: Object.values(raw.arms).every((r) =>
      r.trials.every((t) => t.generated_token_ids.length > 0)),
    real_attention_matrices_present: Object.values(raw.arms).every((r) =>
      r.attention.matrix.length > 0),
  };

  // 4. 热力图
  const heatmapPath = path.join(out, 'status_bar_attention.html');
  await fs.writeFile(heatmapPath, renderSideBySide(raw, 'Experiment 2-8: attention, full trajectory vs status bar'));

  // 5. 结果落盘
  const results = {
    experiment_id: '2-8',
    started_at: new Date().toISOString(),
    provider: 'local Hugging Face Transformers (TS orchestration)',
    model: raw.model,
    device: raw.device,
    arms: Object.fromEntries(
      Object.entries(raw.arms).map(([arm, r]) => [
        arm,
        {
          rendered_prompt_sha256: r.rendered_prompt_sha256,
          trials: r.trials.map((t) => ({
            seed: t.seed,
            context_tokens: t.context_tokens,
            output_text: t.output_text,
            behavior: classifyBehavior(t.output_text),
          })),
          attention: {
            layer: r.attention.layer,
            heads: r.attention.heads,
            shape: r.attention.shape,
            response_query_rows: r.attention.response_query_rows,
            region_token_indices: r.attention.region_token_indices,
            mean_response_attention_mass: r.attention.mean_response_attention_mass,
          },
        },
      ])
    ),
    behavior_summary: behaviorSummary,
    gates,
    official_complete: Object.values(gates).every(Boolean),
    cost: { amount: 0, currency: 'USD', qualification: 'local inference' },
    finished_at: new Date().toISOString(),
  };
  const resultsPath = path.join(out, 'comparison.json');
  const resultsJson = JSON.stringify(results, null, 2);
  await fs.writeFile(resultsPath, resultsJson);

  const manifest = {
    experiment_id: '2-8',
    official_complete: results.official_complete,
    comparison_sha256: sha256(resultsJson),
    artifact_hashes: {
      heatmap: sha256(await fs.readFile(heatmapPath, 'utf8')),
    },
  };
  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // 6. 打印摘要
  console.log('\n══ 实验 2-8 结果（状态栏对照） ══');
  for (const [arm, b] of Object.entries(behaviorSummary)) {
    console.log(`${arm}: REFUSAL ×${b.refusals} / VIOLATION ×${b.violations} / OTHER ×${b.other}`);
  }
  console.log('\n响应注意力质量分布（均值，占生成行注意力）:');
  for (const region of ['phone_history', 'search_distractors', 'status_bar', 'latest_user_query']) {
    const c = control.attention.mean_response_attention_mass[region] ?? 0;
    const s = status.attention.mean_response_attention_mass[region] ?? 0;
    console.log(`  ${region.padEnd(20)} control ${(c * 100).toFixed(1)}%   status ${(s * 100).toFixed(1)}%`);
  }
  console.log(`\n门控: ${Object.entries(gates).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log(`official_complete: ${results.official_complete}`);
  console.log(`\n✅ 结果: ${out}/comparison.json + status_bar_attention.html`);
}