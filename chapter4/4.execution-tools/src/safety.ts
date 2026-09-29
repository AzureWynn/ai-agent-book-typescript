import { ExecException, execFile } from 'node:child_process';
import { existsSync, mkdirSync, lstatSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { Ollama } from 'ollama';
import { RiskLevel } from './types.js';

export function workspaceRoot(): string {
  const fromEnv = process.env.EXECUTION_ROOT || './workspace';
  const root = resolve(process.cwd(), fromEnv);
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return root;
}

export function resolveInside(root: string, rel: string): string {
  if (rel.startsWith('/') || /^[A-Za-z]:\\/.test(rel)) {
    throw new Error(`absolute paths rejected: ${rel}`);
  }
  const abs = resolve(root, rel);
  const relToRoot = relative(root, abs);
  if (relToRoot === '..' || relToRoot.startsWith(`..${sep}`)) {
    throw new Error(`path escapes workspace root: ${rel}`);
  }
  const st = existsSync(abs) ? lstatSync(abs) : null;
  if (st && st.isSymbolicLink()) throw new Error(`symlinks rejected: ${rel}`);
  return abs;
}

const DENY_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /(^|[\s;&|])(rm\s+-rf\s+\/|rm\s+-rf\s+\*)/, reason: 'recursive force delete' },
  { re: /\bdd\s+if=/, reason: 'raw disk write (dd)' },
  { re: /mkfs(\.|$|\s)/, reason: 'filesystem format (mkfs)' },
  { re: /:\(\)\s*\{/, reason: 'fork bomb' },
  { re: /(^|[\s;&|])sudo(\s|$)/, reason: 'privilege escalation (sudo)' },
  { re: /curl[^|]*\|\s*(ba)?sh/, reason: 'remote pipe-to-shell' },
  { re: /wget[^|]*\|\s*(ba)?sh/, reason: 'remote pipe-to-shell' },
  { re: /chmod\s+-R\s+777\s+\//, reason: 'recursive chmod on root' },
];

const HIGH_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /(^|[\s;&|])rm(\s|$)/, reason: 'file deletion' },
  { re: />\s*\//, reason: 'redirect outside workspace suspected' },
  { re: /shutdown|reboot|halt|poweroff/, reason: 'host power control' },
  { re: /iptables|pfctl|netsh/, reason: 'firewall change' },
];

export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
}

export function classifyCommand(command: string): RiskAssessment {
  const denied = DENY_PATTERNS.filter((p) => p.re.test(command));
  if (denied.length > 0) {
    return { level: 'denied', reasons: denied.map((d) => d.reason) };
  }
  const high = HIGH_PATTERNS.filter((p) => p.re.test(command));
  if (high.length > 0) {
    return { level: 'high', reasons: high.map((h) => h.reason) };
  }
  return { level: 'medium', reasons: ['arbitrary shell/python execution'] };
}

export function classifyFileOp(kind: 'write-new' | 'overwrite' | 'edit'): RiskAssessment {
  if (kind === 'write-new') return { level: 'medium', reasons: ['new file inside sandbox'] };
  return { level: 'high', reasons: [kind === 'overwrite' ? 'overwrite existing file' : 'modify existing file'] };
}

let ollamaClient: Ollama | null = null;

function getOllama(): Ollama {
  if (!ollamaClient) {
    ollamaClient = new Ollama({ host: process.env.OLLAMA_BASE_URL || 'http://localhost:11434' });
  }
  return ollamaClient;
}

export interface ApprovalDecision {
  approved: boolean;
  reason: string;
  reviewer: string;
}

