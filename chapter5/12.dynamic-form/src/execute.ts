// 真执行验收：jsdom 跑模型表单里的内联 JS（官方 Playwright/Chromium 的轻量诚实替代）。
// 流程：载入→断言返程默认隐藏→填出发城市/日期→切往返→断言返程可见→填返程→提交→读 #result→计数。
// 与官方差异如实声明：jsdom 无布局/无真实渲染，visibility 以 style.display 为准。
import { JSDOM } from 'jsdom';
import { SUBMISSION } from './prompts.js';

export interface ExecResult {
  initialHidden: boolean;
  visibleAfterRoundTrip: boolean;
  submitCount: number;
  submitted: Record<string, unknown> | null;
  error?: string;
}

export async function executeForm(html: string): Promise<ExecResult> {
  try {
    const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
    const jsWindow = dom.window as unknown as Record<string, unknown>;
    const document = dom.window.document;
    const window = dom.window;
    // jsdom 里 DOMContentLoaded 异步触发：等模型的初始化脚本跑完再动手，
    // 否则级联监听还没挂上，看到的都是"没反应"的假阴性。
    await new Promise<void>((resolveP) => {
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(() => resolveP(), 50);
      } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(() => resolveP(), 50), { once: true });
        setTimeout(() => resolveP(), 1000);
      }
    });
    const form = document.querySelector('form');
    if (!form) return { initialHidden: false, visibleAfterRoundTrip: false, submitCount: 0, submitted: null, error: '找不到 <form>' };

    const retBox = document.getElementById('return_date_field')
      ?? document.querySelector('[name="return_date"]')?.closest('div') ?? null;
    const isHidden = (el: Element | null): boolean => {
      if (!el) return false;
      const e = el as HTMLElement;
      if (e.style && e.style.display === 'none') return true;
      const cs = window.getComputedStyle ? window.getComputedStyle(e) : null;
      return cs?.display === 'none';
    };
    const initialHidden = isHidden(retBox);

    const set = (name: string, value: string) => {
      const el = document.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
      if (!el) throw new Error(`找不到字段 ${name}`);
      el.value = value;
      el.dispatchEvent(new window.Event('input', { bubbles: true }));
      el.dispatchEvent(new window.Event('change', { bubbles: true }));
    };
    set('departure_city', SUBMISSION.departure_city);
    set('departure_date', SUBMISSION.departure_date);

    const roundTrip = document.querySelector('[name="trip_type"][value="round_trip"]') as HTMLInputElement | null;
    if (!roundTrip) throw new Error('找不到 trip_type=round_trip 单选项');
    roundTrip.checked = true;
    roundTrip.dispatchEvent(new window.Event('change', { bubbles: true }));
    form.dispatchEvent(new window.Event('change', { bubbles: true }));

    const visibleAfterRoundTrip = !isHidden(retBox);
    set('return_date', SUBMISSION.return_date);

    const win = jsWindow;
    win.__submitCount = 0;
    form.addEventListener('submit', () => {
      win.__submitCount = Number(win.__submitCount ?? 0) + 1;
    });
    const btn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])') as HTMLElement | null;
    if (!btn) throw new Error('找不到提交按钮');
    // jsdom 未实现 requestSubmit（btn.click 会抛错），直接派发 submit 事件：
    // 模型的 preventDefault 监听与计数监听都会触发，语义等价。
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

    const resultEl = document.querySelector('#result');
    const text = (resultEl?.textContent || '').trim();
    let submitted: Record<string, unknown> | null = null;
    try { submitted = text ? JSON.parse(text) as Record<string, unknown> : null; } catch { /* 非 JSON */ }
    const submitCount = Number(win.__submitCount ?? 0);
    dom.window.close();
    return { initialHidden, visibleAfterRoundTrip, submitCount: submitCount > 0 ? submitCount : (submitted ? 1 : 0), submitted };
  } catch (e) {
    return { initialHidden: false, visibleAfterRoundTrip: false, submitCount: 0, submitted: null, error: (e as Error).message };
  }
}
