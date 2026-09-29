import { Ollama } from 'ollama';
import { RegistryTool } from './types.js';
import { ServerConn, routeCall } from './servers.js';
import { approxTokens, discover, thinIndex } from './discover.js';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MAX_ROUNDS = 4;
const TOP_K = Number(process.env.DISCOVER_TOP_K || '4');
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

async function chatWithTimeout(ollama: Ollama, payload: Parameters<Ollama['chat']>[0]): Promise<Awaited<ReturnType<Ollama['chat']>>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      ollama.chat(payload),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`ollama chat timeout after ${CHAT_TIMEOUT_MS}ms`)), CHAT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface OllamaToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

function toOllamaTool(t: RegistryTool): OllamaToolDef {
  return { type: 'function', function: { name: t.name, description: `[${t.server}] ${t.description}`, parameters: t.inputSchema } };
}

export interface StepCall {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  preview: string;
}

export interface ArmTrace {
  arm: 'full-inject' | 'discover';
  schemaTokens: number;
  statusBar: string[];
  steps: Array<{ calls: StepCall[] }>;
  discoveries: number;
  discoveryMethod: string;
  needs: string[];
  answer: string;
  elapsedMs: number;
  toolCalls: number;
}

type Dispatch = (name: string, args: Record<string, unknown>) => Promise<{ ok: boolean; preview: string; full: string }>;

interface DriveResult {
  steps: Array<{ calls: StepCall[] }>;
  toolCalls: number;
  evidence: string[];
}

async function driveStep(
  ollama: Ollama,
  messages: Array<{ role: string; content: string }>,
  toolsNow: () => OllamaToolDef[],
  dispatch: Dispatch,
  onResult?: (name: string, args: Record<string, unknown>, out: { ok: boolean; preview: string; full: string }) => void
): Promise<DriveResult> {
  const steps: Array<{ calls: StepCall[] }> = [];
  const seen = new Set<string>();
  const evidence: string[] = [];
  let toolCalls = 0;
  let acted = false;
  let nudges = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await chatWithTimeout(ollama, { model: MODEL, messages: messages as never, tools: toolsNow() as never, options: { temperature: 0 } });
    const msg = res.message;
    const calls = (msg.tool_calls ?? []) as Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
    if (calls.length === 0) {
      if (msg.content.trim() && acted) break;
      if (nudges >= 2) break;
      nudges += 1;
      messages.push({ role: 'assistant', content: msg.content });
      messages.push({ role: 'user', content: 'You have not acted yet. Continue with tool calls.' });
      continue;
    }
    messages.push({ role: 'assistant', content: msg.content });
    const stepCalls: StepCall[] = [];
    let progressed = false;
    for (const c of calls) {
      const key = `${c.function.name}:${JSON.stringify(c.function.arguments ?? {})}`;
      if (seen.has(key)) {
        stepCalls.push({ tool: c.function.name, args: c.function.arguments ?? {}, ok: true, preview: '(duplicate skipped)' });
        messages.push({ role: 'tool', content: 'duplicate call skipped; use the earlier result' });
        continue;
      }
      seen.add(key);
      progressed = true;
      toolCalls += 1;
      const out = await dispatch(c.function.name, c.function.arguments ?? {});
      stepCalls.push({ tool: c.function.name, args: c.function.arguments ?? {}, ok: out.ok, preview: out.preview });
      messages.push({ role: 'tool', content: out.full.slice(0, 4000) });
      if (out.ok) {
        evidence.push(out.full.slice(0, 1000));
        acted = true;
      }
      if (onResult) onResult(c.function.name, c.function.arguments ?? {}, out);
    }
    steps.push({ calls: stepCalls });
    if (!progressed) break;
  }
  return { steps, toolCalls, evidence };
}

async function freshAnswer(ollama: Ollama, task: string, evidence: string[]): Promise<string> {
  const res = await chatWithTimeout(ollama, {
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: `Tool evidence:\n${evidence.join('\n') || '(no tool outputs collected)'}\n\nTask: ${task}\nAnswer concisely with exact observed facts (numbers, names). One or two sentences.`,
      },
    ],
    options: { temperature: 0 },
  });
  return res.message.content.trim();
}

export async function runFullInject(
  conns: ServerConn[],
  registry: RegistryTool[],
  steps: string[]
): Promise<ArmTrace> {
  const started = Date.now();
  const ollama = new Ollama({ host: BASE_URL });
  const tools = registry.map(toOllamaTool);
  const schemaText = JSON.stringify(tools.map((t) => t.function));
  const byName = new Map(registry.map((t) => [t.name, t]));
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: `You have ALL ${tools.length} tools with full schemas below. The tools you need ARE in that list — DO the steps with tool calls, never ask the user for data.\nTOOLS:\n${schemaText.slice(0, 60000)}` },
  ];
  const dispatch: Dispatch = async (name, args) => {
    const entry = byName.get(name);
    if (!entry) return { ok: false, preview: `unknown tool ${name}`, full: `unknown tool ${name}` };
    const r = await routeCall(conns, entry.server, name, args);
    const full = JSON.stringify({ name, ...r });
    return { ok: r.success, preview: full.slice(0, 160), full };
  };
  const allSteps: ArmTrace['steps'] = [];
  const allEvidence: string[] = [];
  let toolCalls = 0;
  for (const stepText of steps) {
    messages.push({ role: 'user', content: stepText });
    const r = await driveStep(ollama, messages, () => tools, dispatch);
    allSteps.push(...r.steps);
    allEvidence.push(...r.evidence);
    toolCalls += r.toolCalls;
  }
  const answer = allEvidence.length > 0 ? await freshAnswer(ollama, steps.join(' / '), allEvidence) : '(no evidence collected)';
  return {
    arm: 'full-inject',
    schemaTokens: approxTokens(schemaText),
    statusBar: registry.map((t) => t.name),
    steps: allSteps,
    discoveries: 0,
    discoveryMethod: 'none (all schemas injected)',
    needs: [],
    answer,
    elapsedMs: Date.now() - started,
    toolCalls,
  };
}

