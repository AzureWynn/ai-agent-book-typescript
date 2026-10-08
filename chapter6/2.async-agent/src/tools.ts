// tools.ts —— LLM 工具定义 + 本地执行（对应官方 runtime.py 的 TOOL_SCHEMAS / _exec_tool）
//
// 教学点：工具分两类——
//   - run_terminal_command：**异步工具**，调用后立即返回 task_id 占位符，任务在后台跑；
//   - get_current_time / query_task / cancel_task：**同步工具**，立即执行并回填结果。
// 异步工具完成时不会同步返回，而是以"新事件"（async.result）注入对话，由下一轮 LLM 消化。

import type { Tool } from 'ollama';
import type { TaskManager } from './tasks.js';

export const TOOL_SCHEMAS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'run_terminal_command',
      description:
        '异步执行一个受限的真实日志分析子进程。调用后立即返回 task_id，不会阻塞；' +
        '进度来自子进程 stdout。自然完成后，真实返回码、输出哈希和文件分析指标会作为新的系统事件出现。' +
        '取消会终止对应进程。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的终端命令，如 python analyze_logs.py' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: "立即返回当前时间。用于回答用户'现在几点了'之类的即时问题。",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_task',
      description: '查询某个后台异步任务的当前进度与状态。',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string', description: '任务 ID，如 T1' } },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_task',
      description: '按 task_id 取消一个正在运行的后台异步任务。',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string', description: '任务 ID，如 T1' } },
        required: ['task_id'],
      },
    },
  },
];

export interface ToolArgs {
  task_id?: string;
  command?: string;
}

/** 执行工具，返回给 LLM 的文本结果（同步、就地执行） */
export function execTool(name: string, args: ToolArgs, tasks: TaskManager): string {
  if (name === 'run_terminal_command') {
    const command = args.command ?? '';
    const state = tasks.start(command);
    return (
      `命令已在后台【异步】启动。task_id=${state.taskId}，命令=\`${command}\`。` +
      `我不会阻塞等待；任务完成后其结果会以系统事件形式返回。` +
      `可用 query_task('${state.taskId}') 查询进度或 cancel_task('${state.taskId}') 取消。`
    );
  }
  if (name === 'get_current_time') {
    const now = new Date().toLocaleString('zh-CN', { hour12: false });
    return `当前时间是 ${now}。`;
  }
  if (name === 'query_task') {
    const tid = args.task_id ?? '';
    const st = tasks.query(tid);
    if (!st) return `未找到任务 ${tid}。`;
    return `task_id=${tid} 命令=\`${st.command}\` 状态=${st.status} 进度=${st.progress}%。`;
  }
  if (name === 'cancel_task') {
    const tid = args.task_id ?? '';
    const st = tasks.query(tid);
    const progress = st ? `${st.progress}%` : '未知';
    const ok = tasks.cancel(tid);
    return ok
      ? `任务 ${tid} 已取消（取消时进度 ${progress}）。`
      : `任务 ${tid} 无法取消（可能已完成或不存在）。`;
  }
  return `未知工具：${name}`;
}
