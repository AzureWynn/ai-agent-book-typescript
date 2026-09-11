/**
 * 上下文压缩策略（对应官方 compression_strategies.py）。
 *
 * 六种策略决定"工具结果以什么形态进入对话历史"：
 *   no_compression  原文
 *   individual      每页单独 LLM 摘要再拼接
 *   combined        全部页合并后一次摘要
 *   context_aware   结合研究问题做聚焦摘要
 *   citations       context_aware + 来源链接
 *   windowed        最近一次保留全文，更早历史压缩（超 80% 预算时）
 *
 * 摘要用 Ollama 完成；摘要结果按 (策略, 页数) 记忆化，避免重复调用。
 */

export type StrategyName =
  | 'no_compression'
  | 'individual'
  | 'combined'
  | 'context_aware'
  | 'citations'
  | 'windowed';

export const STRATEGIES: StrategyName[] = [
  'no_compression',
  'individual',
  'combined',
  'context_aware',
  'citations',
  'windowed',
];

export interface Page {
  url: string;
  text: string;
}

export interface CompressorOptions {
  strategy: StrategyName;
  query: string;
  summaryMaxTokens: number;
  model: string;
  baseUrl: string;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

const SUMMARY_PROMPT = (instruction: string) =>
  `你是一个上下文压缩器。${instruction} 只输出压缩后的内容，不要多余说明。`;

export class ContextCompressor {
  readonly strategy: StrategyName;
  readonly query: string;
  private summaryCalls = 0;
  private memo = new Map<string, string>();
  private model: string;
  private baseUrl: string;
  private summaryMaxTokens: number;

  constructor(opts: CompressorOptions) {
    this.strategy = opts.strategy;
    this.query = opts.query;
    this.summaryMaxTokens = opts.summaryMaxTokens;
    this.model = opts.model;
    this.baseUrl = opts.baseUrl;
  }

  get summaryCallCount(): number {
    return this.summaryCalls;
  }

  private memoKey(kind: string, n: number): string {
    return `${kind}#${n}`;
  }

  private async summarize(text: string, instruction: string): Promise<string> {
    this.summaryCalls++;
    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: SUMMARY_PROMPT(instruction) },
          { role: 'user', content: text.slice(0, 12000) },
        ],
        options: { temperature: 0.2, num_predict: this.summaryMaxTokens },
        stream: false,
      }),
    });
    if (!resp.ok) throw new Error(`摘要失败 HTTP ${resp.status}`);
    const data = (await resp.json()) as { message?: { content?: string } };
    return (data.message?.content ?? '').trim();
  }

  /** 记忆化摘要（按页数缓存，页新增时才重算）。 */
  private async memoizedSummarize(kind: string, n: number, text: string, instruction: string): Promise<string> {
    const key = this.memoKey(kind, n);
    const cached = this.memo.get(key);
    if (cached !== undefined) return cached;
    const out = await this.summarize(text, instruction);
    this.memo.set(key, out);
    return out;
  }

  /** 把已积累的网页转成进入历史的工具结果消息列表（每策略一种形态）。 */
  async buildToolMessages(pages: Page[]): Promise<{ role: string; tool_name: string; content: string }[]> {
    const n = pages.length;
    const messages: { role: string; tool_name: string; content: string }[] = [];

    switch (this.strategy) {
      case 'no_compression':
        for (const p of pages) {
          messages.push({ role: 'tool', tool_name: 'fetch_webpage', content: p.text });
        }
        break;

      case 'individual': {
        for (const p of pages) {
          const summary = await this.memoizedSummarize('ind', n, p.text, '用 100 字以内总结这段网页，必须保留人物姓名与当前职务。');
          messages.push({ role: 'tool', tool_name: 'fetch_webpage', content: `[摘要 ${p.url}] ${summary}` });
        }
        break;
      }

      case 'combined': {
        const all = pages.map((p) => p.text).join('\n\n');
        const summary = await this.memoizedSummarize('combined', n, all, '合并总结这些网页，150 字以内，必须逐一提及每个人物的姓名与当前职务。');
        messages.push({ role: 'tool', tool_name: 'fetch_webpage', content: `[合并摘要] ${summary}` });
        break;
      }

      case 'context_aware': {
        const all = pages.map((p) => p.text).join('\n\n');
        const summary = await this.memoizedSummarize(
          'ctx',
          n,
          all,
          `结合研究问题「${this.query}」做聚焦摘要，150 字以内，必须保留每个人物的姓名与当前职务。`
        );
        messages.push({ role: 'tool', tool_name: 'fetch_webpage', content: `[聚焦摘要] ${summary}` });
        break;
      }

      case 'citations': {
        const all = pages.map((p) => p.text).join('\n\n');
        const urls = pages.map((p) => p.url).join(', ');
        const summary = await this.memoizedSummarize(
          'cit',
          n,
          all,
          `结合研究问题「${this.query}」做聚焦摘要，150 字以内，必须保留每个人物的姓名与当前职务，并列出每个要点对应的来源 URL。`
        );
        messages.push({
          role: 'tool',
          tool_name: 'fetch_webpage',
          content: `[带引用摘要] ${summary}\n来源: ${urls}`,
        });
        break;
      }

      case 'windowed': {
        // 最近一次保留全文；更早的压缩（记忆化）
        for (let i = 0; i < n; i++) {
          const p = pages[i]!;
          if (i === n - 1) {
            messages.push({ role: 'tool', tool_name: 'fetch_webpage', content: p.text });
          } else {
            const summary = await this.memoizedSummarize('win', i, p.text, '压缩这段较早的工具结果，80 字以内，必须保留人物姓名与关键信息。');
            messages.push({ role: 'tool', tool_name: 'fetch_webpage', content: `[COMPRESSED ${p.url}] ${summary}` });
          }
        }
        break;
      }
    }
    return messages;
  }
}