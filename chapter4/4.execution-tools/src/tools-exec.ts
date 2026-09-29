import { classifyCommand, llmApprove, runProcess, truncateAndPersist, workspaceRoot } from './safety.js';
import { ExecContext, ToolDef, fail, numArg, ok, strArg } from './types.js';

const EXEC_TIMEOUT_MS = 60000;

export const execTools: ToolDef[] = [
  {
    name: 'code_interpreter',
    description: 'Run Python code via python3 -c (timeout 60s, output truncated+persisted).',
    category: 'execute',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python source to run' },
        timeout: { type: 'number', description: 'Timeout seconds', default: 60 },
      },
      required: ['code'],
    },
    handler: async (args, ctx: ExecContext) => {
      const code = strArg(args, 'code');
      if (!code) return fail('code is required', { tool: 'code_interpreter' });
      const risk = classifyCommand(code);
      if (risk.level === 'denied') {
        return fail(`denied by blacklist: ${risk.reasons.join('; ')}`, { tool: 'code_interpreter', risk: risk.level });
      }
      let reviewer: string | null = null;
      if (!ctx.noApproval) {
        const decision = await llmApprove('code_interpreter', { code: code.slice(0, 500) }, risk);
        reviewer = decision.reviewer;
        if (!decision.approved) {
          return fail(`denied by reviewer (${decision.reviewer}): ${decision.reason}`, {
            tool: 'code_interpreter',
            risk: risk.level,
            reviewer: decision.reviewer,
          });
        }
      }
      const timeoutMs = Math.min(300, Math.max(1, numArg(args, 'timeout', 60))) * 1000;
      const r = await runProcess('python3', ['-c', code], '', timeoutMs || EXEC_TIMEOUT_MS);
      const root = ctx.workspace || workspaceRoot();
      const t = truncateAndPersist(root, 'code', r.stdout, r.stderr);
      return ok(`${t.text}\n[exit code: ${r.code}]`, {
        tool: 'code_interpreter',
        exitCode: r.code,
        truncated: t.truncated,
        stdoutFile: t.stdoutFile,
        risk: risk.level,
        ...(reviewer ? { reviewer } : {}),
      });
    },
  },
  {
    name: 'virtual_terminal',
    description: 'Run a shell command via bash -c (timeout 60s, blacklist enforced, output truncated+persisted).',
    category: 'execute',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command' },
        timeout: { type: 'number', description: 'Timeout seconds', default: 60 },
      },
      required: ['command'],
    },
    handler: async (args, ctx: ExecContext) => {
      const command = strArg(args, 'command');
      if (!command) return fail('command is required', { tool: 'virtual_terminal' });
      const risk = classifyCommand(command);
      if (risk.level === 'denied') {
        return fail(`denied by blacklist: ${risk.reasons.join('; ')}`, { tool: 'virtual_terminal', risk: risk.level });
      }
      let reviewer: string | null = null;
      if (!ctx.noApproval) {
        const decision = await llmApprove('virtual_terminal', { command: command.slice(0, 500) }, risk);
        reviewer = decision.reviewer;
        if (!decision.approved) {
          return fail(`denied by reviewer (${decision.reviewer}): ${decision.reason}`, {
            tool: 'virtual_terminal',
            risk: risk.level,
            reviewer: decision.reviewer,
          });
        }
      }
      const timeoutMs = Math.min(300, Math.max(1, numArg(args, 'timeout', 60))) * 1000;
      const r = await runProcess('bash', ['-c', command], '', timeoutMs || EXEC_TIMEOUT_MS);
      const root = ctx.workspace || workspaceRoot();
      const t = truncateAndPersist(root, 'shell', r.stdout, r.stderr);
      return ok(`${t.text}\n[exit code: ${r.code}]`, {
        tool: 'virtual_terminal',
        exitCode: r.code,
        truncated: t.truncated,
        stdoutFile: t.stdoutFile,
        risk: risk.level,
        ...(reviewer ? { reviewer } : {}),
      });
    },
  },
];
