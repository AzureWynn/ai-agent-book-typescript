/**
 * ResearchAgent（对应官方 agent.py，但抓取计划由实验确定性驱动）。
 *
 * 为了让对比聚焦"压缩策略本身"，而不是模型自主搜索行为的不确定性：
 * - 实验按固定顺序抓取全部 8 位联创的页面（mock），每页加入累积集合；
 * - 每次抓取后按压缩策略重建"网页内容的表示"，估算 token；
 * - 超预算 → 溢出（no_compression 会在这里失败）；
 * - 全部抓完（或未溢出）后，用模型从（压缩后的）上下文综合最终答案。
 */

import { ContextCompressor, estimateTokens, type Page, type StrategyName } from './compressor.js';
import { COFOUNDERS, fetchWebpage, mentionsCofounders } from './mock.js';

export interface AgentOptions {
  strategy: StrategyName;
  query: string;
  contextWindowTokens: number;
  summaryMaxTokens: number;
  model: string;
  baseUrl: string;
}

export interface RunResult {
  strategy: StrategyName;
  success: boolean;
  iterations: number;
  tokens: number;
  compressionRatio: number;
  overflows: number;
  summaryCalls: number;
  finalAnswer: string;
  finalAnswerLength: number;
  cofoundersMentioned: number;
  error?: string | undefined;
}

interface OllamaMsg {
  role: string;
  content: string;
  thinking?: string;
}

export class ResearchAgent {
  private compressor: ContextCompressor;
  private opts: AgentOptions;
  private pages: Page[] = [];
  private maxWebpageLength: number;
  private batch: boolean;

  constructor(opts: AgentOptions, maxWebpageLength: number) {
    this.opts = opts;
    this.maxWebpageLength = maxWebpageLength;
    this.batch = ['combined', 'context_aware', 'citations'].includes(opts.strategy);
    this.compressor = new ContextCompressor({
      strategy: opts.strategy,
      query: opts.query,
      summaryMaxTokens: opts.summaryMaxTokens,
      model: opts.model,
      baseUrl: opts.baseUrl,
    });
  }

  private systemPrompt(): string {
    return [
      'You are a research analyst. Below are fetched web pages about OpenAI co-founders.',
      'Report the CURRENT affiliation of every co-founder you have information about.',
      'List each co-founder name followed by their current role. If you lack info for some, say so.',
    ].join('\n');
  }

  /** 按策略重建消息：网页内容的表示由压缩器决定。 */
  private async buildMessages(): Promise<OllamaMsg[]> {
    const msgs: OllamaMsg[] = [
      { role: 'system', content: this.systemPrompt() },
      { role: 'user', content: this.opts.query },
    ];
    const pageMsgs = await this.compressor.buildToolMessages(this.pages);
    for (const m of pageMsgs) {
      // 脚本化抓取没有真实 tool_calls，用 user 消息承载页面内容（压缩器决定形态）
      msgs.push({ role: 'user', content: `[页面内容]\n${m.content}` });
    }
    return msgs;
  }

  private estimateTotal(msgs: OllamaMsg[]): number {
    return msgs.reduce((s, m) => s + estimateTokens(m.content ?? ''), 0);
  }

  private async chatOnce(messages: OllamaMsg[]): Promise<string> {
    const resp = await fetch(`${this.opts.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.opts.model,
        messages,
        options: { temperature: 0.2 },
        stream: false,
      }),
    });
    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = (await resp.json()) as { message?: { content?: string } };
    return data.message?.content ?? '';
  }

  async run(): Promise<RunResult> {
    let overflows = 0;
    let tokens = 0;
    let error: string | undefined;

    // 确定性抓取计划：依次抓全部联创
    for (const c of COFOUNDERS) {
      const url = `mock://${c.name.toLowerCase().replace(/\s+/g, '-')}`;
      const text = fetchWebpage(url, this.maxWebpageLength);
      this.pages.push({ url, text });

      // 批量策略上下文只是单条摘要，不会溢出，跳过逐页检查
      if (this.batch) continue;

      const msgs = await this.buildMessages();
      tokens = this.estimateTotal(msgs);
      if (tokens > this.opts.contextWindowTokens) {
        overflows++;
        error = `溢出: 第 ${this.pages.length} 页后估算 ${tokens} tok > 预算 ${this.opts.contextWindowTokens}`;
        break;
      }
    }

    if (!error) {
      const msgs = await this.buildMessages();
      tokens = this.estimateTotal(msgs);
      if (tokens > this.opts.contextWindowTokens) {
        overflows++;
        error = `溢出: 估算 ${tokens} tok > 预算 ${this.opts.contextWindowTokens}`;
      }
    }

    let finalAnswer = '';
    let iterations = this.pages.length;
    if (!error) {
      // 全部抓完（或未溢出）：模型综合最终答案
      finalAnswer = await this.chatOnce(await this.buildMessages());
    }

    const rawChars = this.pages.reduce((s, p) => s + p.text.length, 0);
    const pageMsgs = await this.compressor.buildToolMessages(this.pages);
    const compressedChars = pageMsgs.reduce((s, m) => s + m.content.length, 0);
    const compressionRatio = rawChars > 0 ? compressedChars / rawChars : 0;

    return {
      strategy: this.opts.strategy,
      success: Boolean(finalAnswer) && overflows === 0,
      iterations,
      tokens,
      compressionRatio,
      overflows,
      summaryCalls: this.compressor.summaryCallCount,
      finalAnswer,
      finalAnswerLength: finalAnswer.length,
      cofoundersMentioned: finalAnswer ? mentionsCofounders(finalAnswer) : 0,
      error,
    };
  }
}