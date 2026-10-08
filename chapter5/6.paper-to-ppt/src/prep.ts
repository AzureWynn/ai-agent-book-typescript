// prep.ts：论文准备可复现脚本（下载→哈希 pin→抽文本→裁 Figure 1，官方 paper_source.py 对应）。
// PDF 与裁图 git 忽略，`npm run prep` 一键重建。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const PY = `${ROOT}/.venv/bin/python`;
const PIN = 'bdfaa68d8984f0dc02beaca527b76f207d99b666d31d1da728ee0728182df697';

const SCRIPT = `
import hashlib, urllib.request
import fitz
pdf = "paper/1706.03762.pdf"
if True:
    import os
    if not os.path.exists(pdf):
        req = urllib.request.Request("https://arxiv.org/pdf/1706.03762", headers={"User-Agent": "ai-agent-book/5-6"})
        open(pdf, "wb").write(urllib.request.urlopen(req, timeout=120).read())
h = hashlib.sha256(open(pdf, "rb").read()).hexdigest()
assert h == "${PIN}", f"PDF hash mismatch: {h}"
doc = fitz.open(pdf)
open("paper/paper_text.txt", "w").write("\\n".join(p.get_text("text") for p in doc))
page = doc[2]
page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=fitz.Rect(92, 60, 520, 405), alpha=False).save("paper/fig1_transformer.png")
print("prep ok, pages:", len(doc))
`;

if (!existsSync(`${ROOT}/paper/paper_text.txt`) || !existsSync(`${ROOT}/paper/fig1_transformer.png`)) {
  execFileSync(PY, ['-c', SCRIPT], { cwd: ROOT, stdio: 'inherit', timeout: 300_000 });
} else {
  console.log('paper materials already present (hash-pinned PDF + fig1).');
}
