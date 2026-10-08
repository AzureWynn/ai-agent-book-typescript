// 七核心工具（书 5.1 节）：读 / 写 / 改 / 找文件 / 找内容 / 终端 / 代码执行
// 安全：全部约束在 workspace 内；bash 带危险命令拒绝 + 超时 + 输出截断。
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, dirname, basename } from 'node:path';
import type { ToolDef, ToolName, ToolResult } from './types.js';

export const TOOL_DEFS: ToolDef[] = [
  { name: 'read', description: '读取文件（带行号，可按行范围读）', argsHint: '{"path":"<相对workspace路径>","offset":1,"limit":200}' },
  { name: 'write', description: '创建或覆写文件', argsHint: '{"path":"...","content":"..."}' },
  { name: 'edit', description: '精确替换（oldText 必须唯一命中一次）', argsHint: '{"path":"...","oldText":"...","newText":"..."}' },
  { name: 'glob', description: '按后缀找文件，如 "**/*.ts"', argsHint: '{"pattern":"**/*.ts"}' },
  { name: 'grep', description: '正则搜文件内容，返回 文件:行号:行', argsHint: '{"pattern":"TODO","glob":"**/*.ts"}' },
  { name: 'bash', description: '在 workspace 内执行命令（只读/测试类）', argsHint: '{"command":"node test.mjs"}' },
  { name: 'runCode', description: '执行一小段 node/python 代码并取输出', argsHint: '{"language":"node","code":"console.log(1+1)"}' },
];

const MAX_OUT = 3000;
const BASH_DENY = [/rm\s+-rf\s+\//, /:\(\)\s*\{/, /\bmkfs\b/, /\bdd\b.*of=\/dev\//, />\s*\/dev\/sd/, /\bshutdown\b/, /\breboot\b/, /\bchmod\s+-R\s+777\s+\//, /curl.*\|\s*(ba)?sh/];

function trunc(s: string): string {
  if (s.length <= MAX_OUT) return s;
  const head = s.slice(0, 1200);
  const tail = s.slice(-1200);
  return `${head}\n…[中间 ${s.length - 2400} 字已截断，完整输出过长]…\n${tail}`;
}

function fail(output: string): ToolResult {
  return { ok: false, output };
}

function safePath(workspace: string, p: string): string | null {
  const abs = resolve(workspace, p);
  const rel = relative(workspace, abs);
  if (rel === '' || rel.startsWith('..')) return null;
  return abs;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function globMatch(pattern: string, rel: string): boolean {
  // 只支持教学够用的几种：**/*.ext、*.ext、dir/**、**、精确名
  if (pattern === '**') return true;
  const dirAll = pattern.match(/^(.+)\/\*\*$/);
  if (dirAll) {
    const prefix = dirAll[1] as string;
    return rel === prefix || rel.startsWith(prefix + '/');
  }
  const base = basename(rel);
  const m = pattern.match(/^\*\*\/\*(\.\w+)$/);
  if (m) return base.endsWith(m[1] as string);
  const m2 = pattern.match(/^\*(\.\w+)$/);
  if (m2) return !rel.includes('/') && base.endsWith(m2[1] as string);
  return rel === pattern || base === pattern;
}

function sh(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((resolveP) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = (stdout + stderr).trim();
      resolveP({ code: err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0, out });
    });
  });
}

