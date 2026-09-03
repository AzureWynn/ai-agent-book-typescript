/**
 * Responses API 协议 —— 本地仿真的类型定义。
 *
 * 与 Chat Completions function-calling 的核心区别：
 * - 之前（0.function-calling）：模型返回 tool_calls「请求」调用 → 你的代码执行
 * - 这里（Responses）：模型直接产出「已完成」的类型化记录，如 web_search_call，
 *   工具由服务端/托管执行，Agent 只看到结果，看不到执行过程。
 *
 * 官方参考：https://developers.openai.com/api/docs/guides/tools-web-search
 *          https://developers.openai.com/api/docs/guides/tools-code-interpreter
 */

/** 请求里声明的托管工具（OpenAI 的 Responses tools 结构） */
export type HostedTool =
  | { type: 'web_search'; search_context_size?: 'low' | 'medium' | 'high' }
  | { type: 'code_interpreter'; container?: { type: 'auto'; memory_limit?: string } };

/** 响应的 output 里可能出现的各种类型化 item */
export type ResponseItem =
  | { type: 'message'; role: 'assistant'; content: Array<{ type: 'output_text'; text: string }> }
  | { type: 'web_search_call'; id?: string; status: 'completed' | 'in_progress'; query?: string; citations?: Citation[] }
  | { type: 'code_interpreter_call'; id?: string; status: 'completed' | 'in_progress'; code?: string; output?: string }
  | { type: 'reasoning'; summary?: Array<{ text: string }> };

/** 引用（web_search_call 特有的可点击来源链接） */
export interface Citation {
  url: string;
  title?: string;
  index?: number;
}

/** 一次完整响应（简化版 Responses response 对象） */
export interface ResponsesResponse {
  id: string;
  model: string;
  output: ResponseItem[];
}

/** 从 response 提取纯文本（message 里的 output_text 拼接） */
export function responseText(resp: ResponsesResponse): string {
  return resp.output
    .filter((i): i is Extract<ResponseItem, { type: 'message' }> => i.type === 'message')
    .flatMap((m) => m.content.map((c) => c.text))
    .join('\n')
    .trim();
}

/** 提取类型化工具记录（web_search_call / code_interpreter_call） */
export function toolItems(resp: ResponsesResponse): Extract<ResponseItem, { type: 'web_search_call' | 'code_interpreter_call' }>[] {
  return resp.output.filter(
    (i): i is Extract<ResponseItem, { type: 'web_search_call' | 'code_interpreter_call' }> =>
      i.type === 'web_search_call' || i.type === 'code_interpreter_call'
  );
}

/** 收集所有引用 */
export function allCitations(resp: ResponsesResponse): Citation[] {
  return resp.output.flatMap((i) => (i.type === 'web_search_call' ? (i.citations ?? []) : []));
}