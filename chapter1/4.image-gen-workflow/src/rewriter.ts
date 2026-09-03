/**
 * 改写节点（工作流路线节点 1）。
 *
 * 对应官方 pipeline.py 的 rewrite_prompt：
 * 把口语化中文需求，改写成 Stable Diffusion 风格的文生图提示词。
 *
 * 官方用 Moonshot kimi-k3，这里用本地 Ollama gemma4。
 * 核心学习点：这个节点做的是"翻译"（把自然语言适配成文生图模型的输入格式），
 * 不是智能决策。改写可能忠实（具体需求）或过度发挥（宽泛需求）。
 */

// 对应官方 REWRITE_SYSTEM_PROMPT
const REWRITE_SYSTEM_PROMPT = `你是 Stable Diffusion 风格的文生图提示词专家。用户会给你一句口语化的中文需求，你需要把它改写成经典文生图模型（如 Stable Diffusion / FLUX）能消化的提示词。

要求：
1. prompt 字段：逗号分隔的英文 tag，先主体后细节，包含质量词（如 masterpiece, best quality, highly detailed），必要时包含画风、构图、光线、情绪词。
2. negative_prompt 字段：逗号分隔的英文负面提示词（如 lowres, bad anatomy, blurry, watermark, text 等）。
3. style_notes 字段：一句中文，说明你这次改写做了哪些关键增补/取舍。
4. 只输出一个 JSON 对象，不要输出任何其他文字。格式：
{"prompt": "...", "negative_prompt": "...", "style_notes": "..."}`;

export interface RewriteOutput {
  prompt: string;
  negative_prompt: string;
  style_notes: string;
}

export interface RewriteOptions {
  baseUrl?: string;
  model?: string;
}

/** 调 Ollama /api/chat 完成改写（temperature 默认即可） */
export async function rewritePrompt(
  requirement: string,
  options: RewriteOptions = {}
): Promise<RewriteOutput> {
  const baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
  const model = options.model ?? process.env.MODEL_NAME ?? 'gemma4:latest';

  const body = {
    model,
    messages: [
      { role: 'system', content: REWRITE_SYSTEM_PROMPT },
      { role: 'user', content: requirement },
    ],
    temperature: 0,
    stream: false,
  };
  const resp = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`Ollama HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
  }
  const data = await resp.json() as { message?: { content?: string | Array<unknown> } };
  const content = typeof data.message?.content === 'string' ? data.message.content : '';
  return parseRewriteOutput(content);
}

/**
 * 解析改写输出为 {prompt, negative_prompt, style_notes}。
 * 容忍 ```json 代码围栏和前后多余文字；结构不合法时抛错。
 * （对应官方 parse_rewrite_output）
 */
export function parseRewriteOutput(text: string): RewriteOutput {
  if (!text || !text.trim()) throw new Error('改写输出为空');

  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .split('\n')
      .filter((l) => !l.trim().startsWith('```'))
      .join('\n')
      .trim();
  }

  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error(`改写输出中没有 JSON 对象: ${cleaned.slice(0, 100)}`);
  const jsonPart = cleaned.slice(start);
  // 截取到最后一个 } （容忍末尾多余文字）
  const end = jsonPart.lastIndexOf('}');
  if (end === -1) throw new Error('改写输出中没有闭合的 JSON 对象');

  let obj: unknown;
  try {
    obj = JSON.parse(jsonPart.slice(0, end + 1));
  } catch (e) {
    throw new Error(`改写输出不是合法 JSON: ${e instanceof Error ? e.message : e}`);
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('改写输出的 JSON 不是对象');
  }
  const o = obj as Record<string, unknown>;
  const prompt = typeof o.prompt === 'string' ? o.prompt.trim() : '';
  if (!prompt) throw new Error('改写输出缺少非空的 prompt 字段');
  return {
    prompt,
    negative_prompt: typeof o.negative_prompt === 'string' ? o.negative_prompt.trim() : '',
    style_notes: typeof o.style_notes === 'string' ? o.style_notes.trim() : '',
  };
}