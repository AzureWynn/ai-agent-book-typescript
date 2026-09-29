import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { categories, findTool, TOOLS } from './catalog.js';
import { callTool, listTools, withClient } from './client.js';
import { AGENT_TASK_DEFAULT, runAgent } from './agent.js';
import { workspaceRoot } from './safety.js';

dotenv.config();

function parseKV(rest: string[]): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const item of rest) {
    const eq = item.indexOf('=');
    if (eq === -1) continue;
    const key = item.slice(0, eq);
    const raw = item.slice(eq + 1);
    if (raw === 'true' || raw === 'false') args[key] = raw === 'true';
    else if (raw !== '' && !Number.isNaN(Number(raw))) args[key] = Number(raw);
    else args[key] = raw;
  }
  return args;
}

function flag(rest: string[], name: string): boolean {
  return rest.includes(name);
}

function flagValue(rest: string[], name: string): string | undefined {
  const idx = rest.indexOf(name);
  if (idx === -1 || idx + 1 >= rest.length) return undefined;
  return rest[idx + 1];
}

function serverEnv(rest: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  if (flag(rest, '--no-approval')) env['EXEC_NO_APPROVAL'] = '1';
  if (flag(rest, '--no-verify')) env['EXEC_NO_VERIFY'] = '1';
  const workspace = flagValue(rest, '--workspace');
  if (workspace) env['EXECUTION_ROOT'] = workspace;
  return env;
}

function cleanRest(rest: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i];
    if (item === '--workspace' || item === '--task') {
      i += 1;
      continue;
    }
    if (item === '--no-approval' || item === '--no-verify' || item === '--offline') continue;
    out.push(item ?? '');
  }
  return out;
}

async function cmdList(category?: string): Promise<void> {
  const list = category ? TOOLS.filter((t) => t.category === category) : TOOLS;
  if (category && !categories().includes(category)) {
    console.log(`unknown category: ${category} (known: ${categories().join(', ')})`);
    return;
  }
  console.log(`\nExecution tools (${list.length}${category ? ` in ${category}` : ''}):`);
  for (const t of list) {
    console.log(`  ${t.name}  [${t.category}${t.needsNetwork ? ', network' : ', offline'}]`);
  }
  console.log('\nCategories:', categories().join(', '));
}

async function cmdRun(name: string, rest: string[]): Promise<void> {
  const t = findTool(name);
  if (!t) {
    console.log(`unknown tool: ${name}`);
    return;
  }
  const result = await withClient((client) => callTool(client, name, parseKV(cleanRest(rest))), serverEnv(rest));
  console.log(JSON.stringify(result, null, 2));
}

async function cmdDemo(): Promise<void> {
  console.log('\n=== Experiment 4-4: Execution Demo (offline, approval off) ===');
  console.log(`Workspace: ${workspaceRoot()} (disposable)`);
  await withClient(async (client) => {
    const w = await callTool(client, 'file_write', { path: 'squares.py', content: 'squares = [i * i for i in range(1, 6)]\nprint(squares)\n' });
    console.log(`\n[write] success=${w.success} verified=${String(w.metadata['verified'] ?? '?')}`);

    const bad = await callTool(client, 'file_write', { path: 'broken.py', content: 'def oops(\n  print(1)\n' });
    console.log(`[write-bad] success=${bad.success} (expect false: py_compile rejects, file NOT written)`);

    const run = await callTool(client, 'code_interpreter', { code: 'print(sum([i * i for i in range(1, 6)]))' });
    console.log(`[run] success=${run.success} output=${JSON.stringify(run.message).slice(0, 80)}`);

    const edit = await callTool(client, 'file_edit', { path: 'squares.py', search: 'range(1, 6)', replace: 'range(1, 11)' });
    console.log(`[edit] success=${edit.success}\n${String(edit.message).split('\n').slice(0, 4).join('\n')}`);

    const long = await callTool(client, 'code_interpreter', { code: 'for i in range(300): print(f"line {i}")' });
    console.log(`[long-output] success=${long.success} truncated=${String(long.metadata['truncated'])} file=${String(long.metadata['stdoutFile'] ?? '(none)')}`);

    const blocked = await callTool(client, 'virtual_terminal', { command: 'rm -rf /' });
    console.log(`[blacklist] success=${blocked.success} (expect false: ${String(blocked.message).slice(0, 60)})`);

    const cal = await callTool(client, 'calendar_add', {});
    console.log(`[external] success=${cal.success} (expect false: ${String(cal.message).slice(0, 60)})`);
  }, { EXEC_NO_APPROVAL: '1' });
  console.log('\nRead: verify-before-write, truncate-and-persist, blacklist-deny, external-blocked — all without a model.');
}

