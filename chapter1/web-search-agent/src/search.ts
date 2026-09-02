/**
 * SearXNG 搜索客户端。
 *
 * 本模块对应官方 web-search-agent 里的 "可插拔 search_impl"：
 * 官方版调用 Moonshot 托管的 web_search Formula；本地版换成自部署的
 * SearXNG（元搜索引擎，聚合 Google/Bing/DDG 等）。接口签名保持一致，
 * 未来想换回官方 Kimi 或第三方搜索（如 Tavily），只需改这里。
 */

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  engine: string;
}

export interface SearchParams {
  q: string;
  maxResults?: number;
  timeoutMs?: number;
}

export interface SearchEngine {
  search(params: SearchParams): Promise<SearchResult[]>;
}

export interface SearxngOptions {
  baseUrl: string;
  timeoutMs?: number;
}

export class SearxngSearch implements SearchEngine {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(options: SearxngOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /**
   * 调 SearXNG 的 JSON API：GET /search?q=<query>&format=json
   */
  async search(params: SearchParams): Promise<SearchResult[]> {
    const url = new URL('/search', this.baseUrl);
    url.searchParams.set('q', params.q);
    url.searchParams.set('format', 'json');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) {
        throw new Error(`SearXNG HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
      }
      const payload = await resp.json() as { results?: Array<{
        title?: string; url?: string; content?: string; engine?: string;
      }> };
      const max = params.maxResults ?? 5;
      return (payload.results ?? []).slice(0, max).map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        content: r.content ?? '',
        engine: r.engine ?? '',
      }));
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * 把搜索结果渲染成适合喂给 LLM 的紧凑文本（防上下文爆炸）。
 */
export function formatResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return '[搜索无结果]';
  }
  return results.map((r, i) => {
    const body = r.content.length > 200 ? r.content.slice(0, 200) + '…' : r.content;
    return `${i + 1}. ${r.title}\n   来源: ${r.url}\n   摘要: ${body}`;
  }).join('\n\n');
}