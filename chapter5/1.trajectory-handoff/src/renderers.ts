// renderers.py 对应：三臂渲染。direct 原样搬运 chat 消息（含协议杂质）；
// strip 只带任务重启；neutral 转中立叙事（文字带走、credential 丢弃、调用只记名+参数）。
import { Trace } from './trace.js';
import { SYSTEM } from './vendors.js';

export type Arm = 'direct' | 'strip' | 'neutral';

export function renderForB(trace: Trace, arm: Arm, task: string): string {
  if (arm === 'strip') {
    return `${SYSTEM}\n\n用户任务：${task}\n（注意：之前无任何进展，从头开始。）`;
  }
  if (arm === 'direct') {
    const dump = trace.steps
      .map((s) => `[${s.role}]${s.text ?? ''}${(s.tool_calls ?? []).map((c) => ` <tool_call id=${c.call_id} name=${c.name} args=${JSON.stringify(c.args)}>`).join('')}`)
      .join('\n');
    return `${SYSTEM}\n\n用户任务：${task}\n\n以下是上一家厂商的原始消息记录（原样搬运）：\n${dump}\n\n请接着往下做。`;
  }
  // neutral：中立叙事 + 已知结果清单 + 不许重做
  const lines: string[] = [];
  const known: string[] = [];
  for (const s of trace.steps) {
    if (s.role === 'user') lines.push(`用户任务：${s.text}`);
    else if (s.role === 'assistant' && s.text) lines.push(`助手思考：${s.text.slice(0, 300)}`);
    else if (s.role === 'tool') {
      lines.push(`工具 ${s.tool_name} 已返回：${s.text}`);
      known.push(`${s.tool_name}`);
    }
    for (const c of s.tool_calls ?? []) lines.push(`已执行工具调用：${c.name}(${JSON.stringify(c.args)})`);
  }
  return `${SYSTEM}\n\n用户任务：${task}\n\n此前进展（中立格式，已核对）：\n${lines.join('\n')}\n\n已知结果：${known.join('、')}。不要重复调用已执行的工具，直接做剩下步骤，以 FINAL: 结尾。`;
}
