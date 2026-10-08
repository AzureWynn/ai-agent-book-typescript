// customize：官方 agent.py 的本地教学版。
// 差异：Ollama 直连 + 文本协议（```file:path 整文件改写块），单次调用、
// 失败最多重试 2 次（结构化回灌）。写盘与验证在 tasks/main 里做。
import { Ollama } from 'ollama';
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

export const EDITABLE_FILES = ['src/App.jsx', 'src/theme.css'];

const SYSTEM_PROMPT = `你是前端界面定制 Agent，把用户的自然语言 UI 需求落到 React(Vite) 源码上。
规则：
1. 只能改写这两份文件：src/App.jsx、src/theme.css。不新增、不删除文件。
2. 最小改动：颜色/字体/间距改 theme.css；文案/结构改 App.jsx。
3. 颜色用明确色值（用户给了就用用户的）。JSX/CSS 语法必须正确，不破坏原有功能。
4. 你有手，自己输出改写结果，不给用户写教程、不让用户动手。

输出格式（严格遵守）：
- 每个要改的文件输出一个代码块：第一行是 \`\`\`file:相对路径，接着是文件改写后的完整内容，最后 \`\`\` 收尾。
- 不需要改的文件一个字都别输出。块外只许写一行 SUMMARY: 一句话说明改了什么。
- 第一轮示范：如果需求是"按钮变蓝色"，你的全文只能是：
\`\`\`file:src/theme.css
…theme.css 全文（.btn 的 background 改成用户要的蓝色）…
\`\`\`
SUMMARY: 按钮背景改为蓝色`;

export interface FileEdit {
  path: string;
  content: string;
}

export interface CustomizeResult {
  summary: string;
  files: FileEdit[];
  raw: string;
}

const FILE_FENCE = /```file:([^\s`]+)\s*\n([\s\S]*?)```/g;

export function parseEdits(raw: string): { files: FileEdit[]; summary: string } {
  const files: FileEdit[] = [];
  let m: RegExpExecArray | null;
  FILE_FENCE.lastIndex = 0;
  while ((m = FILE_FENCE.exec(raw)) !== null) {
    files.push({ path: (m[1] as string).trim(), content: (m[2] as string).trim() });
  }
  const summary = (raw.match(/SUMMARY:\s*(.+)/)?.[1] ?? '').trim();
  return { files, summary };
}

// 官方同款安全校验：白名单 + 形状（非 dict/缺 content 丢弃，白名单外抛错）
export function sanitize(files: FileEdit[]): FileEdit[] {
  const shaped = files.filter((f) => typeof f.path === 'string' && typeof f.content === 'string' && f.content.length > 0);
  for (const f of shaped) {
    if (!EDITABLE_FILES.includes(f.path)) throw new Error(`模型试图修改非白名单文件：${f.path}`);
  }
  return shaped;
}

export async function customize(frontendDir: string, requirement: string, feedback = ''): Promise<CustomizeResult> {
  const blocks = EDITABLE_FILES.map((rel) => `===== 文件: ${rel} =====\n${readFileSync(join(frontendDir, rel), 'utf8')}`).join('\n\n');
  const ollama = new Ollama({ host: BASE_URL });
  const p = ollama.chat({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `可编辑文件当前内容如下：\n\n${blocks}\n\n用户的定制需求：${requirement}\n\n请按格式返回改写后的文件全文。${feedback}` },
    ],
    options: { temperature: 0 },
  });
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`ollama chat timeout after ${CHAT_TIMEOUT_MS}ms`)), CHAT_TIMEOUT_MS));
  const res = await Promise.race([p, timer]);
  const raw = (res.message.content || '').trim();
  const { files, summary } = parseEdits(raw);
  return { summary, files: sanitize(files), raw };
}
