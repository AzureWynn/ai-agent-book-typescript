import { tool } from '@langchain/core/tools';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatResults, SearxngSearch } from './search.js';

export interface WebSearchOptions {
  searxngBaseUrl: string;
  timeoutMs?: number;
}

export type WebSearchTool = DynamicStructuredTool;

/**
 * 创建 web_search 工具（对应官方 web-search-agent 里可插拔的 search_impl）。
 *
 * 官方版直接转发给 Moonshot 托管的 Formula；这里用本地 SearXNG 实现，
 * 工具名与入参保持 "web_search(query)" 一致，便于日后切换后端。
 */
export function createWebSearchTool(options: WebSearchOptions): WebSearchTool {
  const engine = new SearxngSearch({
    baseUrl: options.searxngBaseUrl,
    timeoutMs: options.timeoutMs ?? 30_000,
  });

  return tool(
    async ({ query, max_results }) => {
      try {
        const results = await engine.search({ q: query, maxResults: max_results });
        return formatResults(results);
      } catch (e) {
        return `搜索失败: ${e instanceof Error ? e.message : '未知错误'}`;
      }
    },
    {
      name: 'web_search',
      description:
        '搜索实时网络信息。当问题需要最新事实、新闻、价格、事件或模型记忆之外的资料时使用。' +
        '返回若干条搜索结果（标题/来源/摘要），可多次调用以获取更多信息。',
      schema: z.object({
        query: z.string().describe('要搜索的关键词或问题'),
        max_results: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('最多返回多少条结果（默认 5）'),
      }),
    }
  );
}