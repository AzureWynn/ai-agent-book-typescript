import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ParsedFields, ParseAttempt } from './types.js';

export interface RegisteredParser {
  name: string;
  kind: 'builtin' | 'file';
  file?: string;
}

async function runModuleParse(file: string, line: string): Promise<Record<string, unknown> | null> {
  const script = [
    'import sys, json, importlib.util',
    `spec = importlib.util.spec_from_file_location("candidate", ${JSON.stringify(resolve(file))})`,
    'mod = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(mod)',
    'result = mod.parse(sys.argv[1])',
    'print(json.dumps(result))',
  ].join('\n');
  return new Promise((resolvePromise) => {
    execFile('python3', ['-c', script, line], { timeout: 15000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        resolvePromise(null);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(String(stdout).trim());
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          resolvePromise(parsed as Record<string, unknown>);
        } else {
          resolvePromise(null);
        }
      } catch {
        resolvePromise(null);
      }
    });
  });
}

export class ParseEngine {
  private parsers: RegisteredParser[] = [];
  readonly parsersDir: string;

  constructor(parsersDir: string) {
    this.parsersDir = parsersDir;
    if (!existsSync(parsersDir)) mkdirSync(parsersDir, { recursive: true });
    this.parsers.push({ name: 'builtin_json', kind: 'builtin' });
  }

  listParsers(): string[] {
    return this.parsers.map((p) => p.name);
  }

  registerFileParser(name: string, file: string): void {
    if (!this.parsers.some((p) => p.name === name)) {
      this.parsers.push({ name, kind: 'file', file });
    }
  }

  loadPersisted(): string[] {
    const loaded: string[] = [];
    for (const entry of readdirSync(this.parsersDir)) {
      if (!entry.endsWith('.py') || entry.startsWith('_candidate')) continue;
      const name = entry.slice(0, -3);
      this.registerFileParser(name, join(this.parsersDir, entry));
      loaded.push(name);
    }
    return loaded;
  }

  persistParser(name: string, code: string): string {
    const file = join(this.parsersDir, `${name}.py`);
    writeFileSync(file, code.endsWith('\n') ? code : `${code}\n`, 'utf-8');
    this.registerFileParser(name, file);
    return file;
  }

  async parseLine(line: string): Promise<ParseAttempt> {
    for (const p of this.parsers) {
      if (p.kind === 'builtin') {
        try {
          const obj = JSON.parse(line) as unknown;
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            return { parser: p.name, fields: { _parser: p.name, ...(obj as Record<string, unknown>) } };
          }
        } catch {
          continue;
        }
      } else if (p.file) {
        const fields = await runModuleParse(p.file, line);
        if (fields) return { parser: p.name, fields: { _parser: p.name, ...fields } };
      }
    }
    return { parser: null, fields: null };
  }

  async runCandidateFile(file: string, line: string): Promise<Record<string, unknown> | null> {
    return runModuleParse(file, line);
  }
}
