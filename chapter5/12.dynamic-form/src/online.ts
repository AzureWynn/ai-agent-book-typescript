// 在线臂：Ollama 生成表单 → 静态校验 → jsdom 真执行 → 第二调消费 payload 出摘要。
import { Ollama } from 'ollama';
import 'dotenv/config';
import { FORM_SYSTEM_PROMPT, PARSE_SYSTEM_PROMPT, USER_REQUEST, SUBMISSION, stripFence } from './prompts.js';
import { validateForm } from './validate.js';
import { executeForm } from './execute.js';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

async function chat(messages: { role: string; content: string }[]): Promise<string> {
  const ollama = new Ollama({ host: BASE_URL });
  const p = ollama.chat({
    model: MODEL,
    messages: messages as { role: 'user' | 'assistant' | 'system'; content: string }[],
    options: { temperature: 0 },
  });
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`ollama chat timeout after ${CHAT_TIMEOUT_MS}ms`)), CHAT_TIMEOUT_MS));
  const res = await Promise.race([p, timer]);
  return (res.message.content || '').trim();
}

export interface ArmOutcome {
  arm: string;
  html: string;
  staticPass: boolean;
  staticReport: Record<string, boolean>;
  exec: { initialHidden: boolean; visibleAfterRoundTrip: boolean; submitCount: number; submitted: Record<string, unknown> | null; error?: string };
  summary: string;
  attempts: number;
}

export async function runOnlineArm(trace: boolean): Promise<ArmOutcome> {
  let html = '';
  let attempts = 0;
  let lastReport: Record<string, boolean> = {};
  for (let i = 1; i <= 3; i++) {
    attempts = i;
    const raw = await chat([
      { role: 'system', content: FORM_SYSTEM_PROMPT },
      { role: 'user', content: `用户请求：${USER_REQUEST}\n请为其中缺失的信息生成澄清表单。${i > 1 ? '上一轮没过：必须输出完整 HTML 文档（含 <!DOCTYPE html> 与 <html> 标签），字段与级联缺一不可，重发全文。' : ''}` },
    ]);
    html = stripFence(raw);
    const v = validateForm(html);
    lastReport = v.report as unknown as Record<string, boolean>;
    const complete = /<!doctype|<html/i.test(html);
    if (trace) {
      for (const [k, ok] of Object.entries(v.report)) console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${k}`);
      console.log(`  [${complete ? 'PASS' : 'FAIL'}] 完整文档(doctype/html)`);
    }
    if (v.pass && complete) break;
    if (!complete) lastReport = { ...lastReport, '完整文档': false };
  }
  const exec = await executeForm(html);
  let summary = '';
  if (exec.submitted) {
    summary = await chat([
      { role: 'system', content: PARSE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `原始请求：${USER_REQUEST}\n浏览器表单实际提交的 JSON 数据：\n${JSON.stringify(exec.submitted, null, 2)}`,
      },
    ]);
  }
  return { arm: 'online', html, staticPass: Object.values(lastReport).every(Boolean), staticReport: lastReport, exec, summary, attempts };
}
