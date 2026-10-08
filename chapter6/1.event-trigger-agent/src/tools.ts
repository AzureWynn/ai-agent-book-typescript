// tools.ts —— 事件场景的确定性工具
//
// 教学重点：事件驱动的 Agent 工具通常不是"用户一问一答"的工具，而是
// "针对事件内容做例行动作"的工具。这里保持小而有代表性。

import type { AgentEvent } from './events.js';

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>, event: AgentEvent) => Promise<string>;
}

/** 模拟：返回"最近一次备份时间"，让 Agent 判断备份是否逾期 */
async function runBackupCheck(): Promise<string> {
  const last = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 小时前
  return JSON.stringify({
    last_backup_at: last.toISOString(),
    status: 'ok',
    note: '每日备份应在 24h 内完成，本次未逾期',
  });
}

/** 把一条通知写入 notifications.log（项目根目录），演示事件驱动 Agent 的动作落盘 */
async function notify(severity: string, message: string): Promise<string> {
  const { appendFile } = await import('node:fs/promises');
  const line = `[${new Date().toISOString()}] ${severity}: ${message}\n`;
  const logPath = new URL('../notifications.log', import.meta.url);
  await appendFile(logPath, line);
  return JSON.stringify({ written: true, file: logPath.pathname });
}

export const tools: ToolDef[] = [
  {
    name: 'run_backup_check',
    description: '检查每日备份是否已经完成，返回最近备份时间与状态。用于定时器触发的事件。',
    parameters: {
      type: 'object',
      properties: {},
    },
    run: () => runBackupCheck(),
  },
  {
    name: 'notify',
    description: '把一条告警/通知写入 notifications.log。用于系统告警或需要记录结果的事件。',
    parameters: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['info', 'warn', 'error'] },
        message: { type: 'string' },
      },
      required: ['severity', 'message'],
    },
    run: async (args) => notify(String(args.severity ?? 'info'), String(args.message ?? '')),
  },
];

export function toolDefinitions() {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  event: AgentEvent,
): Promise<string> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return JSON.stringify({ error: `未知工具: ${name}` });
  return tool.run(args, event);
}
