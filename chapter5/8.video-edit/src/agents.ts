// agents.py 对应：Proposer（需求解析/边界修正）+ VideoAnalyzer（两步 Vision 定位）+ Reviewer（抽帧审核）。
// Vision 经 Ollama chat images（base64 多图一次问），文本走普通 chat。
import { Ollama } from 'ollama';
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { extractFrame } from './video.js';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

function ollama(): Ollama {
  return new Ollama({ host: BASE_URL });
}

async function chatText(system: string, user: string): Promise<string> {
  const p = ollama().chat({
    model: MODEL,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    options: { temperature: 0 },
  });
  const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ollama timeout')), CHAT_TIMEOUT_MS));
  return (((await Promise.race([p, timer])).message.content) || '').trim();
}

async function chatVision(prompt: string, imagePaths: string[]): Promise<string> {
  const images = imagePaths.map((f) => readFileSync(f).toString('base64'));
  const p = ollama().chat({
    model: MODEL,
    messages: [{ role: 'user', content: prompt, images }],
    options: { temperature: 0 },
  });
  const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ollama timeout')), CHAT_TIMEOUT_MS * 2));
  return (((await Promise.race([p, timer])).message.content) || '').trim();
}

function extractJson(raw: string): Record<string, unknown> {
  const fence = raw.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  const body = (fence?.[1] ?? raw).trim();
  const obj = body.match(/\{[\s\S]*\}/);
  try {
    return (obj ? JSON.parse(obj[0]) : {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export interface Intent {
  target_query: string;
  effects: { type: string; text?: string }[];
}

export async function parseRequest(nl: string): Promise<Intent> {
  const raw = await chatText(
    '你是剪辑需求解析器。只输出 JSON：{"target_query": "目标场景英文关键词(hiking/surfing/skiing/cycling 之一)", "effects": [{"type":"subtitle","text":"字幕文字"}]}，无特效则 effects 为 []。',
    `用户需求：${nl}`
  );
  const j = extractJson(raw);
  const q = String(j.target_query ?? nl).toLowerCase();
  const hit = ['hiking', 'surfing', 'skiing', 'cycling'].find((k) => q.includes(k)) ?? nl;
  const effects = Array.isArray(j.effects) ? (j.effects as Intent['effects']) : [];
  return { target_query: hit, effects };
}

// 两步定位：粗粒度抽帧找区间 → 细粒度窗口内找精确边界。返回秒。
export async function locate(video: string, target: string, frameDir: string, coarseStep = 10, fineStep = 1): Promise<{ start: number; end: number; coarseReason: string; fineReason: string }> {
  // 粗：0,10,20,30 各一帧，一次问
  const coarseTs = [0, 10, 20, 30];
  const coarseFrames = [];
  for (const t of coarseTs) coarseFrames.push(await extractFrame(video, t + 1, `${frameDir}/coarse_${t}.png`));
  const coarseAns = await chatVision(
    `这4张图按时间顺序来自 0s/10s/20s/30s 附近，每张中央有个英文场景大字。目标场景"${target}"出现在第几张？只输出 JSON：{"index": 0-3的数字, "reason": "看到的字"}`,
    coarseFrames
  );
  const cj = extractJson(coarseAns);
  const idx = Math.max(0, Math.min(3, Number(cj.index ?? 1)));
  const winStart = idx * 10;
  const coarseReason = String(cj.reason ?? coarseAns).slice(0, 80);
  // 细：窗口内每 fineStep 一帧，一次问边界
  const fineTs: number[] = [];
  for (let t = winStart; t < winStart + 10; t += fineStep) fineTs.push(t);
  const fineFrames = [];
  for (const t of fineTs) fineFrames.push(await extractFrame(video, Math.min(t + 0.5, 39.5), `${frameDir}/fine_${t}.png`));
  const fineAns = await chatVision(
    `这些图按时间顺序来自 ${winStart}s 起每${fineStep}s 一帧（共${fineFrames.length}张），每张中央有场景大字。目标"${target}"从第几张开始出现、到第几张结束？只输出 JSON：{"from": 起始序号(0起), "to": 结束序号, "reason": "依据"}`,
    fineFrames
  );
  const fj = extractJson(fineAns);
  const from = Math.max(0, Math.min(fineTs.length - 1, Number(fj.from ?? 0)));
  const to = Math.max(from, Math.min(fineTs.length - 1, Number(fj.to ?? fineTs.length - 1)));
  return {
    start: (fineTs[from] as number),
    end: Math.min((fineTs[to] as number) + fineStep, 40),
    coarseReason,
    fineReason: String(fj.reason ?? fineAns).slice(0, 80),
  };
}

export interface Review {
  pass: boolean;
  score: number;
  feedback: string;
}

export async function review(clip: string, target: string, frameDir: string): Promise<Review> {
  const dur = 3;
  const frames = [];
  for (const t of [0.5, 1.5, 2.5].slice(0, dur)) frames.push(await extractFrame(clip, t, `${frameDir}/rev_${t}.png`));
  const raw = await chatVision(
    `这是剪出的视频片段的3个关键帧。目标场景应为"${target}"（画面中央大字）。只输出 JSON：{"pass": true/false（3帧是否都是目标场景）, "score": 0-100, "feedback": "一句话"}`,
    frames
  );
  const j = extractJson(raw);
  return { pass: j.pass === true, score: Number(j.score ?? 0), feedback: String(j.feedback ?? raw).slice(0, 120) };
}

export async function reviseBounds(start: number, end: number, feedback: string, total: number): Promise<[number, number]> {
  const raw = await chatText(
    '你是剪辑修正器。只输出 JSON：{"start": 秒数, "end": 秒数}。',
    `当前片段 [${start}, ${end}]（总时长 ${total}s）。审核反馈：${feedback}。请修正边界。`
  );
  const j = extractJson(raw);
  const ns = Math.max(0, Number(j.start ?? start));
  const ne = Math.min(total, Number(j.end ?? end));
  return [ns, ne > ns ? ne : ns + 1];
}
