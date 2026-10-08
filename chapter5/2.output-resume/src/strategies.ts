// 三恢复策略（官方 recover 对应）：resend 整轮重发 / prefill 半截作前缀 / meta 元指令断点续。
// reasoning 断点本地 N/A：半截思考无处回传，本就退化整轮重发。
import { chatOnce, TASK_TEXT, TASK_JSON, type ChatMsg } from './stream.js';
import type { BreakPoint } from './stream.js';

export type Strategy = 'resend' | 'prefill' | 'meta';

export const RECOVERY_HINT = '上一次回复在传输中被截断了。请紧接着已输出内容往下写，把剩下部分补完；不要重复已输出的字符，不要新增字段，也不要改写已输出部分。';

export async function recover(bp: BreakPoint, strategy: Strategy, partial: string): Promise<{ text: string; outTokens: number; full: string }> {
  const task = bp === 'text' ? TASK_TEXT : TASK_JSON;
  if (strategy === 'resend') {
    const r = await chatOnce([{ role: 'user', content: task }]);
    return { text: r.text, outTokens: r.outTokens, full: r.text };
  }
  if (strategy === 'prefill') {
    // 半截作末尾 assistant 消息 + hint，模型接着写
    const msgs: ChatMsg[] = [
      { role: 'user', content: task },
      { role: 'assistant', content: partial },
      { role: 'user', content: RECOVERY_HINT },
    ];
    const r = await chatOnce(msgs);
    return { text: r.text, outTokens: r.outTokens, full: partial + r.text };
  }
  // meta：只给截断位置看，不给全文前缀
  const shown = partial.slice(-60);
  const r = await chatOnce([
    { role: 'user', content: task },
    { role: 'user', content: `你上一次的回复在这里被截断了：「…${shown}」。请从断点继续，不要重复已经输出的部分。` },
  ]);
  return { text: r.text, outTokens: r.outTokens, full: r.text };
}
