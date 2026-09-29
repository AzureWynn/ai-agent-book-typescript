import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolveInside, verifySyntax, workspaceRoot, classifyFileOp, llmApprove } from './safety.js';
import { ExecContext, ToolDef, boolArg, fail, ok, strArg } from './types.js';

function unifiedDiff(before: string, after: string, maxLines = 20): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const out: string[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n && out.length < maxLines; i++) {
    if (a[i] !== b[i]) {
      if (i < a.length) out.push(`- ${a[i]}`);
      if (i < b.length) out.push(`+ ${b[i]}`);
    }
  }
  if (out.length >= maxLines) out.push('... (diff truncated)');
  return out.join('\n') || '(no visible change)';
}

export const fileTools: ToolDef[] = [
  {
    name: 'file_write',
    description: 'Write a file inside the sandbox workspace (auto syntax-verify for .py/.js). path and file_path are aliases (file_path kept for cross-server consistency).',
    category: 'filesystem',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative path (or file_path)' },
        file_path: { type: 'string', description: 'Alias of path (4-2 convention)' },
        content: { type: 'string', description: 'File content' },
        overwrite: { type: 'boolean', description: 'Allow overwrite', default: false },
      },
      required: ['content'],
    },
    handler: async (args, ctx: ExecContext) => {
      try {
        const rel = strArg(args, 'path') || strArg(args, 'file_path');
        if (!rel) return fail('path (or file_path) is required', { tool: 'file_write' });
        const root = ctx.workspace || workspaceRoot();
        const abs = resolveInside(root, rel);
        const existed = existsSync(abs);
        if (existed && !boolArg(args, 'overwrite', false)) {
          return fail('file exists; pass overwrite=true to replace', { tool: 'file_write', path: rel });
        }
        const risk = classifyFileOp(existed ? 'overwrite' : 'write-new');
        let reviewer: string | null = null;
        if (risk.level === 'high' && !ctx.noApproval) {
          const decision = await llmApprove('file_write', { path: rel }, risk);
          reviewer = decision.reviewer;
          if (!decision.approved) {
            return fail(`denied by reviewer (${decision.reviewer}): ${decision.reason}`, {
              tool: 'file_write',
              risk: risk.level,
              reviewer: decision.reviewer,
            });
          }
        }
        if (!ctx.noVerify) {
          const check = await verifySyntax(abs, strArg(args, 'content'));
          if (!check.ok) {
            return fail(`syntax check failed, file NOT written: ${check.detail}`, { tool: 'file_write', verify: check.detail });
          }
        }
        writeFileSync(abs, strArg(args, 'content'), 'utf-8');
        return ok(`wrote ${rel} (${strArg(args, 'content').length} chars)`, {
          tool: 'file_write',
          risk: risk.level,
          verified: !ctx.noVerify,
          ...(reviewer ? { reviewer } : {}),
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err), { tool: 'file_write' });
      }
    },
  },
  {
    name: 'file_edit',
    description: 'Exact-match edit with diff preview and syntax re-check. path and file_path are aliases.',
    category: 'filesystem',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative path (or file_path)' },
        file_path: { type: 'string', description: 'Alias of path (4-2 convention)' },
        search: { type: 'string', description: 'Exact string to find' },
        replace: { type: 'string', description: 'Replacement string' },
      },
      required: ['search', 'replace'],
    },
    handler: async (args, ctx: ExecContext) => {
      try {
        const rel = strArg(args, 'path') || strArg(args, 'file_path');
        if (!rel) return fail('path (or file_path) is required', { tool: 'file_edit' });
        const root = ctx.workspace || workspaceRoot();
        const abs = resolveInside(root, rel);
        if (!existsSync(abs)) return fail(`file not found: ${rel}`, { tool: 'file_edit' });
        const before = readFileSync(abs, 'utf-8');
        const search = strArg(args, 'search');
        if (!before.includes(search)) {
          return fail('search string not found (no fuzzy match attempted)', { tool: 'file_edit', path: rel });
        }
        const after = before.replace(search, strArg(args, 'replace'));
        const risk = classifyFileOp('edit');
        let reviewer: string | null = null;
        if (!ctx.noApproval) {
          const decision = await llmApprove('file_edit', { path: rel }, risk);
          reviewer = decision.reviewer;
          if (!decision.approved) {
            return fail(`denied by reviewer (${decision.reviewer}): ${decision.reason}`, { tool: 'file_edit', risk: risk.level });
          }
        }
        if (!ctx.noVerify) {
          const check = await verifySyntax(abs, after);
          if (!check.ok) {
            return fail(`syntax check failed, file NOT modified: ${check.detail}`, { tool: 'file_edit', verify: check.detail });
          }
        }
        writeFileSync(abs, after, 'utf-8');
        return ok(`edited ${rel}\n${unifiedDiff(before, after)}`, {
          tool: 'file_edit',
          risk: risk.level,
          ...(reviewer ? { reviewer } : {}),
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err), { tool: 'file_edit' });
      }
    },
  },
];
