import { ActionResponse, ToolDef, fail, numArg, ok, strArg } from './types.js';

const TIMEOUT_MS = 15000;
const UA = { 'User-Agent': 'ai-agent-book-perception-tools/1.0 (teaching)' };

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<unknown>;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export const publicTools: ToolDef[] = [
  {
    name: 'web_search',
    description: 'Web search via DuckDuckGo HTML endpoint (live, no key).',
    category: 'search',
    needsNetwork: true,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        num_results: { type: 'number', description: 'Results 1-10', default: 5 },
      },
      required: ['query'],
    },
    handler: async (args) => {
      try {
        const query = strArg(args, 'query');
        const numResults = Math.min(10, Math.max(1, numArg(args, 'num_results', 5)));
        const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
        const results: Array<{ title: string; url: string; snippet: string }> = [];
        const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
        const links: Array<{ url: string; title: string }> = [];
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(html)) !== null && links.length < numResults) {
          links.push({ url: m[1] ?? '', title: stripHtml(m[2] ?? '').slice(0, 160) });
        }
        const snippets: string[] = [];
        while ((m = snippetRe.exec(html)) !== null && snippets.length < numResults) {
          snippets.push(stripHtml(m[1] ?? '').slice(0, 280));
        }
        links.forEach((l, i) => results.push({ title: l.title, url: l.url, snippet: snippets[i] ?? '' }));
        if (results.length === 0) {
          return ok('(no results: page shape may have changed or query returned nothing)', {
            tool: 'web_search',
            emptyResult: true,
          });
        }
        return ok(
          results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n'),
          { tool: 'web_search', count: results.length }
        );
      } catch (err) {
        return fail(`web_search failed (network?): ${err instanceof Error ? err.message : String(err)}`, {
          tool: 'web_search',
          networkError: true,
        });
      }
    },
  },
  {
    name: 'webpage_reader',
    description: 'Fetch a URL and extract readable text (live).',
    category: 'search',
    needsNetwork: true,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Page URL' },
        max_length: { type: 'number', description: 'Max characters', default: 8000 },
      },
      required: ['url'],
    },
    handler: async (args) => {
      try {
        const url = strArg(args, 'url');
        const maxLength = numArg(args, 'max_length', 8000);
        const html = await fetchText(url);
        const text = stripHtml(html);
        const truncated = text.length > maxLength;
        return ok(truncated ? text.slice(0, maxLength) : text, {
          tool: 'webpage_reader',
          url,
          chars: text.length,
          truncated,
        });
      } catch (err) {
        return fail(`webpage_reader failed (network?): ${err instanceof Error ? err.message : String(err)}`, {
          tool: 'webpage_reader',
          networkError: true,
        });
      }
    },
  },
  {
    name: 'weather',
    description: 'Current weather via Open-Meteo (live, no key; city auto-geocoded).',
    category: 'public-data',
    needsNetwork: true,
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' },
        latitude: { type: 'number', description: 'Latitude (skips geocoding)' },
        longitude: { type: 'number', description: 'Longitude (skips geocoding)' },
      },
      required: [],
    },
    handler: async (args) => {
      try {
        let lat = args['latitude'];
        let lon = args['longitude'];
        let place = strArg(args, 'location');
        if (typeof lat !== 'number' || typeof lon !== 'number') {
          if (!place) return fail('provide location or latitude+longitude', { tool: 'weather' });
          const geo = (await fetchJson(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`
          )) as { results?: Array<{ latitude: number; longitude: number; name: string; country?: string }> };
          const first = geo.results?.[0];
          if (!first) return fail(`geocoding found nothing for: ${place}`, { tool: 'weather', emptyResult: true });
          lat = first.latitude;
          lon = first.longitude;
          place = `${first.name}${first.country ? `, ${first.country}` : ''}`;
        }
        const wx = (await fetchJson(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`
        )) as { current?: Record<string, number | string> };
        const cur = wx.current ?? {};
        return ok(
          `${place}: ${String(cur['temperature_2m'] ?? '?')}°C, humidity ${String(cur['relative_humidity_2m'] ?? '?')}%, wind ${String(cur['wind_speed_10m'] ?? '?')} km/h (code ${String(cur['weather_code'] ?? '?')})`,
          { tool: 'weather', location: place, current: cur }
        );
      } catch (err) {
        return fail(`weather failed (network?): ${err instanceof Error ? err.message : String(err)}`, {
          tool: 'weather',
          networkError: true,
        });
      }
    },
  },
  {
    name: 'wikipedia_search',
    description: 'Wikipedia article summary via REST API (live, no key).',
    category: 'public-data',
    needsNetwork: true,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Article title or search query' },
        language: { type: 'string', description: 'Wiki language', default: 'en' },
      },
      required: ['query'],
    },
    handler: async (args) => {
      try {
        const lang = strArg(args, 'language', 'en') || 'en';
        const query = strArg(args, 'query');
        const summary = (await fetchJson(
          `https://${encodeURIComponent(lang)}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
        )) as { title?: string; extract?: string; type?: string };
        if (summary.type === 'disambiguation' || !summary.extract) {
          return ok(`(no direct article; page type: ${summary.type ?? 'unknown'})`, {
            tool: 'wikipedia_search',
            emptyResult: true,
          });
        }
        return ok(`${summary.title ?? query}\n${summary.extract}`, { tool: 'wikipedia_search', title: summary.title });
      } catch (err) {
        return fail(`wikipedia_search failed (network?): ${err instanceof Error ? err.message : String(err)}`, {
          tool: 'wikipedia_search',
          networkError: true,
        });
      }
    },
  },
  {
    name: 'arxiv_search',
    description: 'ArXiv paper search via export API (live, no key).',
    category: 'public-data',
    needsNetwork: true,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: { type: 'number', description: 'Max papers 1-10', default: 5 },
      },
      required: ['query'],
    },
    handler: async (args) => {
      try {
        const maxResults = Math.min(10, Math.max(1, numArg(args, 'max_results', 5)));
        const xml = await fetchText(
          `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(strArg(args, 'query'))}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`
        );
        const entries = xml.split('<entry>').slice(1);
        if (entries.length === 0) {
          return ok('(no papers found)', { tool: 'arxiv_search', emptyResult: true });
        }
        const out = entries.map((entry) => {
          const title = (entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').replace(/\s+/g, ' ').trim();
          const id = (entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] ?? '').trim();
          const published = (entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] ?? '').slice(0, 10);
          return `- ${title} (${published}) ${id}`;
        });
        return ok(out.join('\n'), { tool: 'arxiv_search', count: out.length });
      } catch (err) {
        return fail(`arxiv_search failed (network?): ${err instanceof Error ? err.message : String(err)}`, {
          tool: 'arxiv_search',
          networkError: true,
        });
      }
    },
  },
  {
    name: 'currency_converter',
    description: 'Currency conversion via ExchangeRate-API (live, no key).',
    category: 'public-data',
    needsNetwork: true,
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount to convert' },
        from_currency: { type: 'string', description: 'Source code, e.g. USD' },
        to_currency: { type: 'string', description: 'Target code, e.g. EUR' },
      },
      required: ['amount', 'from_currency', 'to_currency'],
    },
    handler: async (args) => {
      try {
        const from = strArg(args, 'from_currency').toUpperCase();
        const to = strArg(args, 'to_currency').toUpperCase();
        const amount = numArg(args, 'amount', NaN);
        if (!from || !to || !Number.isFinite(amount)) return fail('amount/from_currency/to_currency required', { tool: 'currency_converter' });
        const data = (await fetchJson(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`)) as {
          result?: string;
          rates?: Record<string, number>;
        };
        const rate = data.rates?.[to];
        if (data.result !== 'success' || typeof rate !== 'number') {
          return fail(`no rate for ${from}→${to}`, { tool: 'currency_converter' });
        }
        return ok(`${amount} ${from} = ${(amount * rate).toFixed(2)} ${to} (rate ${rate})`, {
          tool: 'currency_converter',
          rate,
        });
      } catch (err) {
        return fail(`currency_converter failed (network?): ${err instanceof Error ? err.message : String(err)}`, {
          tool: 'currency_converter',
          networkError: true,
        });
      }
    },
  },
  {
    name: 'location_search',
    description: 'Geocoding via Nominatim OpenStreetMap (live, no key).',
    category: 'public-data',
    needsNetwork: true,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Place query, e.g. Eiffel Tower' },
        limit: { type: 'number', description: 'Max results 1-10', default: 5 },
      },
      required: ['query'],
    },
    handler: async (args) => {
      try {
        const limit = Math.min(10, Math.max(1, numArg(args, 'limit', 5)));
        const places = (await fetchJson(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(strArg(args, 'query'))}&format=json&limit=${limit}`
        )) as Array<{ display_name?: string; lat?: string; lon?: string; type?: string }>;
        if (places.length === 0) {
          return ok('(no places found)', { tool: 'location_search', emptyResult: true });
        }
        return ok(
          places.map((p, i) => `${i + 1}. ${p.display_name ?? '?'} (${p.lat ?? '?'}, ${p.lon ?? '?'}) [${p.type ?? '?'}]`).join('\n'),
          { tool: 'location_search', count: places.length }
        );
      } catch (err) {
        return fail(`location_search failed (network?): ${err instanceof Error ? err.message : String(err)}`, {
          tool: 'location_search',
          networkError: true,
        });
      }
    },
  },
];
