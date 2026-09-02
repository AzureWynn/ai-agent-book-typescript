import type { GroundednessVerdict } from './types.js';

/**
 * 答案的数字是否"有来源"（对应参考实现 grounding.py）。
 *
 * 消融表格里的 Completed 列只回答一个问题：模型是否给出了终止回复。
 * 但 no_tool_calls 模式下模型没有工具可调，第一轮就必然回复，
 * 因此"回复了"并不能说明答案可靠。本模块衡量该列看不到的差异：
 * 答案中的大额数字，有没有可能来自模型实际看到的地方。
 *
 * 注意：这里刻意不判断答案是否"正确"——那需要任务专属规则
 * （见 ablation.ts 的 canonicalAnswerCorrect）。
 */

// 本任务的营收以"万"为单位书写（如 1500万美元），提取时不放大万/亿，
// 原始数值即为 1200~23760 量级；因此阈值取 1000，
// 既能保留营收数字，又能过滤 25%、汇率 7.2 这类无证据意义的小数。
const QUANTITY_FLOOR = 1000;

// 四舍五入 / 呈现格式差异不应被读作编造。
const DEFAULT_REL_TOL = 1e-3;

const _NUMBER = /(?<![\w.])(\d[\d,]*(?:\.\d+)?)\s*(million|billion|bn|m\b|k\b)?/gi;
const _SCALES: Record<string, number> = {
  million: 1e6,
  m: 1e6,
  billion: 1e9,
  bn: 1e9,
  k: 1e3,
};

export interface GroundednessResult {
  observationCount: number;
  answerQuantities: number[];
  unsupportedQuantities: number[];
  verdict: GroundednessVerdict;
}

export function extractQuantities(
  text: string | null,
  floor: number = QUANTITY_FLOOR
): number[] {
  const found: number[] = [];
  for (const match of (text ?? '').matchAll(_NUMBER)) {
    const raw = match[1];
    const scale = match[2];
    if (!raw) continue;
    const value = parseFloat(raw.replace(/,/g, ''));
    if (Number.isNaN(value)) continue;
    const scaled = scale ? value * (_SCALES[scale] ?? 1) : value;
    if (Math.abs(scaled) >= floor && !found.includes(scaled)) {
      found.push(scaled);
    }
  }
  return found;
}

export function matchesAny(
  value: number,
  candidates: Iterable<number>,
  relTol: number = DEFAULT_REL_TOL
): boolean {
  for (const candidate of candidates) {
    const scale = Math.max(Math.abs(value), Math.abs(candidate), 1.0);
    if (Math.abs(value - candidate) <= relTol * scale) return true;
  }
  return false;
}

/**
 * 收集模型实际"看到"的工具观察中的数字。
 * 读取的是发送给模型的消息内容，而非工具的真实执行结果——
 * no_tool_results 模式下工具执行了，但模型看到的是占位符，
 * 此时观察为空，答案中的数字便无据可依。
 */
export function observationQuantities(toolResultTexts: Iterable<string>): number[] {
  const values: number[] = [];
  for (const text of toolResultTexts) {
    for (const value of extractQuantities(text, 0)) {
      if (!values.includes(value)) values.push(value);
    }
  }
  return values;
}

/**
 * 判断答案中的数字是否有任何来源。
 * 有来源 = 任务文本提供过该数字，或模型看到的工具观察携带过该数字。
 *
 * 与正确性刻意正交：
 * - 无观察却蒙对答案，仍不是"从证据推导"；
 * - 有真实观察时，无法仅凭文本区分"心算正确"与"编造数字"，因此不下结论。
 */
export function assessGroundedness(
  finalAnswer: string | null,
  taskText: string,
  observations: Iterable<number>
): GroundednessResult {
  const quantities = extractQuantities(finalAnswer);
  const observationList = Array.from(observations);
  const known = [...extractQuantities(taskText), ...observationList];
  const unsupported = quantities.filter((q) => !matchesAny(q, known));

  let verdict: GroundednessVerdict;
  if (finalAnswer === null || finalAnswer.trim() === '') {
    verdict = 'no_answer';
  } else if (observationList.length > 0) {
    verdict = 'not_assessable';
  } else if (quantities.length === 0) {
    verdict = 'no_quantities';
  } else if (unsupported.length === 0) {
    verdict = 'grounded';
  } else {
    verdict = 'ungrounded';
  }

  return {
    observationCount: observationList.length,
    answerQuantities: quantities,
    unsupportedQuantities: unsupported,
    verdict,
  };
}