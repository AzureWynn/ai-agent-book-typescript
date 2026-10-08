// github_mcp.py 的本地替代：投递动作换成本地 Issue 草稿（含脱敏收据栏）。
// 诊断三件套（定位→回归→重放）不受影响；有 token 时照此草稿一键投递。
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Problem } from './diagnoser.js';
import type { ReplayVerdict } from './replay.js';

export function writeIssueDraft(dir: string, scenarioId: string, problems: Problem[], verdicts: ReplayVerdict[]): string {
  const lines = [
    `# [诊断] ${scenarioId} 根因与回归`,
    '',
    ...problems.map((p, i) => [
      `## P${i + 1} ${p.title}（${p.priority} · ${p.module} · ${p.prd_ref}）`,
      '',
      p.description ?? '',
      '',
      `建议：${p.suggestion ?? '—'}`,
      '',
    ].join('\n')),
    '## 回归重放',
    '',
    ...verdicts.map((v) => `- ${v.test_id}: ${v.flip ? 'FAIL→PASS 翻转 ✓' : `未翻转（buggy ${v.buggy ? '过' : '挂'} / fixed ${v.fixed ? '过' : '挂'}）`} —— ${v.detail}`),
    '',
    '> 脱敏收据：本草稿不含真实凭据；投递时由持 token 者执行。',
    '',
  ];
  const path = join(dir, `ISSUE_DRAFT-${scenarioId.replace(/\s+/g, '_')}.md`);
  writeFileSync(path, lines.join('\n'));
  return path;
}
