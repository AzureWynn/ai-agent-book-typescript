import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

// 与参考实现 create_sample_pdf.py 生成的文件同名、同内容
const SAMPLE_PDFS: { name: string; url: string }[] = [
  {
    name: 'simple_expense_report.pdf',
    url: 'https://raw.githubusercontent.com/bojieli/ai-agent-book/main/chapter1/context/fixtures/pdfs/simple_expense_report.pdf',
  },
  {
    name: 'sample_financial_report_q1_2024.pdf',
    url: 'https://raw.githubusercontent.com/bojieli/ai-agent-book/main/chapter1/context/fixtures/pdfs/sample_financial_report_q1_2024.pdf',
  },
];

const PDF_DIR = path.join('fixtures', 'pdfs');

/** 样例 PDF 是否都已就绪 */
export function samplePdfsReady(): boolean {
  return SAMPLE_PDFS.every((p) => fs.existsSync(path.join(PDF_DIR, p.name)));
}

/**
 * 下载样例 PDF 到 fixtures/pdfs/（对应参考实现的 create_pdfs 命令）。
 * 返回下载成功的文件名列表；网络失败时抛错由调用方捕获。
 */
export async function createSamplePdfs(): Promise<string[]> {
  await fsPromises.mkdir(PDF_DIR, { recursive: true });
  const created: string[] = [];
  for (const { name, url } of SAMPLE_PDFS) {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`下载 ${name} 失败: HTTP ${resp.status}`);
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    await fsPromises.writeFile(path.join(PDF_DIR, name), buffer);
    created.push(name);
  }
  return created;
}