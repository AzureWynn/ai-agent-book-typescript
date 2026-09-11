/**
 * 模拟搜索引擎与网页数据（对应官方 web_tools.py 的 mock 模式，无需 API Key）。
 * 任务：调研 8 位 OpenAI 联合创始人的当前职业归属。
 * 每页文本较长（默认 ~3000+ 字符），用来积累上下文、触发溢出与压缩。
 */

export interface CoFounder {
  name: string;
  affiliation: string;
}

export const COFOUNDERS: CoFounder[] = [
  { name: 'Sam Altman', affiliation: 'CEO of OpenAI, also advising Safe Superintelligence' },
  { name: 'Greg Brockman', affiliation: 'co-founder, president emeritus of OpenAI, now advisory at Anthropic' },
  { name: 'Ilya Sutskever', affiliation: 'co-founder of Safe Superintelligence (SSI)' },
  { name: 'John Schulman', affiliation: 'researcher at Anthropic' },
  { name: 'Andrej Karpathy', affiliation: 'founder of Eureka Labs (AI education)' },
  { name: 'Elon Musk', affiliation: 'left OpenAI, leads xAI' },
  { name: 'Wojciech Zaremba', affiliation: 'researcher at OpenAI' },
  { name: 'Durk Kingma', affiliation: 'research scientist at Google DeepMind' },
];

/** 生成一页"网页"正文：用冗长叙述重复关键信息，制造体积。 */
function pageText(c: CoFounder, targetLen: number): string {
  const sentences = [
    `${c.name} is widely known as one of the original co-founders of OpenAI, the organization that started as a non-profit AI research lab in late 2015.`,
    `According to recent public profiles and news coverage, ${c.name} is currently associated with ${c.affiliation}.`,
    `Industry observers note that ${c.name} has been influential in shaping modern AI policy discussions and funding priorities.`,
    `Multiple sources confirm that ${c.name} maintains a public presence through interviews, academic talks, and product announcements.`,
    `As of the latest reports, ${c.name} continues to be an active figure in the AI ecosystem, and their current role is listed as ${c.affiliation}.`,
  ];
  let text = '';
  let i = 0;
  while (text.length < targetLen) {
    text += sentences[i % sentences.length]! + ' ';
    i++;
  }
  return text;
}

function urlOf(c: CoFounder): string {
  return `mock://${c.name.toLowerCase().replace(/\s+/g, '-')}`;
}

/** search_web(query)：只返回名字 + URL（不含 affiliation，逼 Agent 抓页才能拿到信息）。 */
export function searchWeb(query: string, maxResults = 3): string {
  const q = query.toLowerCase();
  const hits = COFOUNDERS.filter(
    (c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase())
  );
  const pool = hits.length ? hits : COFOUNDERS;
  const results = pool.slice(0, maxResults).map((c) => {
    return `- ${c.name} | url: ${urlOf(c)}`;
  });
  return `搜索结果（query: ${query}）:\n${results.join('\n')}\n（摘要仅含链接，需 fetch_webpage 获取详情）`;
}

/** fetch_webpage(url)：返回完整网页文本（体积大）。 */
export function fetchWebpage(url: string, maxLen: number): string {
  const key = url.toLowerCase();
  const c = COFOUNDERS.find((x) => key.includes(x.name.toLowerCase().replace(/\s+/g, '-')));
  if (!c) return `错误: 未知网页 ${url}`;
  const body = pageText(c, maxLen);
  return `网页: ${url} (${c.name})\n${body}`;
}

/** 校验最终答复是否提到了足够多的联创名字。 */
export function mentionsCofounders(answer: string, threshold = 6): number {
  return COFOUNDERS.filter((c) => answer.includes(c.name)).length;
}