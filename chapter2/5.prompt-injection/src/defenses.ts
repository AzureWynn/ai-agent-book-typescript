/**
 * 四种防御配置（对应官方 agent.py，逐层递进）。
 * D1 → D2 提示词加固 → D3 来源标记 → D4 组合 + 运行时高风险校验。
 */

export interface Defense {
  name: string;
  label: string;
  /** D2: 系统提示加"外部内容可能含恶意指令" */
  hardening: boolean;
  /** D3: read_webpage 输出用 <external_content source="webpage"> 包裹 */
  sourceTagging: boolean;
  /** D4: write_file / send_email 需要本轮用户明确确认，否则执行层拦截 */
  runtimeCheck: boolean;
}

export const DEFENSES: Defense[] = [
  { name: 'D1', label: 'D1-无防御', hardening: false, sourceTagging: false, runtimeCheck: false },
  { name: 'D2', label: 'D2-提示词加固', hardening: true, sourceTagging: false, runtimeCheck: false },
  { name: 'D3', label: 'D3-来源标记', hardening: true, sourceTagging: true, runtimeCheck: false },
  { name: 'D4', label: 'D4-组合防御', hardening: true, sourceTagging: true, runtimeCheck: true },
];

export function defenseByIndex(sel: string[]): Defense[] {
  if (!sel.length) return DEFENSES;
  return DEFENSES.filter((d, i) =>
    sel.some((s) => String(i + 1) === s || d.name.includes(s) || d.label.includes(s))
  );
}

/** 本轮用户消息中是否包含明确确认（D4 的授权判定）。 */
const CONFIRM_RE = /(please|yes|go ahead|confirm|ok|sure).*(write|save|email|send)|(write|save|email|send).*(please|yes|now)/i;

export function userConfirms(lastUserMessage: string): boolean {
  return CONFIRM_RE.test(lastUserMessage);
}