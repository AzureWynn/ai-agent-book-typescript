import { Ollama } from 'ollama';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

function getClient(): Ollama {
  return new Ollama({ host: BASE_URL });
}

async function chatWithTimeout(ollama: Ollama, payload: Parameters<Ollama['chat']>[0]): Promise<Awaited<ReturnType<Ollama['chat']>>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      ollama.chat(payload),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`ollama chat timeout after ${CHAT_TIMEOUT_MS}ms`)), CHAT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function cleanCode(text: string): string {
  return text.replace(/```python|```/g, '').trim();
}

const CONTRACT = `只输出 Python 代码，不要解释，不要 markdown 围栏。
必须定义函数 def parse(line: str) -> dict | None：
- 能解析返回含全部必需字段的 dict（值可以是字符串、数字，不要嵌套）；
- 不能解析返回 None；
- 只用 re 和 json 标准库，无副作用，导入时不执行除正则编译外的任何代码。`;

export async function generateParser(sample: string, requiredKeys: string[], feedback = ''): Promise<string> {
  const prompt = [
    '你要为一种新的日志格式写解析函数。',
    `失败样本：${sample}`,
    `必需字段：${requiredKeys.join(', ')}`,
    feedback ? `上次失败原因：${feedback}` : '',
    CONTRACT,
  ]
    .filter((x) => x.length > 0)
    .join('\n');
  const res = await chatWithTimeout(getClient(), {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    options: { temperature: 0 },
  });
  return cleanCode(res.message.content);
}

const CANNED: Record<string, string> = {
  pipe_parser: `import re
_PATTERN = re.compile(
    r"^\\s*"
    r"(?P<timestamp>\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z)"
    r"\\s*\\|\\s*(?P<level>[A-Za-z]+)\\s*\\|\\s*(?P<module>[^|]+?)"
    r"\\s*\\|\\s*step\\s*=\\s*(?P<step>\\d+)\\s*\\|\\s*(?P<message>\\S(?:.*\\S)?)\\s*$"
)
def parse(line: str) -> dict | None:
    m = _PATTERN.match(line)
    if not m:
        return None
    d = m.groupdict()
    d["module"] = d["module"].strip()
    d["message"] = d["message"].strip()
    d["step"] = int(d["step"])
    return d
`,
  bracket_parser: `import re
_PATTERN = re.compile(
    r"^\\s*\\[(?P<timestamp>[^\\]]+)\\]\\s*\\((?P<level>[A-Za-z]+)\\)"
    r"\\s*<tool=(?P<tool>[^>]+)>"
    r"\\s*\\{latency_ms=(?P<latency_ms>\\d+)\\s+status=(?P<status>\\S+)\\}"
    r"\\s*::\\s*(?P<message>.*?)\\s*$"
)
def parse(line: str) -> dict | None:
    m = _PATTERN.match(line)
    if not m:
        return None
    d = m.groupdict()
    d["latency_ms"] = int(d["latency_ms"])
    return d
`,
};

export function cannedParser(name: string): string | null {
  return CANNED[name] ?? null;
}
