/**
 * Skills Agent（对应官方 demo.py 的 agentic loop）。
 *
 * 三个加载工具实现渐进式披露：
 *   read_skill(name)        第二层：加载 SKILL.md 完整流程
 *   read_skill_file(name,path)  第三层：加载子文档 / 脚本源码
 *   run_skill_script(name,script,outline,output)  执行捆绑脚本生成 .pptx
 *
 * 模型用 Ollama（gemma4）。脚本执行走 .venv/bin/python（python-pptx）。
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { scanSkillCatalog, renderCatalog } from './catalog.js';

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface RunResult {
  calls: ToolCall[];
  finalAnswer: string;
  generatedPptx: string | null;
}

interface OllamaMsg {
  role: string;
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
  thinking?: string;
  tool_name?: string;
}

interface OllamaResponse {
  message: OllamaMsg;
}

export class OllamaError extends Error {}

function pyBin(projectRoot: string): string {
  const venv = path.join(projectRoot, '.venv', 'bin', 'python');
  return existsSync(venv) ? venv : 'python3';
}

/**
 * 修复模型生成的"接近合法"的 JSON：
 * 模型常把正文里的中文直引号 " 原样抄进 JSON 字符串，导致 JSON.parse 失败。
 * 逐字符扫描：在字符串值内部遇到的 " 且后面不是结构符号（, } ] :）时，转义为 \"。
 */
export function repairJson(s: string): string {
  let out = '';
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inStr) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        while (j < s.length && /[\s]/.test(s[j]!)) j++;
        const next = s[j];
        if (next === ',' || next === '}' || next === ']' || next === ':') {
          inStr = false;
          out += ch;
        } else {
          out += '\\"'; // 字符串内部的裸引号 → 转义
        }
        continue;
      }
      out += ch;
    } else {
      if (ch === '"') {
        inStr = true;
        out += ch;
      } else {
        out += ch;
      }
    }
  }
  return out;
}

