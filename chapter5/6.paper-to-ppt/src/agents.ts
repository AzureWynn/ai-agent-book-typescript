// agents.py 对应：单臂（一次写 6 页）vs 双臂（planner 大纲 + 每页独立 builder）。
// Vision 评分：每页 0-100（标题可读/要点相关/原图出现且相关），双盲同 prompt。
import { Ollama } from 'ollama';
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import type { Slide } from './slides.js';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

async function chatText(system: string, user: string, timeoutMs = CHAT_TIMEOUT_MS): Promise<{ text: string; promptChars: number }> {
  const ollama = new Ollama({ host: BASE_URL });
  const p = ollama.chat({
    model: MODEL,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    options: { temperature: 0 },
  });
  const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ollama timeout')), timeoutMs));
  const res = await Promise.race([p, timer]);
  return { text: ((res.message.content) || '').trim(), promptChars: (system + user).length };
}

async function chatVision(prompt: string, imagePath: string): Promise<string> {
  const ollama = new Ollama({ host: BASE_URL });
  const p = ollama.chat({
    model: MODEL,
    messages: [{ role: 'user', content: prompt, images: [readFileSync(imagePath).toString('base64')] }],
    options: { temperature: 0 },
  });
  const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ollama timeout')), CHAT_TIMEOUT_MS * 2));
  return ((((await Promise.race([p, timer])).message.content)) || '').trim();
}

export function extractSlides(raw: string): Slide[] {
  const fence = raw.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  const body = (fence?.[1] ?? raw).trim();
  const arr = body.match(/\[[\s\S]*\]/);
  try {
    const parsed: unknown = JSON.parse(arr?.[0] ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return (parsed as Record<string, unknown>[]).slice(0, 6).map((s) => ({
      title: String(s.title ?? 'Untitled').slice(0, 60),
      bullets: (Array.isArray(s.bullets) ? s.bullets : []).slice(0, 4).map((b) => String(b).slice(0, 90)),
      figure: s.figure === 'fig1' ? 'fig1' : undefined,
    }));
  } catch {
    return [];
  }
}

const PAGE_CONTRACT = `Write in ENGLISH (the renderer has no CJK font; Chinese will render as boxes).
Output a JSON array (6 slides in order: title/problem/method/architecture/results/conclusion).
Each slide {"title": "…", "bullets": ["…"(max 4)], "figure": only the architecture slide sets "fig1"}.
Output only a \`\`\`json array, no explanation.`;

export interface ArmResult {
  arm: string;
  slides: Slide[];
  calls: number;
  promptChars: number;
  peakChars: number;
}

// 单臂：全文一次写 6 页
export async function runSingle(paperText: string): Promise<ArmResult> {
  const user = `Paper text (first 8000 chars):\n${paperText.slice(0, 8000)}\n\nTask: make a 6-slide sharing deck for this paper, IN ENGLISH. ${PAGE_CONTRACT}`;
  const system = 'You are an academic sharing assistant. Write slide outlines and bullets in ENGLISH.';
  const r = await chatText(system, user);
  const slides = extractSlides(r.text);
  if (!slides.some((s) => s.figure === 'fig1') && slides[3]) slides[3].figure = 'fig1';
  return { arm: 'single', slides, calls: 1, promptChars: r.promptChars, peakChars: r.promptChars };
}

// 双臂：planner 只出 6 页大纲（一句话/页）→ 每页 builder 只拿 gig 纲+对应章节片段
export async function runDual(paperText: string): Promise<ArmResult> {
  const text = paperText.slice(0, 8000);
  const plan = await chatText(
    'You are a slide planner. Output only a 6-slide outline, IN ENGLISH.',
    `Paper text (truncated):\n${text}\n\nOutput a \`\`\`json array of 6 items: {"section": "title/problem/method/architecture/results/conclusion", "hint": "one-line point, ENGLISH", "figure": "fig1" only for architecture else ""}.`
  );
  let calls = 1;
  let promptChars = plan.promptChars;
  let peak = plan.promptChars;
  const outline = plan.text;
  const fence = outline.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  let items: { section?: string; hint?: string; figure?: string }[] = [];
  try {
    const arr = (fence?.[1] ?? outline).match(/\[[\s\S]*\]/);
    const parsed: unknown = JSON.parse(arr?.[0] ?? '[]');
    if (Array.isArray(parsed)) items = parsed as typeof items;
  } catch { items = []; }
  while (items.length < 6) items.push({ section: `第${items.length + 1}页`, hint: '基于论文写要点' });
  items = items.slice(0, 6);
  // 保底：6 页里必须有一页挂原图（优先 planner 点名的 architecture 页，否则第 4 页）
  if (!items.some((it) => it.figure === 'fig1')) {
    const arch = items.findIndex((it) => /architect/i.test(String(it.section ?? '')));
    (items[arch >= 0 ? arch : 3] as { figure?: string }).figure = 'fig1';
  }
  const slides: Slide[] = [];
  for (const it of items) {
    const r = await chatText(
      'You are a slide writer. Write exactly one slide, IN ENGLISH.',
      `Outline: ${it.section} — ${it.hint}. Paper excerpt:\n${text.slice(0, 2000)}\n\nOutput a \`\`\`json single object {"title": "…", "bullets": ["…"(max 4)]}${it.figure === 'fig1' ? ', "figure": "fig1"' : ''}.`
    );
    calls++;
    promptChars += r.promptChars;
    peak = Math.max(peak, r.promptChars);
    const one = extractSlides(`[${r.text.match(/\{[\s\S]*\}/)?.[0] ?? ''}]`);
    const slide = one[0] ?? { title: String(it.section ?? 'Untitled'), bullets: [String(it.hint ?? '')] };
    // builder 常漏掉 figure 字段：按大纲位置补回来，不指望模型自觉
    if (it.figure === 'fig1') slide.figure = 'fig1';
    slides.push(slide);
  }
  return { arm: 'dual', slides, calls, promptChars: promptChars, peakChars: peak };
}

export async function scoreSlide(png: string, expectFigure: boolean): Promise<{ score: number; note: string }> {
  const raw = await chatVision(
    `这是一页学术分享幻灯片截图。打分 0-100：标题是否可读（30）、要点是否像论文内容而非乱码（40）、${expectFigure ? '右下角是否有模型结构图（30）' : '版面是否干净（30）'}。只输出 JSON：{"score": 数字, "note": "一句话"}`,
    png
  );
  const m = raw.match(/\{[\s\S]*\}/);
  try {
    const j = (m ? JSON.parse(m[0]) : {}) as { score?: unknown; note?: unknown };
    return { score: Math.max(0, Math.min(100, Number(j.score ?? 0))), note: String(j.note ?? raw).slice(0, 80) };
  } catch {
    return { score: 0, note: raw.slice(0, 80) };
  }
}
