/**
 * 轨迹生成（对应官方 agent.py 的 demonstrate_attention_tracking + save_trajectory）。
 *
 * 为 5 类测试问题各生成一条轨迹：真实跑模型 + 续写，捕获整段序列的注意力矩阵，
 * 存到 frontend/data/trajectories/ 并维护 manifest（保留最近 50 条）。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { extractAttention } from './extract.js';

export interface TestPrompt {
  category: string;
  prompt: string;
}

export const TEST_PROMPTS: TestPrompt[] = [
  { category: 'Knowledge', prompt: 'What is the capital of France?' },
  { category: 'Math', prompt: 'Calculate 25 * 4 + 10' },
  { category: 'Creative', prompt: 'Write a haiku about spring' },
  { category: 'Reasoning', prompt: 'If all cats are animals, and some animals are pets, can we conclude that all cats are pets?' },
  { category: 'Code', prompt: 'Write a Python function to calculate factorial' },
];

function stamp(): { file: string; iso: string } {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  const file = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return { file, iso: d.toISOString().slice(0, 19).replace('T', ' ') };
}

export async function generateTrajectories(projectRoot: string): Promise<string[]> {
  const dir = path.join(projectRoot, 'frontend', 'data', 'trajectories');
  await fs.mkdir(dir, { recursive: true });

  const manifestPath = path.join(dir, 'manifest.json');
  let manifest: Array<Record<string, string>> = [];
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Array<Record<string, string>>;
  } catch {
    /* 首次运行 */
  }

  const saved: string[] = [];
  for (const t of TEST_PROMPTS) {
    console.log(`\n── ${t.category}: ${t.prompt}`);
    // 续写 20 个 token，让轨迹包含 prompt + 生成两段
    const payload = await extractAttention(projectRoot, {
      prompt: t.prompt,
      layer: -1,
      head: -1,
      maxNewTokens: 20,
    });

    const { file, iso } = stamp();
    const filename = `trajectory_${file}.json`;
    const trajectory = {
      id: file,
      timestamp: iso,
      test_case: {
        category: t.category,
        query: t.prompt,
        description: `Agent trajectory from ${iso}`,
      },
      response: payload.tokens.slice(payload.context_length).join(''),
      tokens: payload.tokens,
      attention_data: {
        tokens: payload.tokens,
        attention_matrix: payload.attention_matrix,
        num_layers: payload.num_layers,
        num_heads: payload.num_heads,
        context_length: payload.context_length,
      },
      metadata: {
        model: payload.model,
        device: payload.device,
        layer: payload.layer,
        attention_type: 'full_sequence',
      },
    };
    await fs.writeFile(path.join(dir, filename), JSON.stringify(trajectory, null, 2));
    saved.push(filename);

    manifest.push({ filename, id: file, timestamp: iso, category: t.category, query: t.prompt });
    manifest = manifest.slice(-50);
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n✅ ${saved.length} 条轨迹已保存到 frontend/data/trajectories/`);
  return saved;
}