interface EvalCheck {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
}

async function cmdEval(): Promise<void> {
  console.log('\n=== Experiment 4-4: Acceptance Checks ===');
  const checks: EvalCheck[] = [];
  const push = (name: string, status: EvalCheck['status'], detail: string): void => {
    checks.push({ name, status, detail });
    console.log(`${status === 'pass' ? '✓' : status === 'fail' ? '✗' : '-'} ${name}: ${detail}`);
  };

  await withClient(async (client) => {
    const stamp = Date.now();
    const evalFile = `eval_ok_${stamp}.py`;
    const badFile = `eval_bad_${stamp}.py`;
    const w = await callTool(client, 'file_write', { path: evalFile, content: 'x = 1\nprint(x + 1)\n' });
    push('write+verify pass', w.success ? 'pass' : 'fail', String(w.message).split('\n')[0] ?? '');

    const bad = await callTool(client, 'file_write', { path: badFile, content: 'def broken(\n' });
    const badExists = existsSync(`${workspaceRoot()}/${badFile}`);
    push('bad python rejected+not written', !bad.success && !badExists ? 'pass' : 'fail', String(bad.message).slice(0, 80));

    const denied = await callTool(client, 'virtual_terminal', { command: 'rm -rf /' });
    push('blacklist denies rm -rf /', !denied.success ? 'pass' : 'fail', String(denied.message).slice(0, 80));

    const missing = await callTool(client, 'file_edit', { path: evalFile, search: 'no_such_string_xyz', replace: 'y' });
    const unchanged = readFileSync(`${workspaceRoot()}/${evalFile}`, 'utf-8').includes('x = 1');
    push('edit miss fails clean', !missing.success && unchanged ? 'pass' : 'fail', String(missing.message).slice(0, 80));

    const long = await callTool(client, 'code_interpreter', { code: 'for i in range(300): print(i)' });
    const truncated = long.metadata['truncated'] === true && typeof long.metadata['stdoutFile'] === 'string';
    push('long output truncated+persisted', long.success && truncated ? 'pass' : 'fail', `truncated=${String(long.metadata['truncated'])}`);

    const ow = await callTool(client, 'file_write', { path: evalFile, content: 'x = 2\n', overwrite: true });
    const reviewerSeen = typeof ow.metadata['reviewer'] === 'string';
    push(
      'approval path exercised (overwrite=high-risk)',
      reviewerSeen ? 'pass' : 'fail',
      reviewerSeen ? `reviewer=${String(ow.metadata['reviewer'])}, success=${ow.success}` : 'no reviewer receipt in metadata'
    );
  }, {});

  const passed = checks.filter((c) => c.status === 'pass').length;
  console.log(`\n${passed}/${checks.length} checks passed (${checks.filter((c) => c.status === 'skip').length} skipped)`);
}

async function cmdAgent(task: string): Promise<void> {
  console.log('\n=== Experiment 4-4: Agent drives execution tools (approval ON) ===');
  console.log(`Task: ${task}`);
  const trace = await runAgent(task);
  trace.steps.forEach((s, i) => {
    console.log(`\n[step ${i + 1}] ${s.thought.slice(0, 120)}`);
    for (const c of s.calls) console.log(`  ${c.tool} ok=${c.ok} → ${c.preview.slice(0, 120)}`);
  });
  console.log(`\nAnswer:\n${trace.answer}`);
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  const argv = raw[0] === '--mode' ? raw.slice(1) : raw;
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case 'list': {
        const ci = rest.indexOf('--category');
        await cmdList(ci !== -1 ? rest[ci + 1] : rest[0]?.startsWith('--') ? undefined : rest[0]);
        break;
      }
      case 'run':
        if (!rest[0] || rest[0].startsWith('--')) console.log('usage: run <tool> k=v... [--no-approval] [--no-verify]');
        else await cmdRun(rest[0], rest.slice(1));
        break;
      case 'demo':
        await cmdDemo();
        break;
      case 'eval':
        await cmdEval();
        break;
      case 'agent': {
        const ti = rest.indexOf('--task');
        const task = ti !== -1 ? (rest[ti + 1] ?? AGENT_TASK_DEFAULT) : AGENT_TASK_DEFAULT;
        await cmdAgent(task);
        break;
      }
      default:
        await cmdDemo();
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