export async function execTool(workspace: string, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  switch (name as ToolName) {
    case 'read': {
      const abs = safePath(workspace, String(args.path ?? ''));
      if (!abs) return fail('路径越界：只能读 workspace 内的文件');
      try {
        const lines = readFileSync(abs, 'utf8').split('\n');
        const offset = Math.max(1, Number(args.offset ?? 1));
        const limit = Math.min(400, Math.max(1, Number(args.limit ?? 200)));
        const slice = lines.slice(offset - 1, offset - 1 + limit);
        const numbered = slice.map((l, i) => `${offset + i}: ${l}`).join('\n');
        const more = offset - 1 + limit < lines.length ? `\n…还有 ${lines.length - (offset - 1 + limit)} 行未显示…` : '';
        return { ok: true, output: trunc(numbered + more) };
      } catch (e) { return fail(`读文件失败：${(e as Error).message}`); }
    }
    case 'write': {
      const abs = safePath(workspace, String(args.path ?? ''));
      if (!abs) return fail('路径越界：只能写 workspace 内的文件');
      try {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, String(args.content ?? ''));
        return { ok: true, output: `已写入 ${relative(workspace, abs)}（${String(args.content ?? '').length} 字）` };
      } catch (e) { return fail(`写文件失败：${(e as Error).message}`); }
    }
    case 'edit': {
      const abs = safePath(workspace, String(args.path ?? ''));
      if (!abs) return fail('路径越界');
      try {
        const text = readFileSync(abs, 'utf8');
        const oldText = String(args.oldText ?? '');
        const hits = text.split(oldText).length - 1;
        if (hits === 0) return fail('oldText 一次都没命中，请先 read 确认原文');
        if (hits > 1) return fail(`oldText 命中 ${hits} 次不唯一，请加长上下文使只命中一次`);
        writeFileSync(abs, text.replace(oldText, String(args.newText ?? '')));
        return { ok: true, output: `已替换 1 处（${relative(workspace, abs)}）` };
      } catch (e) { return fail(`编辑失败：${(e as Error).message}`); }
    }
    case 'glob': {
      const files = walk(workspace).map((f) => relative(workspace, f));
      const hits = files.filter((f) => globMatch(String(args.pattern ?? ''), f));
      return { ok: true, output: hits.length ? hits.join('\n') : '无匹配文件' };
    }
    case 'grep': {
      const pattern = String(args.pattern ?? '');
      let re: RegExp;
      try { re = new RegExp(pattern); } catch { return fail('正则不合法'); }
      const files = walk(workspace).map((f) => relative(workspace, f))
        .filter((f) => globMatch(String(args.glob ?? '**/*.*'), f));
      const out: string[] = [];
      for (const f of files) {
        const abs = join(workspace, f);
        try {
          if (statSync(abs).size > 200_000) continue;
          const lines = readFileSync(abs, 'utf8').split('\n');
          lines.forEach((l, i) => { if (re.test(l)) out.push(`${f}:${i + 1}: ${l.trim()}`); });
        } catch { /* 跳过二进制/无权限 */ }
        if (out.length > 120) break;
      }
      return { ok: true, output: trunc(out.length ? out.join('\n') : '无匹配内容') };
    }
    case 'bash': {
      const command = String(args.command ?? '').trim();
      if (!command) return fail('command 不能为空');
      if (BASH_DENY.some((re) => re.test(command))) return fail('危险命令被拒绝（rm -rf /、fork 炸弹、管道执行远程脚本等）');
      const timeoutMs = Math.min(60_000, Math.max(1000, Number(args.timeoutMs ?? 15_000)));
      const r = await sh('sh', ['-c', command], workspace, timeoutMs);
      return { ok: r.code === 0, output: trunc(r.out || `(exit ${r.code}，无输出)`) };
    }
    case 'runCode': {
      const lang = String(args.language ?? 'node');
      if (lang !== 'node' && lang !== 'python') return fail('只支持 node / python');
      const tmpDir = join(workspace, '.tmp');
      mkdirSync(tmpDir, { recursive: true });
      const file = join(tmpDir, lang === 'node' ? 'snippet.mjs' : 'snippet.py');
      writeFileSync(file, String(args.code ?? ''));
      const timeoutMs = Math.min(30_000, Math.max(1000, Number(args.timeoutMs ?? 10_000)));
      const r = await sh(lang === 'node' ? 'node' : 'python3', [file], workspace, timeoutMs);
      return { ok: r.code === 0, output: trunc(r.out || `(exit ${r.code}，无输出)`) };
    }
    default:
      return fail(`未知工具 "${name}"。可用：${TOOL_DEFS.map((t) => t.name).join('、')}`);
  }
}
