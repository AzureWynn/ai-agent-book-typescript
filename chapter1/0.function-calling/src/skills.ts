/**
 * Skill 加载器 —— 对齐真实框架（Agent Skills 规范，agentskills.io/specification）。
 *
 * 每个 skill 是一个独立文件夹，包含：
 *   skills/<name>/SKILL.md          # 方法论指导 + frontmatter 元数据（必选）
 *   skills/<name>/tools.ts          # 该 skill 专属的可执行工具（可选）
 *   skills/<name>/任意数据文件.json  # 附带的数据/资源（可选，加载时注入）
 *
 * frontmatter 字段对齐官方规范：name / description / allowed-tools。
 * allowed-tools：空格分隔的字符串，声明该 skill 可使用的工具（运行时据此授权）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Tool } from './tools.js';

const SKILLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills');

/** skill 的元数据（来自 SKILL.md 的 frontmatter） */
export interface SkillMeta {
  name: string;
  description: string;
  /** 该 skill 允许使用的工具名（官方字段 allowed-tools，空格分隔） */
  allowedTools: string[];
}

/** 加载完成的 skill 包 */
export interface LoadedSkill {
  name: string;
  description: string;
  allowedTools: string[];
  instruction: string;   // SKILL.md 正文（方法论）
  tools: Tool[];         // 该 skill 专属的工具
  files: Record<string, string>; // 附带的数据/资源文件（文件名 -> 内容）
}

/** 简单解析 SKILL.md 的 YAML frontmatter（--- 包裹的键值块） */
function parseFrontmatter(md: string): { meta: SkillMeta; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) {
    return { meta: { name: '', description: '', allowedTools: [] }, body: md };
  }
  const [, yaml, body] = m;
  const meta: SkillMeta = { name: '', description: '', allowedTools: [] };
  for (const line of (yaml ?? '').split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    if (key === 'name') meta.name = (value ?? '').trim();
    if (key === 'description') meta.description = (value ?? '').trim();
    if (key === 'allowed-tools') {
      // 官方格式：空格分隔的工具名列表，如 "get_weather calculator"
      meta.allowedTools = (value ?? '').trim().split(/\s+/).filter(Boolean);
    }
  }
  return { meta, body: body ?? '' };
}

/** 扫描 skills/ 目录，返回每个 skill 的元数据（供"按需动态加载"时自动匹配） */
export function scanSkills(): SkillMeta[] {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const mdFile = path.join(SKILLS_DIR, e.name, 'SKILL.md');
      if (!fs.existsSync(mdFile)) return null;
      const { meta } = parseFrontmatter(fs.readFileSync(mdFile, 'utf8'));
      if (!meta.name) meta.name = e.name;
      return meta;
    })
    .filter((m): m is SkillMeta => m !== null);
}

/** 列出所有 skill 名 */
export function listSkills(): string[] {
  return scanSkills().map((s) => s.name);
}

/** 把 skill 文本包装成注入 system 的格式 */
export function wrapSkill(skillContent: string): string {
  return `以下是你要遵循的操作规范（Skill），请严格按其执行：\n\n---\n${skillContent}\n---`;
}

/**
 * 按需动态加载：根据用户问题在 skill 清单里做关键词匹配，返回最合适的 skill 名。
 * （真实框架里这一步通常由运行时 + 模型判断；这里用简单的关键词规则演示。）
 */
export function pickSkill(question: string): string | undefined {
  const skills = scanSkills();
  return skills.find((s) => {
    const desc = s.description;
    const q = question;
    const isWeather = /天气|温度|晴|雨/.test(q) && /天气/.test(desc);
    const isTime = /现在|几点|时间|日期|星期/.test(q) && /时间/.test(desc);
    const isCalc = /算|计算|等于/.test(q) && /计算/.test(desc);
    return isWeather || isTime || isCalc;
  })?.name;
}

/**
 * 按名加载 skill：
 * - 读 SKILL.md 的 frontmatter + 正文
 * - 加载附带的数据文件（*.json），以「文件名 -> 内容」存入 files
 * - 动态 import 同目录的 tools.ts，若导出工厂函数则用附带数据调用它
 */
export async function loadSkill(name: string): Promise<LoadedSkill | null> {
  const dir = path.join(SKILLS_DIR, name);
  const mdFile = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(mdFile)) return null;

  const md = fs.readFileSync(mdFile, 'utf8');
  const { meta, body } = parseFrontmatter(md);
  if (!meta.name) meta.name = name;

  // 加载附带的数据文件（JSON），按「文件名 -> 内容字符串」存放
  const files: Record<string, string> = {};
  for (const f of fs.readdirSync(dir)) {
    if (f === 'SKILL.md' || f === 'tools.ts') continue;
    const full = path.join(dir, f);
    if (fs.statSync(full).isFile()) {
      files[f] = fs.readFileSync(full, 'utf8');
    }
  }

  // 动态加载专属工具（可选）
  let tools: Tool[] = [];
  const toolsFile = path.join(dir, 'tools.ts');
  if (fs.existsSync(toolsFile)) {
    try {
      const mod = await import(pathToFileURL(toolsFile).href);
      const factory = mod.createWeatherTool as ((files?: Record<string, unknown>) => Tool[]) | undefined;
      if (typeof factory === 'function') {
        // 把附带数据解析成对象注入工具（演示"skill 数据文件喂给工具"）
        const cityCodes = JSON.parse(files['city-codes.json'] ?? '{}');
        tools = factory(cityCodes);
      } else {
        tools = (mod.skillTools ?? []) as Tool[];
      }
    } catch (e) {
      console.warn(`⚠️ 加载 skill "${name}" 的工具失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  return { name: meta.name, description: meta.description, allowedTools: meta.allowedTools, instruction: body, tools, files };
}