/**
 * 工作流路线编排 —— 对应官方 pipeline.py 的 run_workflow_route。
 *
 * 执行路径是代码写死的：先改写，后生图。
 * 每次节点调用都产生一条记录（模型、输入、输出），便于对照分析。
 */

import { rewritePrompt, type RewriteOutput } from './rewriter.js';
import { createImageGenerator, type ImageGenerator, type GeneratedImage } from './image-generator.js';

export interface NodeRecord {
  node: string;
  model: string;
  input?: unknown;
  output?: unknown;
  error?: string;
}

export interface WorkflowResult {
  requirement: string;
  rewrite: RewriteOutput;
  image: GeneratedImage;
  nodes: NodeRecord[];
  ok: boolean;
}

export interface PipelineOptions {
  generator?: ImageGenerator;
  /** 生图器类型（默认 placeholder） */
  generatorKind?: string;
}

export async function runWorkflowRoute(
  requirement: string,
  options: PipelineOptions = {}
): Promise<WorkflowResult> {
  const generator = options.generator ?? createImageGenerator(options.generatorKind ?? 'placeholder');
  const nodes: NodeRecord[] = [];

  // ── 节点 1：提示词改写 ──
  let rewrite: RewriteOutput;
  try {
    rewrite = await rewritePrompt(requirement);
    nodes.push({
      node: 'rewrite',
      model: process.env.MODEL_NAME ?? 'gemma4:latest',
      input: requirement,
      output: rewrite,
    });
  } catch (e) {
    nodes.push({
      node: 'rewrite',
      model: process.env.MODEL_NAME ?? 'gemma4:latest',
      input: requirement,
      error: e instanceof Error ? e.message : String(e),
    });
    return { requirement, rewrite: { prompt: '', negative_prompt: '', style_notes: '' }, image: { ok: false, path: '', actualPrompt: '', model: '' }, nodes, ok: false };
  }

  // ── 节点 2：文生图 ──
  let image: GeneratedImage;
  try {
    image = await generator.generate(rewrite.prompt, rewrite.negative_prompt);
    nodes.push({
      node: 'image_generation',
      model: generator.name,
      input: { prompt: rewrite.prompt, negative_prompt: rewrite.negative_prompt },
      output: image,
    });
  } catch (e) {
    nodes.push({
      node: 'image_generation',
      model: generator.name,
      input: { prompt: rewrite.prompt, negative_prompt: rewrite.negative_prompt },
      error: e instanceof Error ? e.message : String(e),
    });
    return { requirement, rewrite, image: { ok: false, path: '', actualPrompt: '', model: generator.name }, nodes, ok: false };
  }

  return { requirement, rewrite, image, nodes, ok: image.ok };
}