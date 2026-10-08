// demo：在线臂全流程；eval：在线 vs 离线双臂门禁对照表。
import { USER_REQUEST, SUBMISSION } from './prompts.js';
import { renderOfflineForm } from './offline.js';
import { validateForm } from './validate.js';
import { executeForm } from './execute.js';
import { runOnlineArm } from './online.js';

const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'demo';

function gates(name: string, html: string, staticReport: Record<string, boolean>, exec: { initialHidden: boolean; visibleAfterRoundTrip: boolean; submitCount: number; submitted: Record<string, unknown> | null; error?: string }, summary: string): { name: string; pass: boolean; detail: string }[] {
  const submitted = exec.submitted ?? {};
  const valuesOk = (Object.entries(SUBMISSION) as [string, string][]).every(([k, v]) => submitted[k] === v);
  const digits = summary.replace(/\D/g, '');
  // 中文日期会写成"8月11日"（无前导零），数字串里两种写法都认
  const summaryHit = summary.includes('北京') && summary.includes('上海')
    && (digits.includes('20260811') || digits.includes('2026811'))
    && (digits.includes('20260818') || digits.includes('2026818'));
  return [
    { name: '表单完整', pass: /<!doctype|<html/i.test(html) && html.toLowerCase().includes('<script'), detail: `${html.length} 字符` },
    { name: '静态6项', pass: Object.values(staticReport).every(Boolean), detail: Object.entries(staticReport).filter(([, v]) => !v).map(([k]) => k).join('、') || '全过' },
    { name: '返程默认隐藏', pass: exec.initialHidden, detail: exec.error ?? (exec.initialHidden ? '隐藏' : '可见（该隐藏）') },
    { name: '切往返后可见', pass: exec.visibleAfterRoundTrip, detail: exec.error ?? (exec.visibleAfterRoundTrip ? '可见' : '仍隐藏') },
    { name: '提交恰一次', pass: exec.submitCount === 1, detail: `submit=${exec.submitCount}` },
    { name: 'payload值全对', pass: valuesOk, detail: valuesOk ? '4 字段一致' : JSON.stringify(submitted).slice(0, 120) },
    { name: '摘要含四要素', pass: summaryHit, detail: summary.slice(0, 80).replace(/\n/g, ' ') || '（无摘要）' },
  ];
}

async function main() {
  if (mode === 'demo') {
    console.log(`# 在线臂全流程\n请求：${USER_REQUEST}\n`);
    console.log('[步骤1] 模型生成表单 → 静态校验：');
    const out = await runOnlineArm(true);
    const { writeFileSync } = await import('node:fs');
    writeFileSync('/tmp/form12.html', out.html);
    console.log(`\n[步骤2] jsdom 真执行（尝试 ${out.attempts}）：`);
    console.log(`  返程默认隐藏=${out.exec.initialHidden} 切往返可见=${out.exec.visibleAfterRoundTrip} 提交=${out.exec.submitCount}次`);
    console.log(`  payload=${JSON.stringify(out.exec.submitted)}`);
    console.log(`\n[步骤3] 摘要：\n${out.summary}`);
  } else {
    const rows: { arm: string; checks: { name: string; pass: boolean; detail: string }[] }[] = [];
    const online = await runOnlineArm(false);
    rows.push({ arm: 'online(模型生成)', checks: gates('online', online.html, online.staticReport, online.exec, online.summary) });
    const offHtml = renderOfflineForm(USER_REQUEST);
    const offV = validateForm(offHtml);
    const offExec = await executeForm(offHtml);
    // 离线摘要走确定性模板（官方 summarize_offline 对应）：只验格式闭环，不计入模型能力
    const offSummary = `已收到您的订票信息：${String(offExec.submitted?.['departure_city'] ?? '?')} → 北京，出发日期 ${String(offExec.submitted?.['departure_date'] ?? '?')}。行程类型：往返，返程日期 ${String(offExec.submitted?.['return_date'] ?? '?')}。正在为您检索航班...`;
    rows.push({ arm: 'offline(确定性渲染)', checks: gates('offline', offHtml, offV.report as unknown as Record<string, boolean>, offExec, offSummary) });
    console.log('\n臂                门禁        结果  说明\n--                ----        ----  ----');
    for (const r of rows) {
      for (const c of r.checks) console.log(`${r.arm}  ${c.name}  ${c.pass ? '✓' : '✗'}  ${c.detail}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
