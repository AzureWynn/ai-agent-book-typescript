// CodingAgent.run：官方 agent_new.py 主循环的本地教学版。
// 差异：Ollama 直连（无 SDK tool-calling，文本 ReAct 协议）、非流式、
// 每轮末尾追加 system_hint 状态栏、格式错误回灌结构化提示、重复指纹熔断。
import { Ollama } from 'ollama';
import 'dotenv/config';
import { execTool } from './tools.js';
import { SYSTEM_PROMPT, buildStatusBar } from './prompt.js';
import type { AgentEvent, AgentOutcome } from './types.js';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

const TOOL_FENCE = /```(?:tool|json)\s*\n([\s\S]*?)```/;

function sameFingerprint(a: string, b: string): boolean {
  return a === b;
}

export class CodingAgent {
  private ollama = new Ollama({ host: BASE_URL });

  private async chat(messages: { role: string; content: string }[]): Promise<string> {
    const p = this.ollama.chat({
      model: MODEL,
      messages: messages as { role: 'user' | 'assistant' | 'system'; content: string }[],
      options: { temperature: 0 },
    });
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`ollama chat timeout after ${CHAT_TIMEOUT_MS}ms`)), CHAT_TIMEOUT_MS));
    const res = await Promise.race([p, timer]);
    return (res.message.content || '').trim();
  }

  async *run(task: string, workspace: string, repoRoot: string, maxIterations = 12): AsyncGenerator<AgentEvent, AgentOutcome> {
    const messages: { role: string; content: string }[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: task },
    ];
    let toolCalls = 0;
    let formatErrors = 0;
    let lastFingerprint = '';

    for (let i = 1; i <= maxIterations; i++) {
      messages.push({ role: 'user', content: buildStatusBar(repoRoot) });
      let reply: string;
      try {
        reply = await this.chat(messages);
      } catch (e) {
        messages.pop();
        return { answer: `模型调用失败：${(e as Error).message}`, iterations: i, toolCalls, formatErrors, finished: false };
      }
      messages.pop();
      messages.push({ role: 'assistant', content: reply });

      if (reply.startsWith('FINAL:')) {
        const answer = reply.slice('FINAL:'.length).trim();
        yield { type: 'done', answer, iterations: i };
        return { answer, iterations: i, toolCalls, formatErrors, finished: true };
      }

      const m = reply.match(TOOL_FENCE);
      if (!m) {
        formatErrors++;
        const detail = '没解析到 ```tool JSON 块，也没看到 FINAL:。二选一重发。';
        yield { type: 'format_error', detail };
        messages.push({ role: 'user', content: `工具结果（格式错误）：${detail}你上一轮原文：${reply.slice(0, 500)}` });
        continue;
      }

      let name: string;
      let args: Record<string, unknown>;
      try {
        const parsed = JSON.parse(m[1] as string);
        name = String(parsed.name ?? '');
        args = (parsed.args ?? {}) as Record<string, unknown>;
      } catch {
        formatErrors++;
        const detail = 'tool 块里不是合法 JSON，重发。';
        yield { type: 'format_error', detail };
        messages.push({ role: 'user', content: `工具结果（格式错误）：${detail}` });
        continue;
      }

      const fingerprint = `${name} ${JSON.stringify(args)}`;
      if (sameFingerprint(fingerprint, lastFingerprint)) {
        messages.push({ role: 'user', content: '工具结果（循环警告）：和上一轮完全相同的调用，请换策略（换关键词/读相邻文件/缩小范围），不要原样重试。' });
        lastFingerprint = fingerprint + '#warned';
        continue;
      }
      lastFingerprint = fingerprint;

      toolCalls++;
      yield { type: 'tool_call', tool: name, args };
      const result = await execTool(workspace, name, args);
      yield { type: 'tool_result', tool: name, ok: result.ok, output: result.output };
      messages.push({ role: 'user', content: `工具 ${name} 返回（${result.ok ? '成功' : '失败'}）：\n${result.output}` });
    }

    yield { type: 'max_iterations', iterations: maxIterations };
    return { answer: '', iterations: maxIterations, toolCalls, formatErrors, finished: false };
  }
}
