import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GateResult } from './types.js';

const REQUIRED_FILES = ['agent.ts', 'cli.ts', 'test.mts'];
function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((resolvePromise) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? 1 : 0;
      resolvePromise({ code, out: String(stdout ?? '') + String(stderr ?? '') });
    });
  });
}

export async function validateArm(armDir: string): Promise<GateResult[]> {
  const gates: GateResult[] = [];
  const read = (f: string): string => {
    try {
      return readFileSync(join(armDir, f), 'utf-8');
    } catch {
      return '';
    }
  };

  const missing = REQUIRED_FILES.filter((f) => !existsSync(join(armDir, f)));
  gates.push({
    name: 'required-files',
    pass: missing.length === 0,
    detail: missing.length === 0 ? REQUIRED_FILES.join(', ') : `missing: ${missing.join(', ')}`,
  });
  if (missing.length > 0) {
    return [...gates, { name: 'secret-scan', pass: false, detail: 'skipped (files missing)' }, { name: 'compile', pass: false, detail: 'skipped' }, { name: 'protocol', pass: false, detail: 'skipped' }, { name: 'bounded-loop', pass: false, detail: 'skipped' }, { name: 'generated-test', pass: false, detail: 'skipped' }, { name: 'live-run', pass: false, detail: 'skipped' }];
  }

  const allText = REQUIRED_FILES.map(read).join('\n');
  const secretRes = [/sk-[A-Za-z0-9]{8,}/, /AKIA[0-9A-Z]{10,}/, /ghp_[A-Za-z0-9]{8,}/, /xoxb-[A-Za-z0-9-]{8,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /api[_-]?key\s*[:=]\s*['"]([^'"]{8,})['"]/i];
  const PLACEHOLDER = /your|example|test|xxx|\*\*\*|<|>|\.\.\.|placeholder|sample|changeme|demo/i;
  let hit: RegExp | null = null;
  for (const re of secretRes) {
    const m = allText.match(re);
    if (!m) continue;
    const captured = m[1] ?? m[0];
    if (PLACEHOLDER.test(captured)) continue;
    hit = re;
    break;
  }
  gates.push({ name: 'secret-scan', pass: !hit, detail: hit ? `matched ${hit} (non-placeholder value)` : 'no credentials in generated files' });

  const tsc = await (async (): Promise<{ code: number; out: string }> => {
    writeFileSync(
      join(armDir, 'tsconfig.gate.json'),
      JSON.stringify({ compilerOptions: { module: 'nodenext', target: 'esnext', moduleResolution: 'nodenext', strict: true, skipLibCheck: true, types: ['node'], noEmit: true }, include: ['agent.ts', 'cli.ts'] }),
      'utf-8'
    );
    return run('npx', ['tsc', '-p', 'tsconfig.gate.json'], armDir, 120000);
  })();
  gates.push({ name: 'compile', pass: tsc.code === 0, detail: tsc.code === 0 ? 'tsc clean' : tsc.out.slice(0, 200) });

  const agentSrc = read('agent.ts');
  const bounded = /max_?steps|MAX_STEPS/i.test(agentSrc);
  gates.push({ name: 'bounded-loop', pass: bounded, detail: bounded ? 'max-steps constant present' : 'no step bound found' });

  const test = await run('npx', ['tsx', 'test.mts'], armDir, 180000);
  gates.push({ name: 'generated-test', pass: test.code === 0, detail: test.code === 0 ? 'exit 0' : test.out.slice(-300) });

  const live = await run(
    'npx',
    ['tsx', '-e', `import('./agent.js').then(async ({runAgent}) => { const r = await runAgent('Draft release notes for v2.4.0'); console.log('TRACE:' + JSON.stringify(r.trace)); console.log('ANSWER:' + r.answer); });`],
    armDir,
    240000
  );
  const liveOut = live.out;
  const traceOk = /"tool"\s*:\s*".+?"[\s\S]*?"ok"\s*:\s*true/.test(liveOut);
  const keywordOk = /dark mode/i.test(liveOut);
  gates.push({ name: 'protocol', pass: traceOk, detail: traceOk ? 'tool round-trip observed' : 'no tool round-trip in trace' });
  gates.push({ name: 'live-run', pass: keywordOk, detail: keywordOk ? 'answer mentions dark mode' : liveOut.slice(-300) });

  return gates;
}
