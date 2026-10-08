// diagnoser.py 对应：两阶段真实 LLM 调用。JSON 从 ```json 围栏/裸 JSON 鲁棒提取。
import { Ollama } from 'ollama';
import 'dotenv/config';
import type { Trajectory } from './sut.js';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

const ASSERTION_SPEC = `可用断言类型（assertion.type 只能取以下之一）：
- "step_present"    params: {"tool": 工具名}              该工具必须在轨迹中出现
- "tool_succeeds"   params: {"tool": 工具名}              该工具最终成功且无"多次失败后误报成功"
- "latency_under"   params: {"tool": 工具名, "threshold_ms": 整数}  该工具单次延迟须低于阈值
- "final_status_is" params: {"value": "success"|"failed"}  任务最终状态必须等于给定值`;

async function chat(system: string, user: string): Promise<string> {
  const ollama = new Ollama({ host: BASE_URL });
  const p = ollama.chat({
    model: MODEL,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    options: { temperature: 0 },
  });
  const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ollama timeout')), CHAT_TIMEOUT_MS));
  return ((await Promise.race([p, timer])).message.content || '').trim();
}

export function extractJson(raw: string): Record<string, unknown> {
  const fence = raw.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  const body = (fence?.[1] ?? raw).trim();
  const obj = body.match(/\{[\s\S]*\}/);
  try {
    return (obj ? JSON.parse(obj[0]) : {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export interface Problem {
  title: string;
  priority: string;
  module: string;
  description: string;
  suggestion: string;
  trajectory_ids: string[];
  prd_ref: string;
}

export async function diagnose(architecture: string, prd: string, trajectories: Trajectory[]): Promise<Problem[]> {
  const raw = await chat(
    '你是资深 Agent 系统诊断专家。给定架构、PRD 与生产轨迹，逐条核对找出偏离项，只报告确有证据的问题，不要臆造。只输出 JSON。',
    `# 系统架构\n${architecture}\n\n# PRD\n${prd}\n\n# 生产轨迹\n${JSON.stringify(trajectories, null, 2)}\n\n# 任务\n输出 {"problems": [{"title": "…", "priority": "P0|P1|P2|P3", "module": "架构中的模块名", "description": "引用轨迹与轮次", "suggestion": "…", "trajectory_ids": ["…"], "prd_ref": "R1-R4"}]}。只输出 JSON。`
  );
  const data = extractJson(raw);
  return (Array.isArray(data.problems) ? data.problems : []) as Problem[];
}

export interface TestCase {
  test_id: string;
  trajectory_id: string;
  description: string;
  assertion: { type: string; params: Record<string, unknown> };
}

const VALID_ASSERTIONS = new Set(['step_present', 'tool_succeeds', 'latency_under', 'final_status_is']);

export async function genTestCases(problems: Problem[]): Promise<TestCase[]> {
  const raw = await chat(
    '你是测试工程师。基于诊断问题生成回归测试用例，断言表达"修复后应满足的正确行为"。只输出 JSON。',
    `# 已诊断问题\n${JSON.stringify(problems, null, 2)}\n\n# 断言 DSL\n${ASSERTION_SPEC}\n\n# 任务\n每个问题 1 条用例，输出 {"test_cases": [{"test_id": "RT-001", "trajectory_id": "问题轨迹ID", "description": "验证什么", "assertion": {"type": "…", "params": {…}}}]}。只输出 JSON。`
  );
  const data = extractJson(raw);
  const cases = (Array.isArray(data.test_cases) ? data.test_cases : []) as TestCase[];
  return cases.filter((c) => VALID_ASSERTIONS.has(c.assertion?.type));
}
