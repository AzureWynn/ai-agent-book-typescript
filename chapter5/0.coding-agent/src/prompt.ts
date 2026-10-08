// 系统提示词 + 环境状态栏：官方 system-prompt.md 与 SystemState 的本地教学版。
// 状态栏每轮末尾动态注入（不进静态前缀，KV Cache 友好）；只读 git 信息，不改仓库。
import { execSync } from 'node:child_process';
import { TOOL_DEFS } from './tools.js';

function git(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, timeout: 5000, encoding: 'utf8' }).trim() || '—';
  } catch {
    return '—';
  }
}

export function buildStatusBar(repoRoot: string): string {
  const branch = git('git branch --show-current', repoRoot);
  const status = git('git status --short | head -8', repoRoot);
  const recent = git('git log --oneline -3', repoRoot);
  return [
    `<system_hint>`,
    `工作目录: ${repoRoot}`,
    `git 分支: ${branch} | 未提交变更: ${status === '—' ? '无' : status}`,
    `最近提交: ${recent}`,
    `本轮只准用下面七个工具，不要编新工具名；一次只调一个工具。`,
    `</system_hint>`,
  ].join('\n');
}

export const SYSTEM_PROMPT = `你是 Coding Agent，在沙盒工作区里帮用户完成编程任务。
可用七个工具（一次调用一个）：
${TOOL_DEFS.map((t) => `- ${t.name} ${t.argsHint}：${t.description}`).join('\n')}

输出协议（二选一，不许混用）：
1. 调工具时：只输出一个 \`\`\`tool 代码块，里面是 JSON：{"name":"工具名","args":{…}}，块外不写任何字。
2. 任务完成时：以 FINAL: 开头写最终答复（用户直接可见）。

第一轮示范（任务"整理 TODO"时，你的第一轮回复全文只能是下面三行）：
\`\`\`tool
{"name":"grep","args":{"pattern":"TODO"}}
\`\`\`

铁律：
- 你有手，自己调工具干，不许给用户写"教程/脚本/步骤"让用户去跑——用户只看 FINAL。
- 先读/搜再改：改文件前必须 read 看过原文；edit 的 oldText 必须从原文逐字复制。
- 声称完成前必须用工具验证（跑测试/重读文件），不许"我觉得行了"。
- 不许跳出 workspace，不许编工具名，不许在答复里贴密钥。
- 卡住（同一工具同样参数连错 2 次）就换策略：换关键词搜、读相邻文件、缩小范围。`;
