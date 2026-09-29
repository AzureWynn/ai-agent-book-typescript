import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ownWorkspace } from './servers.js';

export interface TaskDef {
  id: string;
  steps: string[];
  needs: string[];
  check: (workspace: string) => { pass: boolean; detail: string };
}

function newestMatch(workspace: string, prefix: string): string | null {
  if (!existsSync(workspace)) return null;
  const files = readdirSync(workspace)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.md'))
    .map((f) => ({ f, t: Number(f.slice(prefix.length, -3)) || 0 }))
    .sort((a, b) => b.t - a.t);
  return files.length > 0 && files[0] ? join(workspace, files[0].f) : null;
}

export function workspaceDir(): string {
  return ownWorkspace();
}

export function buildTasks(stamp: number): TaskDef[] {
  return [
    {
      id: 'T1-weather-report',
      needs: ['weather', 'file_write'],
      steps: [
        '查出北京今天的温度。',
        `把温度存进 weather-report-${stamp}.md（一句话含温度数字）。`,
        '用一句话总结天气情况。',
      ],
      check: (workspace) => {
        const file = newestMatch(workspace, 'weather-report-');
        if (!file) return { pass: false, detail: 'report file missing' };
        const text = readFileSync(file, 'utf-8');
        const ok = /-?\d+(\.\d+)?°C/.test(text);
        return { pass: ok, detail: ok ? `${file.split('/').pop()} has temperature` : 'no temperature found' };
      },
    },
    {
      id: 'T2-arxiv-notes',
      needs: ['arxiv_search', 'file_write'],
      steps: [
        '搜arXiv上 model context protocol 的论文（最多5条）。',
        `把前两篇的标题和链接存进 arxiv-notes-${stamp}.md。`,
        '用一句话总结搜到了什么。',
      ],
      check: (workspace) => {
        const file = newestMatch(workspace, 'arxiv-notes-');
        if (!file) return { pass: false, detail: 'notes file missing' };
        const links = readFileSync(file, 'utf-8').match(/arxiv\.org\/abs\//g) ?? [];
        return { pass: links.length >= 2, detail: `${links.length} arxiv links (need ≥2)` };
      },
    },
    {
      id: 'T3-order-approval',
      needs: ['spawn_subagent', 'request_admin_approval', 'file_write'],
      steps: [
        '查出订单A12345的状态。',
        '请求管理员审批发货（审批时把 auto_approve 设为 true）。',
        `把订单状态和审批结果写进 order-review-${stamp}.md，并用一句话总结。`,
      ],
      check: (workspace) => {
        const file = newestMatch(workspace, 'order-review-');
        if (!file) return { pass: false, detail: 'review file missing' };
        const text = readFileSync(file, 'utf-8').toLowerCase();
        const hasStatus = text.includes('shipped');
        const hasApproval = text.includes('approv');
        return { pass: hasStatus && hasApproval, detail: `shipped=${hasStatus} approval=${hasApproval}` };
      },
    },
  ];
}
