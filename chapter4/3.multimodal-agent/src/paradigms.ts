import { Ollama } from 'ollama';
import { config } from './config.js';
import { extractTable, reportPath, tableText } from './chart.js';
import { ParadigmResult } from './types.js';
import { readFileSync } from 'node:fs';

function client(): Ollama {
  return new Ollama({ host: config.ollamaBaseUrl });
}

export async function answerExtract(question: string): Promise<ParadigmResult> {
  const started = Date.now();
  const notes: string[] = [];
  const table = extractTable();
  notes.push(`measured ${table.length} bars from SVG geometry (no pre-labeled values read)`);
  const report = readFileSync(reportPath(), 'utf-8');
  const ollama = client();
  const prompt = [
    'Answer using ONLY the data table below. The prose report is qualitative context.',
    '',
    'Data table (USD millions):',
    tableText(table),
    '',
    'Report:',
    report.trim(),
    '',
    `Question: ${question}`,
    'Reply in one or two sentences with exact numbers.',
  ].join('\n');
  const res = await ollama.chat({ model: config.ollamaModel, messages: [{ role: 'user', content: prompt }], options: { temperature: 0 } });
  const answer = res.message.content.trim();
  return { paradigm: 'extract-to-text', answer, exactCorrect: false, notes, elapsedMs: Date.now() - started };
}

export interface ChartTool {
  name: string;
  description: string;
  call: (args: Record<string, unknown>) => { ok: boolean; text: string };
}

export function chartTools(): ChartTool[] {
  return [
    {
      name: 'list_quarters',
      description: 'List quarters present in the chart (no values).',
      call: () => ({ ok: true, text: 'Quarters: Q1, Q2, Q3, Q4' }),
    },
    {
      name: 'read_bar',
      description: 'Measure one quarter bar from the SVG and return its exact value in USD millions.',
      call: (args) => {
        const q = String(args['quarter'] ?? '').toUpperCase();
        const row = extractTable().find((r) => r.quarter === q);
        if (!row) return { ok: false, text: `unknown quarter: ${q} (use list_quarters)` };
        return { ok: true, text: `${row.quarter}: ${row.value}M` };
      },
    },
  ];
}

export async function answerWithTools(question: string, followUp?: string): Promise<ParadigmResult> {
  const started = Date.now();
  const notes: string[] = [];
  const tools = chartTools();
  const ollama = client();
  const toolDefs = tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: { type: 'object', properties: { quarter: { type: 'string' } } } },
  }));
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: 'Answer chart questions by calling tools. Call list_quarters at most once, then read_bar once per quarter named in the question (e.g. Q4, or all four for comparisons). Never repeat a call; then answer with exact numbers.' },
    { role: 'user', content: question },
  ];
  let answer = '';
  const seen = new Set<string>();
  const evidence: string[] = [];
  let nudged = false;
  for (let step = 0; step < 6; step++) {
    const res = await ollama.chat({ model: config.ollamaModel, messages: messages as never, tools: toolDefs as never, options: { temperature: 0 } });
    const msg = res.message;
    const calls = (msg.tool_calls ?? []) as Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
    if (calls.length === 0) {
      answer = msg.content.trim();
      break;
    }
    messages.push({ role: 'assistant', content: msg.content });
    let progressed = false;
    for (const c of calls) {
      const key = `${c.function.name}:${JSON.stringify(c.function.arguments ?? {})}`;
      if (seen.has(key)) {
        notes.push(`duplicate ${c.function.name} skipped; prior result stands`);
        messages.push({ role: 'tool', content: 'duplicate call skipped; use the earlier result' });
        continue;
      }
      seen.add(key);
      progressed = true;
      const tool = tools.find((t) => t.name === c.function.name);
      const out = tool ? tool.call(c.function.arguments ?? {}) : { ok: false, text: `unknown tool ${c.function.name}` };
      notes.push(`${c.function.name}(${JSON.stringify(c.function.arguments ?? {})}) → ${out.text}`);
      messages.push({ role: 'tool', content: out.text });
      if (out.ok) evidence.push(`${c.function.name}: ${out.text}`);
    }
    if (!progressed) {
      if (!nudged) {
        nudged = true;
        notes.push('nudge: no new tool calls; prompting model to read bars');
        messages.push({
          role: 'user',
          content: 'You have the quarter list. Now call read_bar once for each of Q1, Q2, Q3 and Q4 to get exact values, then answer.',
        });
        continue;
      }
      break;
    }
  }
  if (!answer) {
    const fallbackPrompt = `Tool evidence:\n${evidence.join('\n') || '(no tool outputs collected)'}\n\nQuestion: ${question}\nAnswer in one or two sentences with exact numbers.`;
    const res = await ollama.chat({
      model: config.ollamaModel,
      messages: [
        {
          role: 'user',
          content: fallbackPrompt,
        },
      ],
      options: { temperature: 0 },
    });
    answer = res.message.content.trim();
    notes.push('final-answer pass: fresh prompt from collected tool outputs (no loop history)');
  }
  if (followUp) {
    const followMessages: Array<{ role: string; content: string }> = [...messages, { role: 'user', content: followUp }];
    const res = await ollama.chat({ model: config.ollamaModel, messages: followMessages as never, tools: toolDefs as never, options: { temperature: 0 } });
    const msg = res.message;
    const calls = (msg.tool_calls ?? []) as Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
    if (calls.length > 0) {
      const followEvidence: string[] = [];
      followMessages.push({ role: 'assistant', content: msg.content });
      for (const c of calls) {
        const tool = tools.find((t) => t.name === c.function.name);
        const out = tool ? tool.call(c.function.arguments ?? {}) : { ok: false, text: 'unknown tool' };
        notes.push(`follow-up ${c.function.name} → ${out.text}`);
        followMessages.push({ role: 'tool', content: out.text });
        if (out.ok) followEvidence.push(out.text);
      }
      const res2 = await ollama.chat({
        model: config.ollamaModel,
        messages: [
          { role: 'user', content: `Tool evidence:\n${followEvidence.join('\n')}\n\nFollow-up question: ${followUp}\nAnswer in one or two sentences with exact numbers.` },
        ],
        options: { temperature: 0 },
      });
      answer += `\nFollow-up: ${res2.message.content.trim()}`;
    } else {
      answer += `\nFollow-up: ${msg.content.trim()}`;
    }
  }
  return { paradigm: 'tool-based', answer, exactCorrect: false, notes, elapsedMs: Date.now() - started };
}

export function answerNative(): ParadigmResult {
  const notes = [
    'native multimodal needs (1) a raster image (PNG/JPG) and (2) a verified vision-capable model endpoint',
    'this repo ships vector SVG only (no rasterizer dependency) and VISION_MODEL is unset',
  ];
  if (!config.visionModel) {
    notes.push('VISION_MODEL unset → blocked by environment, not attempted (no mock vision output)');
    return { paradigm: 'native', answer: '(blocked: no verified vision endpoint)', exactCorrect: false, notes, elapsedMs: 0 };
  }
  notes.push(`VISION_MODEL=${config.visionModel} set, but no PNG raster available → still blocked; add a rasterizer to enable`);
  return { paradigm: 'native', answer: '(blocked: no raster image available)', exactCorrect: false, notes, elapsedMs: 0 };
}
