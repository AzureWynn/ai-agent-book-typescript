/**
 * CLI 入口（对应官方 demo.py）。
 *
 *   npm run run -- --paper papers/sample_paper.md -o output/deck.pptx   # 在线（Ollama 驱动）
 *   npm run offline                                                     # 离线确定性演示
 *   npm run run -- --offline -o output/deck.pptx
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { SkillsAgent } from './agent.js';
import { scanSkillCatalog, renderCatalog } from './catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* 默认值 */
}

function pyBin(): string {
  const venv = path.join(ROOT, '.venv', 'bin', 'python');
  return existsSync(venv) ? venv : 'python3';
}

function runPy(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(pyBin(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    child.on('error', (e) => reject(new Error(`无法启动 python: ${e.message}`)));
    child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.slice(0, 300)))));
  });
}

/** 独立校验：用 python-pptx 重新打开生成的 pptx，读回页数与标题。 */
async function verifyPptx(pptxPath: string): Promise<{ num_slides: number; titles: string[] }> {
  const out = await runPy([path.join(ROOT, 'skills', 'pptx', 'scripts', 'verify_pptx.py'), pptxPath]);
  return JSON.parse(out) as { num_slides: number; titles: string[] };
}

async function printCatalog(): Promise<void> {
  const metas = await scanSkillCatalog(path.join(ROOT, 'skills'));
  console.log('【第一层·元数据】Agent 启动时只看到这份薄 Skill 目录（system prompt）：');
  console.log('== 已安装的 Skills（薄目录，仅元数据）==');
  console.log(renderCatalog(metas));
}

function buildTask(paperPath: string): Promise<string> {
  return fs.readFile(path.resolve(ROOT, paperPath), 'utf8').then((paper) => {
    return (
      '根据下面这篇论文，生成一份 8-12 页的 PowerPoint 演示文稿（.pptx 文件）。\n' +
      '使用可用的 Skill 完成此任务（先 read_skill 了解流程）。输出到 output/presentation.pptx。\n\n' +
      '==== 论文 ====\n' +
      paper.slice(0, 6000)
    );
  });
}

async function cmdOnline(paperPath: string, output: string): Promise<void> {
  await printCatalog();
  console.log('');
  const agent = new SkillsAgent(ROOT);
  const task = await buildTask(paperPath);
  console.log('模型开始渐进式披露...\n');

  const result = await agent.runAgentic(task);
  for (const c of result.calls) {
    console.log(`  → ${c.name}(${JSON.stringify(c.args).slice(0, 150)})`);
  }

  console.log('\n【校验】用 python-pptx 重新打开生成的文件：');
  const pptx = result.generatedPptx ?? path.resolve(ROOT, output);
  try {
    const v = await verifyPptx(pptx);
    console.log(`总页数: ${v.num_slides}`);
    v.titles.forEach((t, i) => console.log(`  第 ${String(i + 1).padStart(2)} 页标题: ${t}`));
    console.log(`\n校验通过：${pptx}`);
  } catch (e) {
    console.log(`❌ 校验失败: ${e instanceof Error ? e.message : e}`);
    console.log(`最后回答: ${result.finalAnswer.slice(0, 200)}`);
  }
}

async function cmdOffline(output: string): Promise<void> {
  await printCatalog();
  console.log('');
  const agent = new SkillsAgent(ROOT);
  const outline = await fs.readFile(path.join(ROOT, 'papers', 'sample_outline.json'), 'utf8');

  console.log('[离线模式] 走同一套工具通道（确定性）：read_skill → read_skill_file → run_skill_script\n');
  console.log('  → read_skill(pptx)');
  const l2 = await agent['readSkill']('pptx');
  console.log(`    ${l2.split('\n')[0]!}`);
  console.log('  → read_skill_file(pptx, reference.md)');
  const l3 = await agent['readSkillFile']('pptx', 'reference.md');
  console.log(`    ${l3.split('\n')[0]!}`);
  console.log(`  → run_skill_script(pptx, generate_pptx.py, outline=<${outline.length} 字符 JSON>, output=${output})`);
  const run = await agent['runScript']('pptx', 'generate_pptx.py', outline, output);
  console.log(`    ${run.slice(0, 120)}...`);

  const pptx = path.resolve(ROOT, output);
  const v = await verifyPptx(pptx);
  console.log('\n【校验】用 python-pptx 重新打开生成的文件：');
  console.log(`总页数: ${v.num_slides}`);
  v.titles.forEach((t, i) => console.log(`  第 ${String(i + 1).padStart(2)} 页标题: ${t}`));
  console.log(`\n校验通过：${pptx}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string, def: string) => {
    const i = args.indexOf(name);
    return i === -1 ? def : (args[i + 1] ?? def);
  };

  console.log('='.repeat(60));
  console.log('📊 Agent Skills · 渐进式披露生成 PPT（实验 2-6）');
  console.log('='.repeat(60));

  const output = flag('-o', flag('--output', 'output/presentation.pptx'));
  const offline = args.includes('--offline');
  if (offline) {
    await cmdOffline(output);
    return;
  }
  const paper = flag('--paper', 'papers/sample_paper.md');
  await cmdOnline(paper, output);
}

main().catch((e) => {
  console.error(`❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});