const DISCOVER_TOOL_DEF: OllamaToolDef = {
  type: 'function',
  function: {
    name: 'discover_tools',
    description: 'Describe a capability you lack in natural language (ENGLISH, e.g. need="check weather in a city"); returns 3-5 candidate tools with full schemas. If candidates do not fit, call again with different words.',
    parameters: { type: 'object', properties: { need: { type: 'string', description: 'Capability need in English' } }, required: ['need'] },
  },
};

function resolveTool(registry: RegistryTool[], raw: string): RegistryTool | null {
  const exact = registry.find((t) => t.name === raw);
  if (exact) return exact;
  const dot = raw.lastIndexOf('.');
  if (dot !== -1) {
    const server = raw.slice(0, dot);
    const short = raw.slice(dot + 1);
    const entry = registry.find((t) => t.name === short && t.server === server);
    if (entry) return entry;
  }
  return null;
}

export async function runDiscover(
  conns: ServerConn[],
  registry: RegistryTool[],
  steps: string[],
  semantic: boolean
): Promise<ArmTrace> {
  const started = Date.now();
  const ollama = new Ollama({ host: BASE_URL });
  const indexText = thinIndex(registry);
  const statusBar: string[] = [];
  const needs: string[] = [];
  let discoveries = 0;
  let method = 'keyword';
  const dynamicTools: OllamaToolDef[] = [DISCOVER_TOOL_DEF];
  const messages: Array<{ role: string; content: string }> = [
    {
      role: 'system',
      content: [
        'You start with a thin tool index (names only) plus ONE meta-tool: discover_tools.',
        'PROCEDURE (follow strictly):',
        '1. Your FIRST call must be discover_tools with a natural-language need (e.g. need="check weather in a city").',
        '2. Read the returned schemas, then call the discovered tools to do the work.',
        '3. Whenever you lack a capability, call discover_tools again with a new need.',
        '4. If returned candidates do not fit the need, call discover_tools again with different words instead of giving up.',
        'Returned tool schemas are appended to history and stay usable; the status bar lists discovered tool names.',
        'Never repeat a call; DO the steps with tool calls, never ask the user for data or summaries.',
        'Do NOT write the final summary until every numbered step has an observed ok tool result behind it. Claiming an unobserved result counts as failure.',
        '',
        'TOOL INDEX:',
        indexText,
      ].join('\n'),
    },
  ];
  const dispatch: Dispatch = async (name, args) => {
    if (name === 'discover_tools') {
      const need = String(args['need'] ?? '');
      needs.push(need);
      const topK = TOP_K;
      const found = await discover(registry, need, topK, semantic);
      method = found.method;
      discoveries += 1;
      const schemas = found.hits.map((h) => ({ name: h.name, description: h.description, parameters: h.inputSchema }));
      for (const h of found.hits) {
        if (!dynamicTools.some((t) => t.function.name === h.name)) {
          dynamicTools.push({ type: 'function', function: { name: h.name, description: `[${h.server}] ${h.description}`, parameters: h.inputSchema } });
        }
        if (!statusBar.includes(h.name)) statusBar.push(h.name);
      }
      const full = JSON.stringify({ discovered: schemas.map((s) => s.name), schemas });
      return { ok: true, preview: `discovered: ${schemas.map((s) => s.name).join(', ')}`, full };
    }
    const resolved = resolveTool(registry, name);
    if (!resolved) return { ok: false, preview: `unknown tool ${name}`, full: `unknown tool ${name}` };
    if (!statusBar.includes(resolved.name)) {
      const hint = resolved.description.split('.')[0]?.slice(0, 100) ?? resolved.name;
      return {
        ok: false,
        preview: `tool ${resolved.name} not discovered yet; call discover_tools first`,
        full: `tool ${resolved.name} is not on your status bar. Call discover_tools first with a need like: "${hint}". Then call it.`,
      };
    }
    const r = await routeCall(conns, resolved.server, resolved.name, args);
    const full = JSON.stringify({ name: resolved.name, ...r });
    return { ok: r.success, preview: full.slice(0, 160), full };
  };
  const allSteps: ArmTrace['steps'] = [];
  const allEvidence: string[] = [];
  let toolCalls = 0;
  for (const stepText of steps) {
    messages.push({ role: 'user', content: stepText });
    const r = await driveStep(ollama, messages, () => dynamicTools, dispatch, (called, _cargs, out) => {
      if (called === 'discover_tools' && out.ok) {
        messages.push({ role: 'user', content: 'The schemas above are now callable tools. Call them now to complete the step.' });
      }
    });
    allSteps.push(...r.steps);
    allEvidence.push(...r.evidence);
    toolCalls += r.toolCalls;
  }
  const answer = allEvidence.length > 0 ? await freshAnswer(ollama, steps.join(' / '), allEvidence) : '(no evidence collected)';
  return {
    arm: 'discover',
    schemaTokens: approxTokens(indexText) + approxTokens(JSON.stringify(dynamicTools)),
    statusBar,
    steps: allSteps,
    discoveries,
    discoveryMethod: method,
    needs,
    answer,
    elapsedMs: Date.now() - started,
    toolCalls,
  };
}
