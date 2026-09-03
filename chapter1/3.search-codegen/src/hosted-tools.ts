/**
 * 托管工具执行器（Hosted Tools）—— 本地仿真。
 *
 * 模拟 OpenAI 的"服务端托管"：模型只声明"我要 web_search / code_interpreter"，
 * 真正的执行发生在这层（就像在 OpenAI 服务器上执行一样），
 * Agent 代码本身看不到搜索请求、代码运行的中间过程，只拿到结果记录。
 */

import vm from 'node:vm';
import { evaluate } from 'mathjs';
import type { Citation } from './protocol.js';

// ---------- web_search：复用 SearXNG（与 2.web-search-agent 相同的后端） ----------

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

export async function runWebSearch(query: string, baseUrl: string): Promise<WebSearchResult[]> {
  const url = new URL('/search', baseUrl.replace(/\/+$/, ''));
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) {
    throw new Error(`SearXNG HTTP ${resp.status}`);
  }
  const data = await resp.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (data.results ?? []).slice(0, 5).map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    content: (r.content ?? '').slice(0, 300),
  }));
}

/** 搜索结果转成"带引用的文本"，并单独抽出 citations 供协议记录 */
export function formatSearchResults(results: WebSearchResult[]): { text: string; citations: Citation[] } {
  if (results.length === 0) {
    return { text: '[搜索无结果]', citations: [] };
  }
  const citations: Citation[] = results.map((r, i) => ({ url: r.url, title: r.title, index: i + 1 }));
  const text = results
    .map((r, i) => `${i + 1}. ${r.title}\n   来源[${i + 1}]: ${r.url}\n   摘要: ${r.content}`)
    .join('\n\n');
  return { text, citations };
}

// ---------- code_interpreter：node:vm 沙箱（与 0.function-calling 的 safeCalc 类似） ----------

export async function runCodeInterpreter(code: string): Promise<string> {
  // 只暴露白名单对象 + mathjs，禁止 process/require 等 Node 能力
  const context = vm.createContext({ Math, JSON, console, evaluate });
  const script = new vm.Script(`(function() {\n${code}\n})()`);
  const result = script.runInContext(context, { timeout: 10_000 });
  if (typeof result === 'string') return result;
  return JSON.stringify(result, null, 2);
}