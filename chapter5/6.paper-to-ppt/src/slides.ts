// Slidev 的本地替代：matplotlib 幻灯片渲染器（官方 renderer.py 对应）。
// 页契约：6 页（标题/问题/方法/架构图/结果/总结），每页标题+≤4 要点，架构页必须引用原论文图。
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Slide {
  title: string;
  bullets: string[];
  figure?: string; // 'fig1' 引用原论文图
}

const RENDER_PY = `
import sys, json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image
spec_path, out_dir, fig1 = sys.argv[1:4]
slides = json.load(open(spec_path))["slides"]
import os, textwrap
os.makedirs(out_dir, exist_ok=True)
paths = []
for i, s in enumerate(slides):
    fig, ax = plt.subplots(figsize=(12.8, 7.2), dpi=100)
    fig.patch.set_facecolor("white")
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis("off")
    title = "\\n".join(textwrap.wrap(s["title"][:80], width=42))
    ax.text(6, 92, title, fontsize=24, fontweight="bold", va="top", ha="left")
    has_fig = bool(s.get("figure"))
    for j, b in enumerate(s.get("bullets", [])[:4]):
        wrapped = "\\n".join(textwrap.wrap(str(b)[:160], width=58))
        ax.text(8, 70 - j * 14, "• " + wrapped, fontsize=14, va="top", ha="left")
    if has_fig:
        im = Image.open(fig1)
        from matplotlib.offsetbox import OffsetImage, AnnotationBbox
        oi = OffsetImage(im, zoom=0.45)
        ab = AnnotationBbox(oi, (74, 42), frameon=True)
        ax.add_artist(ab)
        ax.text(74, 12, "Figure 1: Transformer (from PDF p.3)", fontsize=10, ha="center")
    p = os.path.join(out_dir, f"slide_{i + 1}.png")
    fig.savefig(p, bbox_inches="tight")
    plt.close(fig)
    paths.append(p)
print(json.dumps(paths))
`;

export function renderSlides(root: string, slides: Slide[], outDir: string): Promise<string[]> {
  const spec = join(outDir, 'slides.json');
  const script = join(outDir, '_render.py');
  writeFileSync(spec, JSON.stringify({ slides }));
  writeFileSync(script, RENDER_PY);
  const py = join(root, '.venv/bin/python');
  const fig1 = join(root, 'paper/fig1_transformer.png');
  return new Promise((resolveP, reject) => {
    execFile(py, [script, spec, outDir, fig1], { cwd: root, timeout: 120_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.slice(-800)));
      else {
        try {
          resolveP(JSON.parse(stdout.trim()) as string[]);
        } catch {
          reject(new Error('render output parse fail: ' + stdout.slice(-300)));
        }
      }
    });
  });
}
