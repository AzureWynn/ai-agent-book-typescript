// demo：双臂全链；eval：单 vs 双对照（Vision 评分 + 上下文峰值 + 原图引用）。
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSlides, type Slide } from './slides.js';
import { runSingle, runDual, scoreSlide, type ArmResult } from './agents.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'demo';
const PAPER_TEXT = readFileSync(join(ROOT, 'paper/paper_text.txt'), 'utf8');

async function scoreArm(arm: ArmResult, tag: string, trace: boolean): Promise<{ avg: number; figs: number; pngs: string[] }> {
  while (arm.slides.length < 6) arm.slides.push({ title: '（空页）', bullets: [] });
  const outDir = join(ROOT, 'output', tag);
  mkdirSync(outDir, { recursive: true });
  const pngs = await renderSlides(ROOT, arm.slides.slice(0, 6), outDir);
  let sum = 0;
  let figs = 0;
  for (let i = 0; i < pngs.length; i++) {
    const wantFig = (arm.slides[i] as Slide).figure === 'fig1';
    if (wantFig) figs++;
    const s = await scoreSlide(pngs[i] as string, wantFig);
    sum += s.score;
    if (trace) console.log(`  slide${i + 1}: ${s.score}分 ${s.note}`);
  }
  return { avg: Math.round(sum / pngs.length), figs, pngs };
}

async function main() {
  if (mode === 'demo') {
    console.log('# 双臂：planner 大纲 + 逐页 builder\n');
    const arm = await runDual(PAPER_TEXT);
    console.log(`[调用] ${arm.calls} 次，总 prompt ${arm.promptChars} 字，峰值 ${arm.peakChars} 字`);
    const r = await scoreArm(arm, 'demo_dual', true);
    console.log(`\n平均 ${r.avg} 分，原图引用 ${r.figs} 页`);
  } else {
    console.log('\n臂      调用  总prompt字  峰值字   Vision均分  原图页\n--      ----  ---------  -------  ---------  ------');
    for (const [tag, fn] of [['eval_single', runSingle], ['eval_dual', runDual]] as const) {
      const arm = await fn(PAPER_TEXT);
      const r = await scoreArm(arm, tag, false);
      console.log(`${arm.arm}  ${arm.calls}次  ${arm.promptChars}  ${arm.peakChars}  ${r.avg}分  ${r.figs}页`);
    }
    console.log('\n（源论文 Attention Is All You Need，PDF 哈希 pin；正文截断前 8000 字；Slidev→matplotlib 渲染替代）');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
