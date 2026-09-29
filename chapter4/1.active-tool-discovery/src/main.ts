import dotenv from 'dotenv';
import { closeAll, connectAll, writeReceipt, ownWorkspace } from './servers.js';
import { approxTokens, thinIndex } from './discover.js';
import { runDiscover, runFullInject } from './agent.js';
import { buildTasks } from './tasks.js';
import { existsSync, mkdirSync } from 'node:fs';

dotenv.config();

interface Args {
  mode: string;
  semantic: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  };
  const has = (name: string): boolean => argv.includes(name);
  const positional = argv.find((a) => !a.startsWith('--'));
  const mode = get('--mode') ?? positional ?? 'demo';
  return { mode, semantic: !has('--keyword') };
}

async function cmdList(): Promise<void> {
  const { conns, registry } = await connectAll(ownWorkspace());
  try {
    console.log(`\nUnified catalog: ${registry.length} tools across ${conns.map((c) => c.id).join(', ')}`);
    for (const t of registry) {
      console.log(`  ${t.server}.${t.name}`);
    }
    writeReceipt(registry.length, { toolCount: registry.length });
  } finally {
    await closeAll(conns);
  }
}

async function cmdDemo(semantic: boolean): Promise<void> {
  console.log('\n=== Experiment 4-1: Full-inject vs Discover (demo: T1) ===');
  if (!existsSync(ownWorkspace())) mkdirSync(ownWorkspace(), { recursive: true });
  const { conns, registry } = await connectAll(ownWorkspace());
  try {
    const stamp = Date.now();
    const task = buildTasks(stamp)[0];
    if (!task) throw new Error('no tasks defined');
    console.log(`Task steps:\n  - ${task.steps.join('\n  - ')}`);
    console.log(`\nRegistry: ${registry.length} tools. Full-inject exposes all schemas; discover exposes thin index + meta-tool.`);

    const full = await runFullInject(conns, registry, task.steps);
    console.log(`\n[full-inject] schemaTokens=${full.schemaTokens} time=${(full.elapsedMs / 1000).toFixed(0)}s toolCalls=${full.toolCalls}`);
    for (const [i, s] of full.steps.entries()) {
      console.log(`  step ${i + 1}: ${s.calls.map((c) => `${c.tool}(${JSON.stringify(c.args).slice(0, 60)}:${c.ok ? 'ok' : 'FAIL ' + c.preview.slice(0, 80)})`).join(', ')}`);
    }
    console.log(`  answer: ${full.answer.slice(0, 200)}`);
    const fullCheck = task.check(ownWorkspace());
    console.log(`  completion: ${fullCheck.pass ? 'PASS' : 'FAIL'} (${fullCheck.detail})`);

    const disc = await runDiscover(conns, registry, task.steps, semantic);
    console.log(`\n[discover:${disc.discoveryMethod}] schemaTokens=${disc.schemaTokens} discoveries=${disc.discoveries} statusBar=[${disc.statusBar.join(', ')}] time=${(disc.elapsedMs / 1000).toFixed(0)}s toolCalls=${disc.toolCalls}`);
    for (const need of disc.needs) console.log(`  need: "${need.slice(0, 120)}"`);
    for (const [i, s] of disc.steps.entries()) {
      console.log(`  step ${i + 1}: ${s.calls.map((c) => `${c.tool}(${JSON.stringify(c.args).slice(0, 60)}:${c.ok ? 'ok' : 'FAIL ' + c.preview.slice(0, 80)})`).join(', ')}`);
    }
    console.log(`  answer: ${disc.answer.slice(0, 200)}`);
    const discCheck = task.check(ownWorkspace());
    console.log(`  completion: ${discCheck.pass ? 'PASS' : 'FAIL'} (${discCheck.detail})`);
  } finally {
    await closeAll(conns);
  }
}

async function cmdEval(semantic: boolean): Promise<void> {
  console.log('\n=== Experiment 4-1: Full-inject vs Discover (3 tasks) ===');
  if (!existsSync(ownWorkspace())) mkdirSync(ownWorkspace(), { recursive: true });
  const { conns, registry } = await connectAll(ownWorkspace());
  try {
    const indexTokens = approxTokens(thinIndex(registry));
    console.log(`Registry: ${registry.length} tools. Thin index ≈ ${indexTokens} tokens (always visible in discover arm).`);
    const stamp = Date.now();
    const tasks = buildTasks(stamp);
    let fullTokens = 0;
    let discTokens = 0;
    let fullTime = 0;
    let discTime = 0;
    let fullPass = 0;
    let discPass = 0;
    let needTotal = 0;
    let needFound = 0;
    for (const task of tasks) {
      console.log(`\n--- ${task.id} ---`);
      try {
        const full = await runFullInject(conns, registry, task.steps);
        const fullCheck = task.check(ownWorkspace());
        fullTokens += full.schemaTokens;
        fullTime += full.elapsedMs;
        if (fullCheck.pass) fullPass += 1;
        console.log(`full-inject: ${fullCheck.pass ? 'PASS' : 'FAIL'} tokens=${full.schemaTokens} time=${(full.elapsedMs / 1000).toFixed(0)}s calls=${full.toolCalls}`);
      } catch (err) {
        console.log(`full-inject: ERROR (${err instanceof Error ? err.message : String(err)})`);
      }

      try {
        const disc = await runDiscover(conns, registry, task.steps, semantic);
        const discCheck = task.check(ownWorkspace());
        discTokens += disc.schemaTokens;
        discTime += disc.elapsedMs;
        if (discCheck.pass) discPass += 1;
        const found = task.needs.filter((n) => disc.statusBar.includes(n));
        needTotal += task.needs.length;
        needFound += found.length;
        console.log(`discover:    ${discCheck.pass ? 'PASS' : 'FAIL'} tokens=${disc.schemaTokens} discoveries=${disc.discoveries}(${disc.discoveryMethod}) time=${(disc.elapsedMs / 1000).toFixed(0)}s calls=${disc.toolCalls} statusBar=[${disc.statusBar.join(', ')}]`);
        console.log(`  needed-tools found: ${found.length}/${task.needs.length} [${found.join(', ') || 'none'}] (needed: [${task.needs.join(', ')}])`);
      } catch (err) {
        needTotal += task.needs.length;
        console.log(`discover:    ERROR (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    console.log('\n----------------------------------------------------');
    console.log(`Arm          Pass    SchemaTokens    Time`);
    console.log(`full-inject  ${fullPass}/${tasks.length}     ${fullTokens}          ${(fullTime / 1000).toFixed(0)}s`);
    console.log(`discover     ${discPass}/${tasks.length}     ${discTokens}          ${(discTime / 1000).toFixed(0)}s`);
    console.log(`needed-tools discovered: ${needFound}/${needTotal}`);
    const receipt = writeReceipt(registry.length, {
      eval: { fullPass, discPass, fullTokens, discTokens, semantic, needFound, needTotal },
    });
    console.log(`receipt: ${receipt}`);
    console.log('\nRead: tokens and time first; completion second — small samples tie easily (official: 3/3 both, "未证明准确率提升").');
  } finally {
    await closeAll(conns);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  try {
    if (args.mode === 'eval') await cmdEval(args.semantic);
    else if (args.mode === 'list') await cmdList();
    else await cmdDemo(args.semantic);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    console.error('Note: live arms need Ollama (`ollama serve` + gemma4) and sibling servers installed (npm install in 2./4./5.).');
    process.exit(1);
  }
}

main();
