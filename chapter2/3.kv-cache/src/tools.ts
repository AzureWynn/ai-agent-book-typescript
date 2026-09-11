/**
 * 本地文件系统工具（对应官方 LocalFileTools）：read_file / find / grep。
 * 安全约束：拒绝 root 目录外的路径访问。
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export class LocalFileTools {
  constructor(readonly root: string) {}

  getSchemas(): Array<Record<string, unknown>> {
    return [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read the text content of a file. Returns the first 4000 characters.',
          parameters: {
            type: 'object',
            properties: { file_path: { type: 'string', description: 'Relative path of the file inside the project root' } },
            required: ['file_path'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'find',
          description: 'List files under a directory whose name contains the given pattern.',
          parameters: {
            type: 'object',
            properties: {
              pattern: { type: 'string', description: 'Substring to match against file names' },
              root_dir: { type: 'string', description: 'Relative directory to search (default project root)' },
            },
            required: ['pattern'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'grep',
          description: 'Search a file for lines containing a pattern.',
          parameters: {
            type: 'object',
            properties: {
              pattern: { type: 'string', description: 'Text to search for' },
              file_path: { type: 'string', description: 'Relative path of the file' },
            },
            required: ['pattern', 'file_path'],
          },
        },
      },
    ];
  }

  private resolve(rel: string): string {
    const root = path.resolve(this.root);
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      throw new Error(`路径超出 root 限制: ${rel}`);
    }
    return abs;
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    try {
      switch (name) {
        case 'read_file':
          return await this.readFile(String(args.file_path ?? ''));
        case 'find':
          return await this.find(String(args.pattern ?? ''), String(args.root_dir ?? '.'));
        case 'grep':
          return await this.grep(String(args.pattern ?? ''), String(args.file_path ?? ''));
        default:
          return JSON.stringify({ error: `未知工具 ${name}` });
      }
    } catch (e) {
      return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  private async readFile(rel: string): Promise<string> {
    const abs = this.resolve(rel);
    const content = await fs.readFile(abs, 'utf8');
    return content.slice(0, 4000) + (content.length > 4000 ? '\n…(truncated)' : '');
  }

  private async find(pattern: string, rootDir: string): Promise<string> {
    const abs = this.resolve(rootDir);
    const hits: string[] = [];
    async function walk(dir: string): Promise<void> {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === '.venv') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.name.includes(pattern)) hits.push(path.relative(abs, full));
      }
    }
    await walk(abs);
    return hits.length ? hits.join('\n') : `未找到文件名包含 "${pattern}" 的文件`;
  }

  private async grep(pattern: string, rel: string): Promise<string> {
    const abs = this.resolve(rel);
    const content = await fs.readFile(abs, 'utf8');
    const lines = content.split('\n');
    const hits = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.includes(pattern))
      .slice(0, 30)
      .map(({ line, i }) => `${i + 1}: ${line.slice(0, 200)}`);
    return hits.length ? hits.join('\n') : `未找到包含 "${pattern}" 的行`;
  }
}