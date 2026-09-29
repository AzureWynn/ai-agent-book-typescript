import { Ollama } from 'ollama';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { callTool, listTools, McpToolInfo, withClient } from './client.js';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MAX_STEPS = 6;

interface OllamaTool {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

function toOllamaTools(tools: McpToolInfo[]): OllamaTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

export interface AgentTrace {
  steps: Array<{ thought: string; calls: Array<{ tool: string; args: Record<string, unknown>; ok: boolean; preview: string }> }>;
  answer: string;
}

export async function runAgent(task: string, offlineOnly: boolean): Promise<AgentTrace> {
  const ollama = new Ollama({ host: BASE_URL });
  return withClient(async (client: Client) => {
    const mcpTools = (await listTools(client)).filter((t) => !offlineOnly || !t.description.includes('network'));
    const tools = toOllamaTools(mcpTools);
    const seen = new Set<string>();
    const messages: Array<{ role: string; content: string }> = [
      {
        role: 'system',
        content: `You are a research assistant. Use the available MCP tools to gather facts, then give a concise answer with tool evidence. Rules: never call the same tool+arguments twice; answer as soon as you have enough facts (2-4 tool calls is usually enough); your final message must be the answer text with no tool calls.`,
      },
      { role: 'user', content: task },
    ];
    const trace: AgentTrace = { steps: [], answer: '' };
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await ollama.chat({ model: MODEL, messages: messages as never, tools: tools as never });
      const msg = res.message;
      const calls = (msg.tool_calls ?? []) as Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
      if (calls.length === 0) {
        trace.answer = msg.content.trim();
        return trace;
      }
      const stepCalls: AgentTrace['steps'][number]['calls'] = [];
      const toolMessages: Array<{ role: string; content: string }> = [];
      for (const c of calls) {
        const name = c.function.name;
        const args = c.function.arguments ?? {};
        const key = `${name}:${JSON.stringify(args)}`;
        if (seen.has(key)) {
          toolMessages.push({ role: 'tool', content: JSON.stringify({ name, note: 'duplicate call skipped; use the earlier result' }).slice(0, 500) });
          stepCalls.push({ tool: name, args, ok: true, preview: '(duplicate skipped)' });
          continue;
        }
        seen.add(key);
        const result = await callTool(client, name, args);
        stepCalls.push({ tool: name, args, ok: result.success, preview: result.message.slice(0, 160) });
        toolMessages.push({ role: 'tool', content: JSON.stringify({ name, ...result }).slice(0, 4000) });
      }
      trace.steps.push({ thought: msg.content.slice(0, 200), calls: stepCalls });
      messages.push({ role: 'assistant', content: msg.content });
      messages.push(...toolMessages);
    }
    trace.answer = await finalAnswer(ollama, messages);
    return trace;
  });
}

async function finalAnswer(
  ollama: Ollama,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const res = await ollama.chat({
    model: MODEL,
    messages: [
      ...messages,
      { role: 'user', content: 'Tool budget exhausted. Answer now, concisely, using only the tool evidence collected above.' },
    ] as never,
  });
  return res.message.content.trim() || '(no answer produced)';
}

export const AGENT_TASK_DEFAULT =
  '看看 workspace 里有什么资料（directory_browser），读 research-note.md，再查一下北京今天的天气（weather 北京），综合介绍这个感知工具项目。';
