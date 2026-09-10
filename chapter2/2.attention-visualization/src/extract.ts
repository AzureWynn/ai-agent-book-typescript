/**
 * 调用 Python 提取器（py/extract_attention.py）拿注意力矩阵。
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface AttentionPayload {
  prompt: string;
  model: string;
  device: string;
  layer: number;
  head: number | string;
  num_layers: number;
  num_heads: number;
  context_length: number;
  seq_len: number;
  tokens: string[];
  attention_matrix: number[][];
}

export interface ExtractOptions {
  prompt: string;
  model?: string;
  device?: string;
  layer: number;
  head: number;
  maxNewTokens?: number;
  temperature?: number;
  noChatTemplate?: boolean;
}

export class ExtractError extends Error {}

function pyBin(projectRoot: string): string {
  const venv = path.join(projectRoot, '.venv', 'bin', 'python');
  return existsSync(venv) ? venv : 'python3';
}

/** 跑提取器，返回解析后的 JSON。 */
export async function extractAttention(
  projectRoot: string,
  opts: ExtractOptions
): Promise<AttentionPayload> {
  const model = opts.model ?? process.env.ATTENTION_MODEL ?? 'Qwen/Qwen3-0.6B';
  const device = opts.device ?? process.env.ATTENTION_DEVICE ?? '';
  const outJson = path.join(projectRoot, '.attention_tmp.json');

  const args = [
    path.join(projectRoot, 'py', 'extract_attention.py'),
    '--model', model,
    '--prompt', opts.prompt,
    '--layer', String(opts.layer),
    '--head', String(opts.head),
    '--output-json', outJson,
  ];
  if (device) args.push('--device', device);
  if (opts.maxNewTokens) args.push('--max-new-tokens', String(opts.maxNewTokens));
  if (opts.temperature !== undefined) args.push('--temperature', String(opts.temperature));
  if (opts.noChatTemplate) args.push('--no-chat-template');

  await new Promise<void>((resolve, reject) => {
    const py = pyBin(projectRoot);
    const child = spawn(py, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', (e) => reject(new ExtractError(`无法启动 Python（${py}）: ${e.message}。先运行 npm run setup 装依赖`)));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new ExtractError(`提取器退出码 ${code}`));
    });
  });

  const raw = await fs.readFile(outJson, 'utf8');
  await fs.rm(outJson, { force: true });
  return JSON.parse(raw) as AttentionPayload;
}