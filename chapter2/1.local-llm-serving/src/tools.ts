/**
 * 工具注册表与内置工具（对应官方 tools.py）。
 *
 * 5 个内置工具，schema 是 OpenAI 兼容格式（Ollama 原生工具调用同样吃这个格式）：
 * 1. get_current_temperature — Open-Meteo（无需 API Key）
 * 2. get_current_time        — IANA 时区
 * 3. convert_currency        — 模拟汇率
 * 4. parse_pdf               — URL 或本地 PDF（pdf-parse）
 * 5. code_interpreter        — 执行 Python（spawn python3，对齐官方语义）
 */

import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { PDFParse } from 'pdf-parse';

export type ToolResult = string | Record<string, unknown>;

export interface ToolFn {
  (args: Record<string, unknown>): Promise<ToolResult> | ToolResult;
}

interface RegisteredTool {
  fn: ToolFn;
  description: string;
  parameters: Record<string, unknown>;
}

/** 工具注册表：注册 → schema（喂给模型）→ 按名执行 */
export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  constructor() {
    this.registerDefaultTools();
  }

  register(name: string, description: string, parameters: Record<string, unknown>, fn: ToolFn): void {
    this.tools.set(name, { fn, description, parameters });
  }

  /** OpenAI 兼容的 tools 数组（Ollama /api/chat 直接接收） */
  getToolSchemas(): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const [name, tool] of this.tools) {
      out.push({
        type: 'function',
        function: {
          name,
          description: tool.description,
          parameters: tool.parameters,
        },
      });
    }
    return out;
  }

  /** 执行工具；参数必须是对象。任何异常都被捕获并序列化成 error JSON。 */
  async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) return JSON.stringify({ error: `Tool '${name}' not found` });
    try {
      const result = await tool.fn(args);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (e) {
      return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  list(): string[] {
    return [...this.tools.keys()];
  }

  private registerDefaultTools(): void {
    this.register(
      'get_current_temperature',
      "Get the current temperature for a specific location",
      {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: "The city and country, e.g., 'Paris, France'",
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: 'The temperature unit to use (by default, celsius)',
          },
        },
        required: ['location'], // unit 有默认值 celsius，不必填
      },
      getCurrentTemperature
    );

    this.register(
      'get_current_time',
      'Get the current date and time in a specific timezone',
      {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description:
              "Timezone name (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo'). Use standard IANA timezone names.",
            default: 'UTC',
          },
        },
        required: [],
      },
      getCurrentTime
    );

    this.register(
      'convert_currency',
      'Convert an amount from one currency to another. You MUST use this tool to convert currencies in order to get the latest exchange rate.',
      {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Amount to convert' },
          from_currency: { type: 'string', description: "Source currency code (e.g., 'USD', 'EUR')" },
          to_currency: { type: 'string', description: "Target currency code (e.g., 'USD', 'EUR')" },
        },
        required: ['amount', 'from_currency', 'to_currency'],
      },
      convertCurrency
    );

    this.register(
      'parse_pdf',
      'Parse a PDF document from a URL or local file and extract its text content',
      {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'PDF URL or local file path' },
        },
        required: ['url'],
      },
      parsePdf
    );

    this.register(
      'code_interpreter',
      "Execute Python code for calculations and data processing. You MUST use this tool to perform any complex calculations or data processing. Use Python operators: ** for exponentiation (2 ** 10), not ^ — in Python ^ is bitwise XOR.",
      {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python code to execute' },
        },
        required: ['code'],
      },
      codeInterpreter
    );
  }
}

// ── 工具实现 ──────────────────────────────────────────────────────────

const WEATHER_CODES: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'foggy', 48: 'foggy',
  51: 'light drizzle', 53: 'moderate drizzle', 55: 'dense drizzle',
  61: 'light rain', 63: 'moderate rain', 65: 'heavy rain',
  71: 'light snow', 73: 'moderate snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'light rain showers', 81: 'moderate rain showers', 82: 'heavy rain showers',
  85: 'light snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with light hail', 99: 'thunderstorm with heavy hail',
};

const now = () => new Date().toISOString();

