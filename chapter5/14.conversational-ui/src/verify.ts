// verify：落盘 + 断言 + vite build。对应官方 demo.py 的"快照→写盘→diff→构建验证"。
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FileEdit } from './agent.js';

export interface VerifyOutcome {
  wrote: string[];
  diffs: string[];
  asserts: { name: string; pass: boolean; detail: string }[];
  buildOk: boolean;
  buildOut: string;
}

function diffLines(before: string, after: string, path: string): string[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const out: string[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      if (i < a.length) out.push(`- ${path}:${i + 1}: ${(a[i] ?? '').slice(0, 100)}`);
      if (i < b.length) out.push(`+ ${path}:${i + 1}: ${(b[i] ?? '').slice(0, 100)}`);
    }
    if (out.length > 24) { out.push('…diff 过长截断…'); break; }
  }
  return out;
}

export function applyEdits(frontendDir: string, files: FileEdit[]): { wrote: string[]; diffs: string[] } {
  const wrote: string[] = [];
  const diffs: string[] = [];
  for (const f of files) {
    const abs = join(frontendDir, f.path);
    const before = readFileSync(abs, 'utf8');
    writeFileSync(abs, f.content);
    wrote.push(f.path);
    diffs.push(...diffLines(before, f.content, f.path));
  }
  return { wrote, diffs };
}

export function runBuild(frontendDir: string): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolveP) => {
    execFile('npm', ['run', 'build', '--prefix', frontendDir], { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = (stdout + stderr).trim().slice(-800);
      resolveP({ ok: !err, out: out || '(无输出)' });
    });
  });
}
