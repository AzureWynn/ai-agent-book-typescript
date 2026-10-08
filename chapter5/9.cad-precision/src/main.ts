// demo：M5 建模→测量；eval：M5 建模→测量→M5→M6 单点修补→重测→漂移表。
// B臂（diffusion）本地无 HF Space，引用官方结论，不跑。
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEC_M5, SPEC_M6, UNCHANGED_KEYS, CODEGEN_PROMPT, CHANGE_REQUEST_TEXT } from './spec.js';
import { generateCode, executeAndMeasure, patchHoleDiameter } from './cad.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'demo';

type M = Record<string, number | null>;

function check(m: M, spec: typeof SPEC_M5): { name: string; pass: boolean; detail: string }[] {
  const eq = (a: number | null, b: number): boolean => a !== null && Math.abs(a - b) < 0.01;
  return [
    { name: '外径80', pass: eq(m.od ?? null, spec.outer_diameter_mm), detail: `测得 ${m.od}` },
    { name: '厚度10', pass: eq(m.th ?? null, spec.thickness_mm), detail: `测得 ${m.th}` },
    { name: '底面z=0', pass: eq(m.zmin ?? null, 0), detail: `测得 ${m.zmin}` },
    { name: '4个通孔', pass: (m.hole_cyl_faces ?? 0) >= 4, detail: `圆柱面 ${m.hole_cyl_faces}` },
    { name: '孔径', pass: eq(m.hole_dia ?? null, spec.hole_diameter_mm), detail: `测得 ${m.hole_dia}（期望${spec.hole_diameter_mm}）` },
    { name: '孔位圆60', pass: eq(m.hole_circle ?? null, spec.hole_circle_diameter_mm), detail: `测得 ${m.hole_circle}` },
  ];
}

async function buildWithFix(): Promise<{ measure: M; attempts: number }> {
  let lastErr = '';
  for (let a = 1; a <= 3; a++) {
    const prompt = a === 1 ? CODEGEN_PROMPT : `${CODEGEN_PROMPT}\n\n上一轮代码执行报错如下，只修 bug 不改规格，重发完整 \`\`\`python 代码块：\n${lastErr}`;
    const code = await generateCode(prompt);
    writeFileSync(join(ROOT, 'work', 'flange_m5.py'), code);
    try {
      const { measure } = await executeAndMeasure(ROOT, 'flange_m5.py', 'flange_m5');
      return { measure, attempts: a };
    } catch (e) {
      lastErr = (e as Error).message.slice(0, 1500);
      console.log(`[fix${a}] ${(e as Error).message.slice(0, 150)}`);
    }
  }
  throw new Error(`3 次仍未建成：${lastErr.slice(0, 300)}`);
}

async function main() {
  if (mode === 'demo') {
    console.log('# 路线A：模型写 CadQuery → 执行 → 测量\n');
    const { measure, attempts } = await buildWithFix();
    console.log(`[建成] 第 ${attempts} 次尝试`);
    for (const c of check(measure, SPEC_M5)) console.log(`${c.pass ? '✓' : '✗'} ${c.name}: ${c.detail}`);
  } else {
    const { measure: m5, attempts } = await buildWithFix();
    const c5 = check(m5, SPEC_M5);
    console.log('M5 建模：' + c5.filter((c) => c.pass).length + '/6 通过');
    console.log(`\n变更请求：${CHANGE_REQUEST_TEXT}`);
    const patch = patchHoleDiameter(ROOT, 'flange_m5.py', 'flange_m6.py', SPEC_M6.hole_diameter_mm);
    console.log(`单点修补：${patch.old}→6.5，改 ${patch.lines} 行，LLM 调用 0 次`);
    const m6 = (await executeAndMeasure(ROOT, 'flange_m6.py', 'flange_m6')).measure;
    const c6 = check(m6, SPEC_M6);
    console.log('M6 建模：' + c6.filter((c) => c.pass).length + '/6 通过');
    console.log('\n漂移检查（应全 0）：');
    const pairs: [string, number | null, number | null][] = [
      ['外径', m5.od ?? null, m6.od ?? null],
      ['厚度', m5.th ?? null, m6.th ?? null],
      ['孔数', m5.hole_cyl_faces ?? null, m6.hole_cyl_faces ?? null],
      ['孔位圆', m5.hole_circle ?? null, m6.hole_circle ?? null],
    ];
    for (const [k, a, b] of pairs) {
      const d = a !== null && b !== null ? Math.abs(a - b) : NaN;
      console.log(`  ${k}: ${a} → ${b}  漂移 ${Number.isNaN(d) ? '?' : d.toFixed(3)} ${d === 0 ? '✓' : '✗'}`);
    }
    console.log(`孔径：${m5.hole_dia} → ${m6.hole_dia}（期望 5.5→6.5）`);
    console.log('\nB臂（diffusion/Hunyuan3D）：本地无 HF Space 未跑，引用官方：4 通孔全丢、外径偏差−99.4%、M6 变更整体重跑且外径漂移+283%。');
    void UNCHANGED_KEYS;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