async function getCurrentTemperature(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const location = String(args.location ?? '');
  const unit = String(args.unit ?? 'celsius');
  const isFahrenheit = unit.toLowerCase() === 'fahrenheit';
  try {
    const geoResp = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(8000) }
    );
    const geoData = await geoResp.json() as { results?: Array<Record<string, unknown>> };
    const hit = geoData.results?.[0];
    if (!hit) {
      return { location, error: `Location '${location}' not found`, timestamp: now() };
    }
    const lat = hit['latitude'] as number;
    const lon = hit['longitude'] as number;
    const locationName = `${hit['name']}, ${hit['country'] ?? ''}`;

    const wResp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&temperature_unit=${isFahrenheit ? 'fahrenheit' : 'celsius'}&timezone=auto`,
      { signal: AbortSignal.timeout(8000) }
    );
    const wd = await wResp.json() as { current?: Record<string, unknown> };
    const current = wd.current;
    if (!current) return { location: locationName, error: 'Weather data not available', timestamp: now() };

    const code = current['weather_code'] as number ?? 0;
    return {
      location: locationName,
      temperature: Math.round((current['temperature_2m'] as number) * 10) / 10,
      unit: isFahrenheit ? '°F' : '°C',
      conditions: WEATHER_CODES[code] ?? 'unknown',
      humidity: current['relative_humidity_2m'],
      wind_speed: Math.round(((current['wind_speed_10m'] as number) ?? 0) * 10) / 10,
      wind_unit: 'km/h',
      coordinates: { latitude: lat, longitude: lon },
      timestamp: current['time'] ?? now(),
      source: 'Open-Meteo',
    };
  } catch {
    // API 失败时的模拟回退，保证实验不中断
    const baseTemp = 20 + (Math.random() - 0.5) * 20;
    const temp = isFahrenheit ? (baseTemp * 9) / 5 + 32 : baseTemp;
    return {
      location,
      temperature: Math.round(temp * 10) / 10,
      unit: isFahrenheit ? '°F' : '°C',
      conditions: ['sunny', 'cloudy', 'partly cloudy', 'rainy'][Math.floor(Math.random() * 4)],
      timestamp: now(),
      note: 'Simulated data (API unavailable)',
    };
  }
}

const TZ_ALIASES: Record<string, string> = {
  EST: 'America/New_York', EDT: 'America/New_York',
  PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
  CST: 'America/Chicago', CDT: 'America/Chicago',
  MST: 'America/Denver', MDT: 'America/Denver',
  GMT: 'Europe/London', BST: 'Europe/London',
  CET: 'Europe/Paris', CEST: 'Europe/Paris',
  JST: 'Asia/Tokyo', IST: 'Asia/Kolkata',
  AEST: 'Australia/Sydney', AEDT: 'Australia/Sydney',
  SGT: 'Asia/Singapore', HKT: 'Asia/Hong_Kong',
};

function getCurrentTime(args: Record<string, unknown>): Record<string, unknown> {
  const rawTz = String(args.timezone ?? 'UTC');
  const tzName = TZ_ALIASES[rawTz.toUpperCase()] ?? rawTz;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tzName,
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());

    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const gmtOffset = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const m = gmtOffset.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    const utcOffset = m
      ? `${m[1]}${(m[2] ?? '0').padStart(2, '0')}${(m[3] ?? '00')}`
      : '+0000';
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: tzName, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date());
    const g = (t: string) => iso.find((p) => p.type === t)?.value ?? '';
    const datetime = `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;

    return {
      timezone: tzName,
      datetime,
      date: `${g('year')}-${g('month')}-${g('day')}`,
      time: `${g('hour')}:${g('minute')}:${g('second')}`,
      day_of_week: get('weekday'),
      utc_offset: utcOffset,
      timestamp: datetime,
    };
  } catch {
    // 时区无效回退到 UTC
    const utc = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date());
    const g = (t: string) => utc.find((p) => p.type === t)?.value ?? '';
    const datetime = `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
    return {
      timezone: 'UTC',
      datetime,
      date: `${g('year')}-${g('month')}-${g('day')}`,
      time: `${g('hour')}:${g('minute')}:${g('second')}`,
      day_of_week: new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', weekday: 'long' }).format(new Date()),
      utc_offset: '+0000',
      timestamp: datetime,
      note: `Invalid timezone '${rawTz}', using UTC as fallback`,
    };
  }
}

const EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0, EUR: 0.92, GBP: 0.79, JPY: 149.5, CNY: 7.24, CAD: 1.36,
  AUD: 1.53, CHF: 0.88, INR: 83.12, SGD: 1.34, KRW: 1330.5, MXN: 17.1,
};

function convertCurrency(args: Record<string, unknown>): Record<string, unknown> {
  const amount = Number(args.amount ?? 0);
  const fromRaw = String(args.from_currency ?? '').toUpperCase();
  const toRaw = String(args.to_currency ?? '').toUpperCase();
  const from = fromRaw.replace('S$', 'SGD').replace('$', 'USD');
  const to = toRaw.replace('S$', 'SGD').replace('$', 'USD');

  if (!(from in EXCHANGE_RATES) || !(to in EXCHANGE_RATES)) {
    return { error: `Unsupported currency: ${from} or ${to}` };
  }
  const usdAmount = amount / EXCHANGE_RATES[from]!;
  const converted = usdAmount * EXCHANGE_RATES[to]!;
  return {
    original_amount: amount,
    from_currency: from,
    to_currency: to,
    converted_amount: Math.round(converted * 100) / 100,
    exchange_rate: Math.round((EXCHANGE_RATES[to]! / EXCHANGE_RATES[from]!) * 10000) / 10000,
    timestamp: now(),
  };
}

async function parsePdf(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = String(args.url ?? '');
  try {
    let data: Buffer;
    if (url.startsWith('file://') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
      data = await fs.readFile(url.replace(/^file:\/\//, ''));
    } else {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      data = Buffer.from(await resp.arrayBuffer());
    }
    const parser = new PDFParse({ data });
    const result = await parser.getText();
    await parser.destroy();
    return {
      url,
      num_pages: result.total,
      content: result.text.slice(0, 2000), // 限制返回长度，防止上下文爆炸
      success: true,
    };
  } catch (e) {
    return { url, error: e instanceof Error ? e.message : String(e), success: false };
  }
}

function stripMarkdownFences(code: string): string {
  let c = code.trim();
  c = c.replace(/^```(?:python|py)?\s*\n?/, '');
  c = c.replace(/\n?```\s*$/, '');
  return c.trim();
}

/** 用 python3 子进程执行代码（对齐官方 code_interpreter 语义：模型生成的是 Python）。 */
function codeInterpreter(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const code = stripMarkdownFences(String(args.code ?? ''));
  // 包装器：exec 用户代码，捕获 stdout/stderr，抽取出 result 变量，最后打印一行 JSON
  const wrapper = `
import json, sys, math, random, datetime, re, io, contextlib, traceback
src = sys.stdin.read()
ns = {"__builtins__": __builtins__, "math": math, "random": random, "datetime": datetime, "re": re, "json": json}
buf, errbuf = io.StringIO(), io.StringIO()
try:
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(errbuf):
        exec(src, ns)
    result = None
    for k in ["result", "A", "total", "sum", "output", "answer", "final", "value"]:
        if k in ns:
            result = ns[k]; break
    try:
        rj = json.dumps(result, default=str)
    except Exception:
        rj = repr(result)
    print(json.dumps({"success": True, "output": buf.getvalue() or None, "stderr": errbuf.getvalue() or None, "result": json.loads(rj)}))
except SyntaxError as e:
    print(json.dumps({"success": False, "error_type": "SyntaxError", "error": f"Syntax Error on line {e.lineno}: {e.msg}"}))
except Exception as e:
    print(json.dumps({"success": False, "error_type": type(e).__name__, "error": str(e), "traceback": traceback.format_exc()}))
`;

  return new Promise((resolve) => {
    const child = spawn('python3', ['-c', wrapper], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ success: false, error: 'python3 not found. Install Python or use another calculation method.' });
    });
    child.on('close', () => {
      clearTimeout(timer);
      const lines = stdout.trim().split('\n');
      const last = lines[lines.length - 1] ?? '';
      try {
        resolve(JSON.parse(last) as Record<string, unknown>);
      } catch {
        resolve({ success: false, error: 'Failed to parse interpreter output', raw: stdout.slice(0, 500) });
      }
    });
    child.stdin.write(code);
    child.stdin.end();
  });
}