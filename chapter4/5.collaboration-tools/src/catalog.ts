import { ToolDef } from './types.js';
import {
  buildHandoff,
  cancelTask,
  getTask,
  handoffLeaksCanary,
  listTasks,
  sendTaskMessage,
  spawnTask,
} from './subagents.js';
import { listPending, requestApproval, requestInput, respondToRequest } from './hitl.js';
import { NotifyChannel, preflight } from './notify.js';
import { cancelTimer, getTimer, listTimers, setRecurringTimer, setTimer } from './timers.js';
import { boolArg, fail, numArg, ok, strArg } from './types.js';

function taskSummary(id: string): Record<string, unknown> {
  const t = getTask(id);
  if (!t) return { found: false };
  return {
    found: true,
    task_id: t.id,
    status: t.status,
    strategy: t.strategy,
    handoffTokens: t.handoffTokens,
    result: t.result,
    inbox: t.inbox,
  };
}

export const TOOLS: ToolDef[] = [
  {
    name: 'spawn_subagent',
    description: 'Spawn a sub-agent (sync waits, async returns task_id). Strategies: minimal | llm_generated.',
    category: 'subagent',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description' },
        role: { type: 'string', description: 'Sub-agent role', default: 'helper' },
        strategy: { type: 'string', description: 'minimal | llm_generated', default: 'minimal' },
        mode: { type: 'string', description: 'sync | async', default: 'sync' },
        parent_trajectory: { type: 'string', description: 'Parent context for llm_generated', default: '' },
        slice: { type: 'string', description: 'Hand-picked slice for minimal', default: '' },
      },
      required: ['task'],
    },
    handler: async (args) => {
      try {
        const task = strArg(args, 'task');
        if (!task) return fail('task is required', { tool: 'spawn_subagent' });
        const strategy = strArg(args, 'strategy', 'minimal') === 'llm_generated' ? 'llm_generated' : 'minimal';
        const mode = strArg(args, 'mode', 'sync') === 'async' ? 'async' : 'sync';
        let handoff: string;
        let tokens = 0;
        let llmUsed = false;
        try {
          const built = await buildHandoff(task, strategy, strArg(args, 'parent_trajectory'), strArg(args, 'slice') || undefined);
          handoff = built.handoff;
          tokens = built.tokens;
          llmUsed = built.llmUsed;
        } catch (err) {
          return fail(`handoff build failed (${strategy}): ${err instanceof Error ? err.message : String(err)}`, {
            tool: 'spawn_subagent',
            hint: 'llm_generated needs Ollama running; use strategy=minimal offline',
          });
        }
        const entry = spawnTask(task, strArg(args, 'role', 'helper'), handoff, strategy, mode);
        return ok(mode === 'sync' ? `sub-agent done: ${entry.result}` : `sub-agent started: ${entry.id}`, {
          tool: 'spawn_subagent',
          task_id: entry.id,
          strategy,
          handoffTokens: tokens,
          llmUsed,
          canaryLeaked: handoffLeaksCanary(handoff),
          ...(mode === 'sync' ? { status: entry.status, result: entry.result } : { status: entry.status }),
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err), { tool: 'spawn_subagent' });
      }
    },
  },
  {
    name: 'send_message_to_subagent',
    description: 'Send a follow-up message to a running sub-agent.',
    category: 'subagent',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Sub-agent task id' },
        message: { type: 'string', description: 'Follow-up message' },
      },
      required: ['task_id', 'message'],
    },
    handler: async (args) => {
      const delivered = sendTaskMessage(strArg(args, 'task_id'), strArg(args, 'message'));
      return delivered
        ? ok(`message queued for ${strArg(args, 'task_id')}`, { tool: 'send_message_to_subagent' })
        : fail(`task not running: ${strArg(args, 'task_id')}`, { tool: 'send_message_to_subagent' });
    },
  },
  {
    name: 'cancel_subagent',
    description: 'Cancel a running sub-agent.',
    category: 'subagent',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'Sub-agent task id' } },
      required: ['task_id'],
    },
    handler: async (args) => {
      const done = cancelTask(strArg(args, 'task_id'));
      return done
        ? ok(`cancelled ${strArg(args, 'task_id')}`, { tool: 'cancel_subagent' })
        : fail(`cannot cancel (not running): ${strArg(args, 'task_id')}`, { tool: 'cancel_subagent' });
    },
  },
  {
    name: 'get_subagent_status',
    description: 'Get sub-agent status and result (for async tasks).',
    category: 'subagent',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'Sub-agent task id' } },
      required: ['task_id'],
    },
    handler: async (args) => {
      const summary = taskSummary(strArg(args, 'task_id'));
      return summary.found
        ? ok(`status=${String(summary['status'])} result=${String(summary['result'] ?? '')}`, { tool: 'get_subagent_status', ...summary })
        : fail(`unknown task: ${strArg(args, 'task_id')}`, { tool: 'get_subagent_status' });
    },
  },
  {
    name: 'list_subagents',
    description: 'List sub-agents in this registry (local discovery).',
    category: 'subagent',
    needsNetwork: false,
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => {
      const list = listTasks().map((t) => ({ task_id: t.id, role: t.role, status: t.status, strategy: t.strategy }));
      return ok(list.length > 0 ? list.map((t) => `${t.task_id} [${t.role}/${t.status}]`).join('\n') : '(none)', {
        tool: 'list_subagents',
        count: list.length,
      });
    },
  },
  {
    name: 'request_admin_approval',
    description: 'Request admin approval; auto_approve simulates admin offline. Timeout falls back to conservative default (false).',
    category: 'hitl',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'What needs approval' },
        timeout_seconds: { type: 'number', description: 'Wait seconds', default: 5 },
        auto_approve: { type: 'boolean', description: 'Simulate admin approval', default: false },
      },
      required: ['message'],
    },
    handler: async (args) => {
      const r = await requestApproval(strArg(args, 'message'), {
        timeoutSeconds: numArg(args, 'timeout_seconds', 5),
        autoApprove: boolArg(args, 'auto_approve', false),
      });
      return ok(`${r.status}: ${r.response}`, {
        tool: 'request_admin_approval',
        request_id: r.id,
        status: r.status,
        approved: r.status === 'approved',
      });
    },
  },
  {
    name: 'request_admin_input',
    description: 'Request text input from a human admin (timeout → expired with note).',
    category: 'hitl',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'What input is needed' },
        timeout_seconds: { type: 'number', description: 'Wait seconds', default: 5 },
        auto_approve: { type: 'boolean', description: 'Simulate admin reply', default: false },
      },
      required: ['message'],
    },
    handler: async (args) => {
      const r = await requestInput(strArg(args, 'message'), {
        timeoutSeconds: numArg(args, 'timeout_seconds', 5),
        autoApprove: boolArg(args, 'auto_approve', false),
      });
      return ok(`${r.status}: ${r.response}`, { tool: 'request_admin_input', request_id: r.id, status: r.status });
    },
  },
  {
    name: 'respond_to_request',
    description: 'Admin side: approve/reject/answer a pending request.',
    category: 'hitl',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        request_id: { type: 'string', description: 'Request id' },
        decision: { type: 'boolean', description: 'Approve (true) or reject/answer (false)', default: true },
        note: { type: 'string', description: 'Admin note', default: '' },
      },
      required: ['request_id'],
    },
    handler: async (args) => {
      const r = respondToRequest(strArg(args, 'request_id'), boolArg(args, 'decision', true), strArg(args, 'note'));
      return r
        ? ok(`${r.status}: ${r.response}`, { tool: 'respond_to_request', status: r.status })
        : fail(`request not pending: ${strArg(args, 'request_id')}`, { tool: 'respond_to_request' });
    },
  },
  {
    name: 'list_pending_requests',
    description: 'List pending HITL requests.',
    category: 'hitl',
    needsNetwork: false,
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => {
      const list = listPending();
      return ok(
        list.length > 0 ? list.map((r) => `${r.id} [${r.kind}] ${r.message.slice(0, 80)}`).join('\n') : '(none pending)',
        { tool: 'list_pending_requests', count: list.length }
      );
    },
  },
  {
    name: 'send_notification',
    description: 'Notification PREFLIGHT ONLY: validates channel credentials and records receipt; never delivers.',
    category: 'notify',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'email | telegram | slack | discord' },
        message: { type: 'string', description: 'Message text' },
      },
      required: ['channel', 'message'],
    },
    handler: async (args) => {
      const channel = strArg(args, 'channel') as 'email' | 'telegram' | 'slack' | 'discord';
      if (!['email', 'telegram', 'slack', 'discord'].includes(channel)) {
        return fail(`unknown channel: ${strArg(args, 'channel')}`, { tool: 'send_notification' });
      }
      const r = preflight(channel, strArg(args, 'message'));
      return fail(`preflight: ${r.reason}`, { tool: 'send_notification', channel, blocked: r.blocked, sent: false });
    },
  },
  {
    name: 'set_timer',
    description: 'One-time timer (in-process); fires callback message into the fired log.',
    category: 'timer',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Timer name' },
        delay_seconds: { type: 'number', description: 'Delay seconds' },
        message: { type: 'string', description: 'Callback message' },
      },
      required: ['name', 'delay_seconds', 'message'],
    },
    handler: async (args) => {
      const entry = setTimer(strArg(args, 'name'), numArg(args, 'delay_seconds', 60) * 1000, strArg(args, 'message'));
      return ok(`timer scheduled: ${entry.id}`, { tool: 'set_timer', timer_id: entry.id });
    },
  },
  {
    name: 'set_recurring_timer',
    description: 'Recurring timer with max occurrences (in-process).',
    category: 'timer',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Timer name' },
        interval_seconds: { type: 'number', description: 'Interval seconds' },
        max_occurrences: { type: 'number', description: 'Max fires', default: 24 },
        message: { type: 'string', description: 'Callback message' },
      },
      required: ['name', 'interval_seconds', 'message'],
    },
    handler: async (args) => {
      const entry = setRecurringTimer(
        strArg(args, 'name'),
        numArg(args, 'interval_seconds', 3600) * 1000,
        numArg(args, 'max_occurrences', 24),
        strArg(args, 'message')
      );
      return ok(`recurring timer scheduled: ${entry.id}`, { tool: 'set_recurring_timer', timer_id: entry.id });
    },
  },
  {
    name: 'cancel_timer',
    description: 'Cancel a scheduled timer.',
    category: 'timer',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: { timer_id: { type: 'string', description: 'Timer id' } },
      required: ['timer_id'],
    },
    handler: async (args) => {
      const done = cancelTimer(strArg(args, 'timer_id'));
      return done
        ? ok(`cancelled ${strArg(args, 'timer_id')}`, { tool: 'cancel_timer' })
        : fail(`cannot cancel: ${strArg(args, 'timer_id')}`, { tool: 'cancel_timer' });
    },
  },
  {
    name: 'list_timers',
    description: 'List timers and their status.',
    category: 'timer',
    needsNetwork: false,
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => {
      const list = listTimers();
      return ok(
        list.length > 0
          ? list.map((t) => `${t.id} [${t.kind}/${t.status}] ${t.name} fires=${t.fires}`).join('\n')
          : '(none)',
        { tool: 'list_timers', count: list.length }
      );
    },
  },
  {
    name: 'get_timer_status',
    description: 'Get one timer status and fire count.',
    category: 'timer',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: { timer_id: { type: 'string', description: 'Timer id' } },
      required: ['timer_id'],
    },
    handler: async (args) => {
      const t = getTimer(strArg(args, 'timer_id'));
      return t
        ? ok(`${t.id} [${t.kind}/${t.status}] fires=${t.fires}/${t.maxOccurrences ?? '∞'}`, {
          tool: 'get_timer_status',
          status: t.status,
          fires: t.fires,
        })
        : fail(`unknown timer: ${strArg(args, 'timer_id')}`, { tool: 'get_timer_status' });
    },
  },
];

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function toMcpTool(t: ToolDef): { name: string; description: string; inputSchema: ToolDef['inputSchema'] } {
  return { name: t.name, description: `${t.description} [${t.category}]`, inputSchema: t.inputSchema };
}

export function categories(): string[] {
  return [...new Set(TOOLS.map((t) => t.category))];
}
