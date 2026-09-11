/**
 * Skill 目录扫描（对应官方 scan_skill_catalog）。
 * 只解析 SKILL.md 顶部 YAML frontmatter 的 name + description —— 这就是第一层（元数据）。
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export interface SkillMeta {
  name: string;
  description: string;
}

/** 解析 SKILL.md 的 YAML frontmatter（--- 之间的 name / description）。 */
function parseFrontmatter(content: string): { name?: string; description?: string } {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]!] = kv[2]!.trim();
  }
  return meta;
}

/** 扫描 skills/ 目录下所有 SKILL.md，返回薄目录（仅元数据）。 */
export async function scanSkillCatalog(skillsDir: string): Promise<SkillMeta[]> {
  const metas: SkillMeta[] = [];
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const skillFile = path.join(skillsDir, e.name, 'SKILL.md');
    try {
      const content = await fs.readFile(skillFile, 'utf8');
      const meta = parseFrontmatter(content);
      if (meta.name) {
        metas.push({ name: meta.name, description: meta.description ?? '' });
      }
    } catch {
      /* 没有 SKILL.md 的目录不是 Skill */
    }
  }
  return metas;
}

/** 渲染成系统提示词里的薄目录文本。 */
export function renderCatalog(metas: SkillMeta[]): string {
  if (!metas.length) return '（无已安装 Skill）';
  return metas
    .map((m) => `- ${m.name}: ${m.description}`)
    .join('\n');
}