export class SkillsAgent {
  readonly projectRoot: string;
  readonly skillsDir: string;
  readonly model: string;
  readonly baseUrl: string;
  private maxIterations = 12;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.skillsDir = path.join(projectRoot, 'skills');
    this.model = process.env.MODEL_NAME ?? 'gemma4:latest';
    this.baseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
  }

  private toolSchemas(): Array<Record<string, unknown>> {
    return [
      {
        type: 'function',
        function: {
          name: 'read_skill',
          description: '加载指定 Skill 的完整 SKILL.md（核心流程与脚本约定）。',
          parameters: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Skill 名称，如 pptx' } },
            required: ['name'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'read_skill_file',
          description: '加载 Skill 的子文档或脚本源码（reference.md / scripts/*.py）。',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Skill 名称' },
              path: { type: 'string', description: '相对 Skill 目录的路径，如 reference.md 或 scripts/generate_pptx.py' },
            },
            required: ['name', 'path'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'run_skill_script',
          description: '执行 Skill 捆绑的脚本。outline 必须是符合该 Skill 约定的合法 JSON 字符串。',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Skill 名称' },
              script: { type: 'string', description: '脚本文件名，如 generate_pptx.py' },
              outline: { type: 'string', description: '脚本需要的 JSON 参数（大纲）' },
              output: { type: 'string', description: '输出文件路径，默认 output/presentation.pptx' },
            },
            required: ['name', 'script', 'outline'],
          },
        },
      },
    ];
  }

  /** 第一层：系统提示词只含薄 Skill 目录。 */
  async systemPrompt(): Promise<string> {
    const metas = await scanSkillCatalog(this.skillsDir);
    return [
      'You are an agent with access to a set of Skills. Skills are loaded on demand via progressive disclosure.',
      '== 已安装的 Skills（薄目录，仅元数据）==',
      renderCatalog(metas),
      '',
      'When a task needs a Skill: (1) call read_skill to load its SKILL.md, (2) if needed read_skill_file for details, (3) run its bundled script with run_skill_script. Do not guess how a Skill works before reading it.',
    ].join('\n');
  }

  private async readSkill(name: string): Promise<string> {
    const file = path.join(this.skillsDir, name, 'SKILL.md');
    try {
      const content = await fs.readFile(file, 'utf8');
      return `【渐进式披露·第二层】已加载 ${name}/SKILL.md（${content.length} 字符）:\n\n${content}`;
    } catch {
      return `错误: Skill '${name}' 不存在或没有 SKILL.md`;
    }
  }

  private async readSkillFile(name: string, rel: string): Promise<string> {
    const abs = path.resolve(this.skillsDir, name);
    const target = path.resolve(abs, rel);
    if (target !== abs && !target.startsWith(abs + path.sep)) return '错误: 路径越界';
    try {
      const content = await fs.readFile(target, 'utf8');
      return `【渐进式披露·第三层】已加载 ${name}/${rel}（${content.length} 字符）:\n\n${content}`;
    } catch {
      return `错误: 无法读取 ${name}/${rel}`;
    }
  }

  private runScript(name: string, script: string, outline: string, output: string): Promise<string> {
    return new Promise((resolve) => {
      const scriptPath = path.resolve(this.skillsDir, name, 'scripts', script);
      const safe = path.resolve(this.skillsDir, name);
      if (scriptPath !== safe && !scriptPath.startsWith(safe + path.sep)) {
        resolve(`错误: 脚本路径越界 ${script}`);
        return;
      }
      if (!existsSync(scriptPath)) {
        resolve(`错误: 脚本不存在 ${name}/scripts/${script}`);
        return;
      }
      // 校验 outline 是合法 JSON（模型常带中文引号，先修复再解析）
      let outlineObj: unknown;
      try {
        outlineObj = JSON.parse(outline);
      } catch (e1) {
        try {
          outlineObj = JSON.parse(repairJson(outline));
        } catch {
          const err = (e1 as Error).message.slice(0, 120);
          const truncated = /Unterminated string|Expected ','|Unexpected end/i.test(err);
          resolve(
            truncated
              ? `错误: outline 被截断了（${err}）。工具参数有长度限制，请把大纲压缩到 1000 字符以内：每页 bullet 用短短语，页数 6-8 页，然后重试。`
              : `错误: outline 不是合法 JSON（${err}）。请确保是合法的 JSON 对象，然后重试。`
          );
          return;
        }
      }
      const tmpOutline = path.join(this.projectRoot, '.outline_tmp.json');
      const outAbs = path.resolve(this.projectRoot, output);
      void fs.writeFile(tmpOutline, JSON.stringify(outlineObj)).then(() => {
        const py = pyBin(this.projectRoot);
        const child = spawn(py, [scriptPath, tmpOutline, outAbs], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        child.on('error', (e) => { void fs.rm(tmpOutline, { force: true }); resolve(`错误: 无法启动 python（${py}）: ${e.message}`); });
        child.on('close', (code) => {
          void fs.rm(tmpOutline, { force: true });
          if (code !== 0) resolve(`脚本退出码 ${code}: ${stderr.slice(0, 400)}`);
          else resolve(stdout.trim());
        });
      });
    });
  }

  private async chatOnce(messages: OllamaMsg[]): Promise<OllamaResponse> {
    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools: this.toolSchemas(),
        options: { temperature: 0.3 },
        stream: false,
      }),
    });
    if (!resp.ok) throw new OllamaError(`Ollama HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    return (await resp.json()) as OllamaResponse;
  }

  /** 在线模式：模型驱动渐进式披露，生成 pptx。 */
  async runAgentic(task: string): Promise<RunResult> {
    const messages: OllamaMsg[] = [
      { role: 'system', content: await this.systemPrompt() },
      { role: 'user', content: task },
    ];
    const calls: ToolCall[] = [];
    let finalAnswer = '';
    let generatedPptx: string | null = null;

    for (let i = 0; i < this.maxIterations; i++) {
      const response = await this.chatOnce(messages);
      const msg = response.message;
      const toolCalls = msg.tool_calls ?? [];

      if (toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: msg.content ?? '',
          tool_calls: toolCalls,
          ...(msg.thinking ? { thinking: msg.thinking } : {}),
        });
        for (const tc of toolCalls) {
          const args = (typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments || '{}')
            : tc.function.arguments) as Record<string, unknown>;
          calls.push({ name: tc.function.name, args });
          let result: string;
          switch (tc.function.name) {
            case 'read_skill':
              result = await this.readSkill(String(args.name ?? ''));
              break;
            case 'read_skill_file':
              result = await this.readSkillFile(String(args.name ?? ''), String(args.path ?? ''));
              break;
            case 'run_skill_script': {
              result = await this.runScript(
                String(args.name ?? ''),
                String(args.script ?? ''),
                String(args.outline ?? ''),
                String(args.output ?? 'output/presentation.pptx')
              );
              // 生成成功后记录路径
              try {
                const parsed = JSON.parse(result);
                if (parsed?.path) generatedPptx = parsed.path;
              } catch {
                /* 非 JSON 输出 */
              }
              break;
            }
            default:
              result = `未知工具 ${tc.function.name}`;
          }
          messages.push({ role: 'tool', tool_name: tc.function.name, content: result });
        }
      } else {
        finalAnswer = msg.content ?? '';
        break;
      }
    }

    return { calls, finalAnswer, generatedPptx };
  }
}