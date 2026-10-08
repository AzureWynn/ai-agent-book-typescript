// demo：默认需求全链；eval：两需求（冲浪 / 滑雪+字幕）对照表，定位误差≤3s 验收。
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync, existsSync } from 'node:fs';
import { GROUND_TRUTH, makeTestVideo, probeDuration, cutClip } from './video.js';
import { parseRequest, locate, review, reviseBounds } from './agents.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'output');
const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'demo';

function matchGT(query: string): string | null {
  const q = query.toLowerCase();
  for (const k of Object.keys(GROUND_TRUTH)) if (q.includes(k)) return k;
  const zh: Record<string, string> = { '冲浪': 'surfing', '徒步': 'hiking', '滑雪': 'skiing', '骑': 'cycling' };
  for (const [k, v] of Object.entries(zh)) if (q.includes(k)) return v;
  return null;
}

async function runOnce(request: string, tag: string, trace: boolean, maxRounds = 3) {
  const source = join(OUT, `${tag}_source.mp4`);
  await makeTestVideo(ROOT, source);
  const total = await probeDuration(source);
  const intent = await parseRequest(request);
  if (trace) console.log(`[解析] target=${intent.target_query} effects=${JSON.stringify(intent.effects)}`);
  const loc = await locate(source, intent.target_query, join(OUT, `${tag}_frames`));
  if (trace) console.log(`[定位] [${loc.start}, ${loc.end}]（粗：${loc.coarseReason} / 细：${loc.fineReason}）`);
  const key = matchGT(intent.target_query);
  const gt = key ? GROUND_TRUTH[key] as [number, number] : null;
  const err: [number, number] | null = gt ? [Math.abs(loc.start - gt[0]), Math.abs(loc.end - gt[1])] : null;

  let plan = { start: loc.start, end: loc.end };
  const subtitle = intent.effects.find((e) => e.type === 'subtitle')?.text;
  let srt: string | null = null;
  let final = '';
  let rounds = 0;
  let passed = false;
  for (let r = 1; r <= maxRounds; r++) {
    rounds = r;
    const clip = join(OUT, `${tag}_cut${r}.mp4`);
    srt = await cutClip(source, plan.start, plan.end, clip, subtitle);
    const rev = await review(clip, intent.target_query, join(OUT, `${tag}_rev`));
    if (trace) console.log(`[R${r}] pass=${rev.pass} score=${rev.score} ${rev.feedback}`);
    if (rev.pass) { final = clip; passed = true; break; }
    if (r === maxRounds) { final = clip; break; }
    const [ns, ne] = await reviseBounds(plan.start, plan.end, rev.feedback, total);
    plan = { start: ns, end: ne };
  }
  const cdur = await probeDuration(final || join(OUT, `${tag}_cut1.mp4`));
  return { intent, loc, err, rounds, passed, cdur, final, srt };
}

async function main() {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  if (mode === 'demo') {
    console.log('# 默认需求：把冲浪的部分剪出来\n');
    const r = await runOnce('把冲浪的部分剪出来', 'demo', true);
    console.log(`\n定位 [${r.loc.start}, ${r.loc.end}] 误差 ${r.err?.join('/') ?? '无真值'}s（验收≤3s）`);
    console.log(`审核${r.passed ? '通过' : '未通过'}（${r.rounds}轮），成片 ${r.cdur.toFixed(1)}s：${r.final}`);
  } else {
    const reqs = ['把冲浪的部分剪出来', '把滑雪部分剪出来，并加上字幕 Winter'];
    console.log('\n需求              定位      误差   审核轮  通过  成片   字幕');
    for (let i = 0; i < reqs.length; i++) {
      const r = await runOnce(reqs[i] as string, `eval${i}`, false);
      const ok = r.err !== null && r.err[0] <= 3 && r.err[1] <= 3;
      console.log(`${(reqs[i] as string).slice(0, 14)}  [${r.loc.start},${r.loc.end}]  ${r.err?.join('/') ?? '-'}  ${r.rounds}轮  ${r.passed ? '✓' : '✗'}  ${r.cdur.toFixed(1)}s  ${r.srt ? 'srt✓' : '—'}${ok ? '' : '  (误差超限)'}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
