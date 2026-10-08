// 0.coding-agent 共享类型：七工具 + 主循环事件 + 任务验收

export type ToolName = 'read' | 'write' | 'edit' | 'glob' | 'grep' | 'bash' | 'runCode';

export interface ToolDef {
  name: ToolName;
  description: string;
  argsHint: string;
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; ok: boolean; output: string }
  | { type: 'format_error'; detail: string }
  | { type: 'done'; answer: string; iterations: number }
  | { type: 'max_iterations'; iterations: number };

export interface AgentOutcome {
  answer: string;
  iterations: number;
  toolCalls: number;
  formatErrors: number;
  finished: boolean;
}

export interface TaskCheck {
  name: string;
  pass: boolean;
  detail: string;
}
