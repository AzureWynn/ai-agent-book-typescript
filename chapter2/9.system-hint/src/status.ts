/**
 * 状态栏（System Hint）构建器。
 *
 * 五种技术，各自可开关：
 *   1. 时间戳          enableTimestamps   —— 当前时间 + 消息时间线
 *   2. 工具调用计数器    enableToolCounter  —— 每个工具调用次数，抑制死循环
 *   3. TODO 列表       enableTodoList     —— pending / in_progress / completed / cancelled
 *   4. 详细错误        enableDetailedErrors —— 上次错误 + 修复建议
 *   5. 系统状态感知     enableSystemState  —— 当前目录 / 平台 / 环境
 */

export interface StatusConfig {
  enableTimestamps: boolean;
  enableToolCounter: boolean;
  enableTodoList: boolean;
  enableDetailedErrors: boolean;
  enableSystemState: boolean;
}

export interface TodoItem {
  id: number;
  text: string;
  state: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

export interface ToolEvent {
  name: string;
  ok: boolean;
}

export interface StatusState {
  cwd: string;
  platform: string;
  toolCalls: Record<string, number>;
  toolEvents: ToolEvent[]; // 最近事件（用于错误展示）
  todos: TodoItem[];
  lastError?: { name: string; args: Record<string, unknown>; message: string; suggestion: string };
  time: Date;
}

const TODO_ICON: Record<TodoItem['state'], string> = {
  pending: '⏳',
  in_progress: '🔄',
  completed: '✅',
  cancelled: '⛔',
};

function fmtTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function toolCountsToText(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (!entries.length) return '（尚无工具调用）';
  return entries.map(([name, n]) => `${name}: ${n} 次`).join('\n');
}

/** 生成状态栏文本。不修改任何状态。 */
export function buildStatusBar(cfg: StatusConfig, state: StatusState): string {
  const parts: string[] = [];
  parts.push('=== SYSTEM STATUS（状态栏，仅本轮有效，不是对话内容）===');

  if (cfg.enableTimestamps) {
    parts.push(`Time: ${fmtTime(state.time)}`);
  }
  if (cfg.enableSystemState) {
    parts.push(`CWD: ${state.cwd}`);
    parts.push(`Platform: ${state.platform}`);
  }
  if (cfg.enableToolCounter) {
    parts.push('');
    parts.push('=== TOOL CALLS ===');
    parts.push(toolCountsToText(state.toolCalls));
    // 计数器引导：同一工具调用过多时提醒收敛
    const overUsed = Object.entries(state.toolCalls).filter(([, n]) => n >= 5);
    if (overUsed.length) {
      parts.push(
        `注意: ${overUsed.map(([n]) => n).join(', ')} 已被多次调用。若未取得进展，请停止重试，改用其他方法或直接总结。`
      );
    }
  }
  if (cfg.enableTodoList) {
    parts.push('');
    parts.push('=== TODO LIST ===');
    if (!state.todos.length) {
      parts.push('（暂无 TODO。若任务需要 3 步以上，先用 update_todo 建立计划）');
    } else {
      for (const t of state.todos) {
        parts.push(`  [${t.id}] ${TODO_ICON[t.state]} ${t.text} (${t.state})`);
      }
    }
  }
  if (cfg.enableDetailedErrors && state.lastError) {
    parts.push('');
    parts.push('=== LAST ERROR ===');
    parts.push(`tool=${state.lastError.name} args=${JSON.stringify(state.lastError.args)}`);
    parts.push(`error=${state.lastError.message}`);
    parts.push(`suggestion=${state.lastError.suggestion}`);
  }
  parts.push('==========================================');
  return parts.join('\n');
}

/** 预览渲染：无状态栏 vs 有状态栏（不发 LLM 调用）。 */
export function renderPreview(cfg: StatusConfig, state: StatusState): string {
  const without = '（无状态栏：模型只能靠对话历史推断时间/工具次数/TODO，容易反复重试或丢失上下文）';
  return `【无状态栏】\n${without}\n\n【有状态栏】\n${buildStatusBar(cfg, state)}`;
}

/** 常见错误的修复建议映射。 */
export function errorSuggestion(name: string, message: string): string {
  if (/ENOENT|not found/i.test(message)) return '文件不存在，先 find 确认路径再读';
  if (/permission|EACCES/i.test(message)) return '权限不足，换用可写目录';
  if (/not a command|command not found/i.test(message)) return '命令不存在，检查拼写或用 read_file 查看说明';
  if (/timeout/i.test(message)) return '命令超时，缩小输入或加超时参数';
  return '检查参数是否正确，必要时换一种工具/思路';
}