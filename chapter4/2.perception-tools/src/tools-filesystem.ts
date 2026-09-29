import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { ActionResponse, ToolDef, boolArg, fail, numArg, ok, strArg } from './types.js';

export function workspaceRoot(): string {
  const fromEnv = process.env.PERCEPTION_ROOT || './workspace';
  const root = resolve(process.cwd(), fromEnv);
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return realpathSync(root);
}

export function resolveInside(root: string, rel: string): string {
  if (rel.startsWith('/') || /^[A-Za-z]:\\/.test(rel)) {
    throw new Error(`absolute paths rejected: ${rel}`);
  }
  const abs = resolve(root, rel);
  const relToRoot = relative(root, abs);
  if (relToRoot === '..' || relToRoot.startsWith(`..${sep}`)) {
    throw new Error(`path escapes workspace root: ${rel}`);
  }
  const st = existsSync(abs) ? lstatSync(abs) : null;
  if (st && st.isSymbolicLink()) throw new Error(`symlinks rejected: ${rel}`);
  return abs;
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function walkFiles(dir: string, recursive: boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (recursive) walkFiles(full, recursive, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function tokenizeLower(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/g).filter((t) => t.length > 1);
}

export const filesystemTools: ToolDef[] = [
  {
    name: 'file_reader',
    description: 'Read a text file under the workspace root (sandboxed, length-capped).',
    category: 'filesystem',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Workspace-relative file path' },
        encoding: { type: 'string', description: 'Text encoding', default: 'utf-8' },
        max_length: { type: 'number', description: 'Max characters to return', default: 50000 },
      },
      required: ['file_path'],
    },
    handler: async (args) => {
      try {
        const root = workspaceRoot();
        const abs = resolveInside(root, strArg(args, 'file_path'));
        if (!existsSync(abs)) return fail(`file not found: ${strArg(args, 'file_path')}`, { tool: 'file_reader' });
        const maxLength = numArg(args, 'max_length', 50000);
        const text = readFileSync(abs, { encoding: (strArg(args, 'encoding') || 'utf-8') as BufferEncoding });
        const truncated = text.length > maxLength;
        return ok(truncated ? text.slice(0, maxLength) : text, {
          tool: 'file_reader',
          file_path: strArg(args, 'file_path'),
          bytes: text.length,
          truncated,
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err), { tool: 'file_reader' });
      }
    },
  },
  {
    name: 'directory_browser',
    description: 'List workspace directory entries (bounded, dotfiles and symlinks skipped).',
    category: 'filesystem',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Workspace-relative directory', default: '.' },
        max_entries: { type: 'number', description: 'Max entries to return', default: 100 },
      },
      required: [],
    },
    handler: async (args) => {
      try {
        const root = workspaceRoot();
        const abs = resolveInside(root, strArg(args, 'directory', '.'));
        const maxEntries = numArg(args, 'max_entries', 100);
        const entries = readdirSync(abs, { withFileTypes: true })
          .filter((e) => !e.name.startsWith('.'))
          .slice(0, maxEntries)
          .map((e) => `${e.isDirectory() ? 'dir' : 'file'} ${e.name}`);
        return ok(entries.join('\n') || '(empty)', { tool: 'directory_browser', count: entries.length });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err), { tool: 'directory_browser' });
      }
    },
  },
  {
    name: 'grep',
    description: 'Regex-search file contents under the workspace root. Guardrails: pattern ≤200 chars, at most one quantifier (ReDoS guard — split complex patterns).',
    category: 'filesystem',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression' },
        directory: { type: 'string', description: 'Workspace-relative directory', default: '.' },
        file_pattern: { type: 'string', description: 'Glob like *.md', default: '*' },
        recursive: { type: 'boolean', description: 'Recurse into subdirectories', default: true },
        case_sensitive: { type: 'boolean', description: 'Case-sensitive match', default: false },
        max_results: { type: 'number', description: 'Max matches', default: 100 },
      },
      required: ['pattern'],
    },
    handler: async (args) => {
      try {
        const root = workspaceRoot();
        const abs = resolveInside(root, strArg(args, 'directory', '.'));
        const pattern = strArg(args, 'pattern');
        if (pattern.length > 200) {
          return fail('pattern too long (max 200 chars, ReDoS guard)', { tool: 'grep' });
        }
        const quantifiers = pattern.replace(/\\[+*?{]/g, '').match(/[+*{]/g) ?? [];
        if (quantifiers.length > 1) {
          return fail('nested quantifiers rejected (ReDoS guard: split into simpler patterns)', { tool: 'grep' });
        }
        const flags = boolArg(args, 'case_sensitive', false) ? 'g' : 'gi';
        const re = new RegExp(pattern, flags);
        const fileRe = globToRegExp(strArg(args, 'file_pattern', '*'));
        const maxResults = numArg(args, 'max_results', 100);
        const hits: string[] = [];
        for (const file of walkFiles(abs, boolArg(args, 'recursive', true))) {
          const base = file.split(sep).pop() ?? '';
          if (!fileRe.test(base)) continue;
          let text: string;
          try {
            text = readFileSync(file, 'utf-8');
          } catch {
            continue;
          }
          const lines = text.split('\n');
          lines.forEach((line, i) => {
            if (hits.length >= maxResults) return;
            re.lastIndex = 0;
            if (re.test(line)) hits.push(`${relative(root, file)}:${i + 1}: ${line.trim().slice(0, 160)}`);
          });
          if (hits.length >= maxResults) break;
        }
        return ok(hits.length > 0 ? hits.join('\n') : '(no matches)', {
          tool: 'grep',
          matches: hits.length,
          emptyResult: hits.length === 0,
        });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err), { tool: 'grep' });
      }
    },
  },
  {
    name: 'knowledge_base_search',
    description: 'Rank workspace .md/.txt documents against a query by token overlap.',
    category: 'filesystem',
    needsNetwork: false,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        top_k: { type: 'number', description: 'Top results', default: 5 },
      },
      required: ['query'],
    },
    handler: async (args) => {
      try {
        const root = workspaceRoot();
        const queryTerms = new Set(tokenizeLower(strArg(args, 'query')));
        const files = walkFiles(root, true).filter((f) => /\.(md|txt)$/i.test(f));
        const scored = files.map((file) => {
          let text = '';
          try {
            text = readFileSync(file, 'utf-8');
          } catch {
            return { file, score: 0 };
          }
          const terms = tokenizeLower(text);
          const uniq = new Set(terms);
          let score = 0;
          for (const t of queryTerms) if (uniq.has(t)) score += 1;
          return { file, score };
        }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
        const topK = numArg(args, 'top_k', 5);
        const top = scored.slice(0, topK);
        return ok(
          top.length > 0 ? top.map((r) => `${relative(root, r.file)} (overlap=${r.score})`).join('\n') : '(no matches)',
          { tool: 'knowledge_base_search', matches: top.length, emptyResult: top.length === 0 }
        );
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err), { tool: 'knowledge_base_search' });
      }
    },
  },
];
