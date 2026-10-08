// agent.ts —— 事件驱动的 Agent：被唤醒后处理单个事件
//
// 官方核心概念：事件循环逐个取出事件并"唤醒 Agent"。Agent 不主动发起
// 任务，它只响应事件。mock 模式演示机制本身（无需模型），在线模式用
// Ollama 做真实的 ReAct（工具调用）处理。

import ollama from 'ollama';
import type { Message } from 'ollama';
import type { AgentEvent } from './events.js';
import { EventType } from './events.js';
import { executeTool, toolDefinitions } from './tools.js';

export interface EventAgentOptions {
  model: string;
  baseUrl?: string;
  mock?: boolean;
}

const SYSTEM_PROMPT = `你是一个事件驱动的 Agent。你并不主动发起任务，而是被外部事件唤醒后处理它。
收到一个事件时：判断事件内容 → 需要工具就调用工具获取事实 → 给出简洁的处理结果。
事件类型包括：web_message（Web 消息）、im_message（即时消息）、email_reply（邮件）、
github_pr_update（PR 通知）、timer_trigger（定时器到期）、file_change（文件变更）、
system_alert（系统告警）等。回复用中文，控制在 2-3 句话。`;

/** 离线模式：按事件类型打印"模拟动作"，机制演示无需模型 */
function mockHandle(event: AgentEvent): Promise<string> {
  const actions: Record<EventType, string> = {
    [EventType.TIMER_TRIGGER]: '读取定时任务上下文 -> 执行例行检查 -> 汇报结果',
    [EventType.FILE_CHANGE]: '读取文件变更内容 -> 检查是否需要处理 -> 汇报结果',
    [EventType.WEB_MESSAGE]: '解析 Web 消息 -> 按需调用工具 -> 回复',
    [EventType.IM_MESSAGE]: '解析 IM 消息 -> 按需调用工具 -> 回复',
    [EventType.EMAIL_REPLY]: '解析邮件回复 -> 更新任务状态 -> 回复',
    [EventType.GITHUB_PR_UPDATE]: '读取 PR 变更 -> 运行检查 -> 汇报状态',
    [EventType.USER_TIMEOUT]: '标记用户无活动 -> 保存会话状态 -> 汇报',
    [EventType.PROCESS_TIMEOUT]: '检查长任务 -> 决定取消或续跑 -> 汇报',
    [EventType.SYSTEM_ALERT]: '读取告警详情 -> 调用排查工具 -> 上报结论',
  };
  return Promise.resolve(`[模拟动作] ${actions[event.type] ?? '解析事件 -> 处理 -> 汇报'}`);
}

export class EventAgent {
  constructor(private readonly opts: EventAgentOptions) {}

  /** 处理单个事件，返回处理结果文本 */
  async handle(event: AgentEvent): Promise<string> {
    if (this.opts.mock) {
      const action = await mockHandle(event);
      console.log(`🤖 Agent 被唤醒，收到消息: [${event.source}] ${event.content}`);
      console.log(`🛠️  ${action}`);
      return `已响应 ${event.type} 事件`;
    }
    return this.onlineHandle(event);
  }

  private async onlineHandle(event: AgentEvent): Promise<string> {
    const messages: Message[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `事件来源: ${event.source}\n事件类型: ${event.type}\n事件内容: ${event.content}`,
      },
    ];

    // 一轮工具调用循环（上限 3 轮），防止小模型死循环
    for (let round = 0; round < 3; round++) {
      const resp = await ollama.chat({
        model: this.opts.model,
        messages,
        tools: toolDefinitions(),
        stream: false,
        options: { temperature: 0.2 },
      });
      const msg = resp.message;
      if (!msg.tool_calls?.length) {
        return msg.content ?? '(模型未返回内容)';
      }
      // 保留 assistant 消息（含 tool_calls），执行工具，回灌结果
      messages.push(msg);
      for (const call of msg.tool_calls) {
        const fn = call.function;
        const args = (fn.arguments ?? {}) as Record<string, unknown>;
        const result = await executeTool(fn.name, args, event);
        console.log(`   ↳ 调用工具 ${fn.name} -> ${result.slice(0, 120)}`);
        // ollama 的 ToolCall 类型只有 function（无 id），用工具名做关联标识
        messages.push({ role: 'tool', content: result, tool_name: fn.name });
      }
    }
    return '(达到最大工具轮数，未给出最终回复)';
  }
}
