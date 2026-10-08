// neutral_trace.py 对应：思考拆 text（可带走）/ credential（不可带走）双槽；
// 工具调用只记名+参数，id 重铸；native 保留原样 payload 仅供直传臂。
// 本地声明：Ollama 无签名机制，credential 恒为 null（kind=plaintext），结构保留。
export interface Reasoning {
  text: string | null;
  credential: string | null;
  issuer: string;
  kind: 'plaintext' | 'signed' | 'summary';
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  call_id: string;
}

export function fingerprint(c: Pick<ToolCall, 'name' | 'args'>): string {
  return `${c.name}(${JSON.stringify(c.args, Object.keys(c.args).sort())})`;
}

export interface Step {
  role: 'user' | 'assistant' | 'tool';
  text: string | null;
  reasoning?: Reasoning | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  tool_name?: string;
  issuer?: string;
  native?: unknown;
}

export class Trace {
  steps: Step[] = [];
  add(s: Step): void { this.steps.push(s); }
  user(text: string): void { this.add({ role: 'user', text }); }
  toolResult(call_id: string, name: string, text: string): void {
    this.add({ role: 'tool', text, tool_call_id: call_id, tool_name: name });
  }
  calledFingerprints(): string[] {
    return this.steps.flatMap((s) => (s.tool_calls ?? []).map(fingerprint));
  }
}
