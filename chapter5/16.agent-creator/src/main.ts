import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArm } from './creator.js';
import { validateArm } from './validator.js';
import { ArmResult, Comparison } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));

interface Args {
  mode: string;
  arm: string;
  runId: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  };
  return {
    mode: get('--mode') ?? 'demo',
    arm: get('--arm') ?? 'both',
    runId: get('--run-id') ?? `run-${Date.now()}`,
  };
}

function runsDir(): string {
  const dir = resolve(HERE, '../runs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function pickWinner(results: ArmResult[]): { winner: string; reason: string } {
  const score = (r: ArmResult): number => r.gates.filter((g) => g.pass).length;
  const [a, b] = results;
  if (!a || !b) return { winner: a?.arm ?? 'none', reason: 'single arm run' };
  const sa = score(a);
  const sb = score(b);
  if (sa !== sb) {
    const win = sa > sb ? a : b;
    return { winner: win.arm, reason: `more gates passed (${Math.max(sa, sb)} vs ${Math.min(sa, sb)})` };
  }
  const ta = a.genTokens;
  const tb = b.genTokens;
  if (ta === tb) return { winner: 'tie', reason: `same gates (${sa}) and same tokens` };
  const win = ta < tb ? a : b;
  return { winner: win.arm, reason: `same gates (${sa}), fewer generation tokens (${Math.min(ta, tb)} vs ${Math.max(ta, tb)})` };
}

async function runOneArm(arm: 'scratch' | 'template', runId: string, verbose: boolean): Promise<ArmResult> {
  const dir = join(runsDir(), runId, arm);
  console.log(`\n[${arm}] generating...`);
  const gen = await runArm(arm, dir);
  console.log(`[${arm}] files: ${gen.files.map((f) => f.name).join(', ') || '(none parsed!)'} (${gen.ms}ms, ~${gen.tokens} tokens)`);
  const gates = await validateArm(dir);
  for (const g of gates) {
    console.log(`  ${g.pass ? '✓' : '✗'} ${g.name}: ${g.detail.slice(0, 100)}`);
  }
  if (verbose) {
    console.log(`  (raw generation length: ${gen.raw.length} chars)`);
  }
  const traceGate = gates.find((g) => g.name === 'live-run');
  return {
    arm,
    files: gen.files.map((f) => f.name),
    genMs: gen.ms,
    genTokens: gen.tokens,
    gates,
    traceSteps: 0,
    liveAnswer: traceGate?.detail.slice(0, 120) ?? '',
    livePass: gates.every((g) => g.pass),
  };
}

async function runDemo(args: Args): Promise<void> {
  console.log('\n=== Experiment 5-16: Agent Creator Demo ===');
  console.log('Target: release-notes Agent (draft v2.4.0 notes + follow-up Q&A).');
  const arms = args.arm === 'both' ? (['scratch', 'template'] as const) : [args.arm as 'scratch' | 'template'];
  const results: ArmResult[] = [];
  for (const arm of arms) {
    results.push(await runOneArm(arm, args.runId, true));
  }
  if (results.length === 2) {
    const { winner, reason } = pickWinner(results);
    console.log(`\nWinner: ${winner} (${reason})`);
    const comparison: Comparison = {
      runId: args.runId,
      target: 'release-notes Agent (CHANGELOG.md, draft v2.4.0 + Q&A)',
      arms: Object.fromEntries(results.map((r) => [r.arm, r])),
      winner,
      winnerReason: reason,
    };
    const outFile = join(runsDir(), args.runId, 'comparison.json');
    writeFileSync(outFile, JSON.stringify(comparison, null, 2), 'utf-8');
    console.log(`comparison.json: ${outFile}`);
  }
}

async function runEval(args: Args): Promise<void> {
  console.log('\n=== Experiment 5-16: Template vs Scratch Eval ===');
  const arms = args.arm === 'both' ? (['scratch', 'template'] as const) : [args.arm as 'scratch' | 'template'];
  const results: ArmResult[] = [];
  for (const arm of arms) {
    results.push(await runOneArm(arm, args.runId, false));
  }
  console.log('\nArm       Files  GenTok  Gates');
  for (const r of results) {
    const passed = r.gates.filter((g) => g.pass).length;
    console.log(`${r.arm.padEnd(10)}${String(r.files.length).padEnd(7)}${String(r.genTokens).padEnd(8)}${passed}/${r.gates.length}  ${r.gates.map((g) => (g.pass ? '✓' : '✗')).join('')}`);
  }
  if (results.length === 2) {
    const { winner, reason } = pickWinner(results);
    console.log(`\nWinner: ${winner} (${reason})`);
    const comparison: Comparison = {
      runId: args.runId,
      target: 'release-notes Agent (CHANGELOG.md, draft v2.4.0 + Q&A)',
      arms: Object.fromEntries(results.map((r) => [r.arm, r])),
      winner,
      winnerReason: reason,
    };
    const outFile = join(runsDir(), args.runId, 'comparison.json');
    writeFileSync(outFile, JSON.stringify(comparison, null, 2), 'utf-8');
    console.log(`comparison.json: ${outFile}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  try {
    if (args.mode === 'eval') await runEval(args);
    else await runDemo(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    console.error('Note: creator needs Ollama (`ollama serve` + gemma4). No mock fallback: failures fail the command.');
    process.exit(1);
  }
}

main();
