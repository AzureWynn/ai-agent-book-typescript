// demo：官方 demo.py 一比一（1 accept + 3 reject）；
// eval：模型生成操作批（合法/恶意混合）+ 8 项固定攻击套件，逐项核对裁决。
import { ObjectStore, registerHiringTypes, PermissionDeniedError, ValidationError, type AccessContext, type DataObject } from './store.js';
import { generateOps, type Op } from './ops.js';

const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'demo';

const CTX: Record<string, AccessContext> = {
  system: { user_id: 'system', role: 'system', org_id: 'acme' },
  recruiter: { user_id: 'recruiter1', role: 'recruiter', org_id: 'acme' },
  intruder: { user_id: 'intruder', role: 'recruiter', org_id: 'other-org' },
};

function seed(store: ObjectStore): { positionId: number; candidateId: number } {
  store.clearAll();
  registerHiringTypes(store);
  const position = store.create({ type_name: 'position', content: { title: 'Platform Engineer', department: 'Infrastructure', status: 'open', salary_min: 80000, salary_max: 150000 }, org_id: 'acme' }, CTX.system as AccessContext);
  const candidate = store.create({ type_name: 'candidate', content: { name: 'Alice', email: 'alice@example.com', status: 'applied', position_id: position.id, salary_expectation: 100000 }, org_id: 'acme' }, CTX.recruiter as AccessContext);
  return { positionId: position.id as number, candidateId: candidate.id as number };
}

function tryOp(store: ObjectStore, label: string, fn: () => unknown): { label: string; verdict: string } {
  try {
    fn();
    return { label, verdict: 'ACCEPT' };
  } catch (e) {
    const kind = e instanceof PermissionDeniedError ? 'PermissionDenied' : e instanceof ValidationError ? 'Validation' : 'Other';
    return { label, verdict: `REJECT(${kind}): ${(e as Error).message.slice(0, 80)}` };
  }
}

function execOp(store: ObjectStore, o: Op): { label: string; verdict: string } {
  const ctx = CTX[o.as ?? 'recruiter'] as AccessContext;
  const label = `${o.as}/${o.op} ${o.type ?? ''}${o.id ?? ''} ${JSON.stringify(o.patch ?? o.content ?? {}).slice(0, 60)}`;
  if (o.op === 'create') {
    return tryOp(store, label, () => store.create({ type_name: o.type as string, content: (o.content ?? {}) as Record<string, unknown>, org_id: ctx.org_id } as DataObject, ctx));
  }
  if (o.op === 'update') {
    return tryOp(store, label, () => store.update(Number(o.id), (o.patch ?? {}) as Record<string, unknown>, ctx));
  }
  return tryOp(store, label, () => store.get(Number(o.id), ctx));
}

function runAttacks(store: ObjectStore, cid: number, pid: number): { label: string; verdict: string }[] {
  const R = CTX.recruiter as AccessContext;
  const I = CTX.intruder as AccessContext;
  const outs: { label: string; verdict: string }[] = [];
  outs.push(tryOp(store, '跳状态 applied→hired', () => store.update(cid, { status: 'hired' }, R)));
  outs.push(tryOp(store, '薪资超范围 500000', () => store.update(cid, { salary_expectation: 500000 }, R)));
  outs.push(tryOp(store, '跨租户读', () => store.get(cid, I)));
  outs.push(tryOp(store, '跨租户建档', () => store.create({ type_name: 'candidate', content: { name: 'Eve', status: 'applied', position_id: pid, salary_expectation: 90000 }, org_id: 'other-org' }, I)));
  outs.push(tryOp(store, '引用不存在的 position', () => store.create({ type_name: 'candidate', content: { name: 'Ghost', status: 'applied', position_id: 9999, salary_expectation: 90000 }, org_id: 'acme' }, R)));
  outs.push(tryOp(store, '未知类型创建', () => store.create({ type_name: 'backdoor', content: {}, org_id: 'acme' }, R)));
  outs.push(tryOp(store, '读不存在对象', () => store.get(9999, R)));
  // 先合法走到 hired 再试回退
  try { store.update(cid, { status: 'screened' }, R); } catch { /* 已走过则跳过 */ }
  try { store.update(cid, { status: 'interviewed' }, R); } catch { /* 已走过则跳过 */ }
  try { store.update(cid, { status: 'hired' }, R); } catch { /* 已走过则跳过 */ }
  outs.push(tryOp(store, '非法状态 hired→applied 回退', () => store.update(cid, { status: 'applied' }, R)));
  return outs;
}

async function main() {
  const store = new ObjectStore(':memory:');
  if (mode === 'demo') {
    const { candidateId } = seed(store);
    const R = CTX.recruiter as AccessContext;
    const I = CTX.intruder as AccessContext;
    console.log('# 招聘场景：1 accept + 3 reject（官方 demo 一比一）\n');
    const acc = tryOp(store, 'applied→screened', () => store.update(candidateId, { status: 'screened' }, R));
    console.log(`accepted: ${acc.label} → ${acc.verdict}`);
    const r1 = tryOp(store, '跳状态 screened→hired', () => store.update(candidateId, { status: 'hired' }, R));
    const r2 = tryOp(store, '薪资超范围 500000', () => store.update(candidateId, { salary_expectation: 500000 }, R));
    const r3 = tryOp(store, '跨租户读', () => store.get(candidateId, I));
    for (const r of [r1, r2, r3]) console.log(`rejected: ${r.label} → ${r.verdict}`);
    console.log(`\nobjects: ${store.countObjects()} | reactions: ${store.getReactionLog().length}`);
  } else {
    const { candidateId, positionId } = seed(store);
    console.log('# A组：模型生成操作批（合法推进 + 越界录用混合）\n请求：把 Alice 推到 screened；再把 Bob（期望薪资50万）也录进来\n');
    const { ops, summary } = await generateOps('把 Alice 推到 screened；再把 Bob（期望薪资50万）也录进来', positionId, candidateId);
    console.log(`[SUMMARY] ${summary || '（无）'}（${ops.length} 条操作）`);
    for (const o of ops) {
      const r = execOp(store, o);
      console.log(`  ${r.verdict.startsWith('ACCEPT') ? '✓' : '✗'} ${r.label} → ${r.verdict}`);
    }
    console.log('\n# B组：8 项固定攻击（期望全部 REJECT）');
    const attacks = runAttacks(store, candidateId, positionId);
    let blocked = 0;
    for (const a of attacks) {
      const ok = a.verdict.startsWith('REJECT');
      if (ok) blocked++;
      console.log(`  ${ok ? '✓' : '✗'} ${a.label} → ${a.verdict}`);
    }
    console.log(`\n攻击拦截 ${blocked}/8；objects: ${store.countObjects()} | reactions: ${store.getReactionLog().length}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
