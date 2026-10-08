// route_a_codegen.py 对应：模型写 CadQuery → 子进程执行导出 → 正则单点修补。
// measure.py 对应：包围盒 + 圆柱面核验（外径/厚度/孔数/孔径/孔位圆）。
import { execFile } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ollama } from 'ollama';
import 'dotenv/config';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

function sh(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((resolveP) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolveP({ code: err ? 1 : 0, out: (stdout + stderr).trim().slice(-3000) });
    });
  });
}

export async function generateCode(prompt: string): Promise<string> {
  const ollama = new Ollama({ host: BASE_URL });
  const chatOnce = async (content: string): Promise<string> => {
    const p = ollama.chat({
      model: MODEL,
      messages: [{ role: 'user', content }],
      options: { temperature: 0 },
    });
    const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ollama timeout')), CHAT_TIMEOUT_MS));
    return ((await Promise.race([p, timer])).message.content || '').trim();
  };
  let feedback = '';
  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const raw = await chatOnce(attempt === 1 ? prompt : `${prompt}\n\n上一轮代码执行报错如下，请修正后重发完整 \`\`\`python 代码块（只输出代码块）：\n${lastErr}`);
    const m = raw.match(/```python\s*\n([\s\S]*?)```/);
    if (!m) {
      lastErr = '没解析到 ```python 代码块';
      continue;
    }
    return (m[1] as string).trim();
  }
  throw new Error(`模型 3 次没返回可用代码块：${lastErr}`);
}

const DRIVER = `import sys, runpy
import cadquery as cq
src, step_path = sys.argv[1:3]
ns = runpy.run_path(src)
result = ns["result"]
cq.exporters.export(result, step_path)
print("exported", step_path)
`;

const MEASURE = `import sys, json, math
import runpy
import cadquery as cq
src = sys.argv[1]
ns = runpy.run_path(src)
result = ns["result"]
shape = result.val() if hasattr(result, "val") else result
bb = shape.BoundingBox()
od = max(bb.xmax - bb.xmin, bb.ymax - bb.ymin)
th = bb.zmax - bb.zmin
holes = []
for f in shape.Faces():
    g = f.geomType()
    if g == "CYLINDER":
        s = f._geomAdaptor()
        r = s.Radius()
        c = s.Location().Location() if hasattr(s.Location(), "Location") else s.Location()
        try:
            x, y, z = c.X(), c.Y(), c.Z()
        except Exception:
            x, y, z = 0, 0, 0
        holes.append({"r": r, "x": x, "y": y, "z": z})
inner = [h for h in holes if abs(h["r"] * 2 - 5.5) < 1.5 or abs(h["r"] * 2 - 6.5) < 1.5]
print(json.dumps({"od": round(od, 3), "th": round(th, 3), "zmin": round(bb.zmin, 3),
  "hole_cyl_faces": len(inner),
  "hole_dia": round(inner[0]["r"] * 2, 3) if inner else None,
  "hole_circle": round(max([math.hypot(h["x"], h["y"]) for h in inner]) * 2, 3) if inner else None}))
`;

export async function executeAndMeasure(root: string, srcFile: string, tag: string): Promise<{ measure: Record<string, number | null>; log: string }> {
  const cq = join(root, process.env.CQ_PYTHON || '.venv/bin/python');
  const src = join(root, 'work', srcFile);
  const driver = join(root, 'work', '_driver.py');
  const measure = join(root, 'work', '_measure.py');
  const step = join(root, 'work', `${tag}.step`);
  writeFileSync(driver, DRIVER);
  writeFileSync(measure, MEASURE);
  const ex = await sh(cq, [driver, src, step], root, 300_000);
  if (ex.code !== 0) throw new Error(`CadQuery 执行失败（看最后几行找 AttributeError/ValueError）：\n${ex.out.slice(-1200)}`);
  const ms = await sh(cq, [measure, src], root, 120_000);
  if (ms.code !== 0) throw new Error(`测量失败：${ms.out}`);
  const line = ms.out.split('\n').filter(Boolean).pop() as string;
  return { measure: JSON.parse(line) as Record<string, number | null>, log: ex.out.slice(-200) };
}

export function patchHoleDiameter(root: string, srcFile: string, dstFile: string, newDia: number): { old: string; lines: number } {
  const src = join(root, 'work', srcFile);
  const code = readFileSync(src, 'utf8');
  const re = /(hole_diameter["']?\s*:\s*)([\d.]+)/;
  const m = code.match(re);
  if (!m) throw new Error('找不到 PARAMS.hole_diameter，无法单点修补');
  writeFileSync(join(root, 'work', dstFile), code.replace(re, `$1${newDia}`));
  return { old: m[2] as string, lines: 1 };
}
