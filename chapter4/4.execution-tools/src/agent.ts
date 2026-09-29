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

export async function runAgent(task: string): Promise<AgentTrace> {
  const ollama = new Ollama({ host: BASE_URL });
  return withClient(async (client: Client) => {
    const tools = toOllamaTools(await listTools(client));
    const seen = new Set<string>();
    const messages: Array<{ role: string; content: string }> = [
      {
        role: 'system',
        content: [
          'You drive MCP execution tools inside a disposable workspace.',
          'Rules: never repeat a tool+arguments pair; prefer file_write/code_interpreter/virtual_terminal;',
          'external tools (calendar_add, github_create_pr) are blocked by missing credentials — do not insist on them;',
          'verify by running: after writing code, execute it with code_interpreter before reporting output;',
          'never claim a result you did not observe in a tool response;',
          'when done, reply with a short summary and no tool calls.',
        ].join(' '),
      },
      { role: 'user', content: task },
    ];
    const trace: AgentTrace = { steps: [], answer: '' };
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await ollama.chat({
        model: MODEL,
        messages: messages as never,
        tools: tools as never,
        options: { temperature: 0 },
      });
      const msg = res.message;
      const calls = (msg.tool_calls ?? []) as Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
      if (calls.length === 0) {
        trace.answer = msg.content.trim();
        return trace;
      }
      messages.push({ role: 'assistant', content: msg.content });
      const stepCalls: AgentTrace['steps'][number]['calls'] = [];
      let progressed = false;
      for (const c of calls) {
        const name = c.function.name;
        const args = c.function.arguments ?? {};
        const key = `${name}:${JSON.stringify(args)}`;
        if (seen.has(key)) {
          stepCalls.push({ tool: name, args, ok: true, preview: '(duplicate skipped)' });
          messages.push({ role: 'tool', content: 'duplicate call skipped; use the earlier result' });
          continue;
        }
        seen.add(key);
        progressed = true;
        const result = await callTool(client, name, args);
        stepCalls.push({ tool: name, args, ok: result.success, preview: result.message.slice(0, 160) });
        messages.push({ role: 'tool', content: JSON.stringify({ name, ...result }).slice(0, 4000) });
      }
      trace.steps.push({ thought: msg.content.slice(0, 200), calls: stepCalls });
      if (!progressed) break;
    }
    const res = await ollama.chat({
      model: MODEL,
      messages: [
        { role: 'user', content: `Summarize what the tool calls above accomplished in two sentences: ${task}` },
      ],
      options: { temperature: 0 },
    });
    trace.answer = res.message.content.trim() || '(no answer produced)';
    return trace;
  });
}

export const AGENT_TASK_DEFAULT =
  'Write hello_exec.py that prints the first 5 square numbers. Then call code_interpreter to run it. Finally report the exact numbers you observed in the tool output.';