export async function llmApprove(tool: string, args: Record<string, unknown>, risk: RiskAssessment): Promise<ApprovalDecision> {
  const reviewer = process.env.OLLAMA_MODEL || 'gemma4:latest';
  try {
    const res = await getOllama().chat({
      model: reviewer,
      messages: [
        {
          role: 'user',
          content: [
            'You are a safety reviewer. A proposer agent wants to run a tool. Reply with exactly one line of JSON: {"approve": true|false, "reason": "..."}',
            `Tool: ${tool}`,
            `Arguments: ${JSON.stringify(args).slice(0, 500)}`,
            `Risk: ${risk.level} (${risk.reasons.join('; ')})`,
            'Context you must assume true: all file paths are confined to a disposable sandbox workspace (no host files reachable); file writes are reversible; the blacklist already denied destructive commands before asking you.',
            'Approve when the action stays inside that sandbox. Deny only if arguments suggest escape, exfiltration, or irreversible external effects.',
          ].join('\n'),
        },
      ],
      options: { temperature: 0 },
    });
    const match = res.message.content.match(/\{[\s\S]*\}/);
    if (!match) return { approved: false, reason: 'reviewer output unparseable (fail closed)', reviewer };
    const parsed = JSON.parse(match[0]) as { approve?: unknown; reason?: unknown };
    if (typeof parsed.approve !== 'boolean') return { approved: false, reason: 'reviewer verdict not boolean (fail closed)', reviewer };
    return { approved: parsed.approve, reason: String(parsed.reason ?? ''), reviewer };
  } catch (err) {
    return { approved: false, reason: `reviewer unreachable (fail closed): ${err instanceof Error ? err.message : String(err)}`, reviewer };
  }
}

export function runProcess(cmd: string, args: string[], input: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error: ExecException | null, stdout, stderr) => {
      const killed = error?.killed === true;
      const code = typeof error?.code === 'number' ? error.code : error ? 1 : 0;
      resolve({
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? '') + (killed ? '\n[TIMEOUT]' : ''),
        code,
      });
    });
    if (input) {
      child.stdin?.write(input);
      child.stdin?.end();
    }
  });
}

export async function verifySyntax(absPath: string, content: string): Promise<{ ok: boolean; detail: string }> {
  if (absPath.endsWith('.py')) {
    const tmp = `${absPath}.syntaxcheck`;
    try {
      writeFileSync(tmp, content, 'utf-8');
      const r = await runProcess('python3', ['-m', 'py_compile', tmp], '', 30000);
      return r.code === 0 ? { ok: true, detail: 'py_compile pass' } : { ok: false, detail: r.stderr.slice(0, 500) || r.stdout.slice(0, 500) };
    } catch (err) {
      return { ok: false, detail: `verifier error: ${err instanceof Error ? err.message : String(err)}` };
    } finally {
      try {
        const { unlinkSync } = await import('node:fs');
        if (existsSync(tmp)) unlinkSync(tmp);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
  if (absPath.endsWith('.js') || absPath.endsWith('.mjs') || absPath.endsWith('.cjs')) {
    const r = await runProcess('node', ['--check', absPath], '', 30000);
    return r.code === 0 ? { ok: true, detail: 'node --check pass' } : { ok: false, detail: r.stderr.slice(0, 500) };
  }
  return { ok: true, detail: 'no verifier for this extension (skipped)' };
}

export const TRUNCATE_LINES = 200;
export const TRUNCATE_CHARS = 10000;
export const KEEP_EDGE_LINES = 50;

export interface Truncated {
  text: string;
  truncated: boolean;
  stdoutFile: string | null;
}

export function truncateAndPersist(root: string, name: string, stdout: string, stderr: string): Truncated {
  const combined = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');
  const lines = combined.split('\n');
  if (lines.length <= TRUNCATE_LINES && combined.length <= TRUNCATE_CHARS) {
    return { text: combined, truncated: false, stdoutFile: null };
  }
  const head = lines.slice(0, KEEP_EDGE_LINES).join('\n');
  const tail = lines.slice(-KEEP_EDGE_LINES).join('\n');
  const outDir = join(root, '.outputs');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${Date.now()}-${name}.log`);
  writeFileSync(file, combined, 'utf-8');
  const omitted = lines.length - KEEP_EDGE_LINES * 2;
  return {
    text: `${head}\n\n[... truncated: ${omitted > 0 ? omitted : 0} lines omitted, ${combined.length} chars total ...]\n\n${tail}`,
    truncated: true,
    stdoutFile: file,
  };
}

