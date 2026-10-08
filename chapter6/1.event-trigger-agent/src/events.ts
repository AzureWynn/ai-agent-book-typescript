// events.ts —— 事件类型与事件格式（对应官方 EventType / Event 结构）

export enum EventType {
  // 外部输入事件
  WEB_MESSAGE = 'web_message',           // Web 界面消息
  IM_MESSAGE = 'im_message',             // 即时通讯消息
  EMAIL_REPLY = 'email_reply',           // 邮件回复
  GITHUB_PR_UPDATE = 'github_pr_update', // GitHub PR 通知
  TIMER_TRIGGER = 'timer_trigger',       // 定时任务（一次性 / 循环）
  FILE_CHANGE = 'file_change',           // 文件监听（创建 / 修改）

  // 系统提醒事件
  USER_TIMEOUT = 'user_timeout',         // 用户无活动
  PROCESS_TIMEOUT = 'process_timeout',   // 长任务超时
  SYSTEM_ALERT = 'system_alert',         // 系统告警
}

export interface AgentEvent {
  id: string;
  type: EventType;
  /** 事件携带的"观察"：事件本身是环境给 Agent 的输入 */
  content: string;
  metadata: Record<string, unknown>;
  receivedAt: number;
  /** 事件来源（触发器名 / HTTP 端点等），便于追踪 */
  source: string;
}

let seq = 0;
export function makeEvent(
  type: EventType,
  content: string,
  source: string,
  metadata: Record<string, unknown> = {},
): AgentEvent {
  return {
    id: `${Date.now()}-${seq++}`,
    type,
    content,
    metadata,
    receivedAt: Date.now(),
    source,
  };
}
