
import { FinancialAgent } from './agent.js';
import type { AblationConfig, ExperimentResult, GroundednessVerdict, Outcome } from './types.js';
import { ContextMode } from './types.js';
import { assessGroundedness, extractQuantities, matchesAny, observationQuantities } from './grounding.js';

/**
 * 定义 5 种消融配置
 * 每种模式对应一组布尔开关组合
 */
export const ABLATION_CONFIGS: Record<ContextMode, AblationConfig> = {
  [ContextMode.FULL]: {
    withHistory: true,
    withReasoning: true,
    withToolCalls: true,
    withToolResults: true,
  },
  [ContextMode.NO_HISTORY]: {
    withHistory: false,
    withReasoning: true,
    withToolCalls: true,
    withToolResults: true,
  },
  [ContextMode.NO_REASONING]: {
    withHistory: true,
    withReasoning: false,
    withToolCalls: true,
    withToolResults: true,
  },
  [ContextMode.NO_TOOL_CALLS]: {
    withHistory: true,
    withReasoning: true,
    withToolCalls: false,
    withToolResults: true,
  },
  [ContextMode.NO_TOOL_RESULTS]: {
    withHistory: true,
    withReasoning: true,
    withToolCalls: true,
    withToolResults: false,
  },
};

/**
 * 实验任务（与原书一致：财务分析）
 * 这个任务需要用到：计算器 + 汇率转换 + 推理 + 历史记录
 */
export const EXPERIMENT_TASK =
  '请分析以下财务数据：某公司2024年Q1营收为1500万美元，Q2营收为1800万美元。' +
  '1. 计算同比增长率（假设去年同期Q1为1200万美元）；' +
  '2. 将Q2营收转换为人民币（使用汇率工具）；' +
  '3. 计算两个季度的总营收（以人民币计）。' +
  '请给出完整的分析过程和最终结论。';

// 任务专属数值规则（rubric）：判定答案是否包含关键数值。
// 汇率是实时 API 返回的（备用时才为 7.2），因此期望值不从常量硬编码，
// 而是从模型实际"看到"的工具观察里动态提取汇率与 Q2 换算结果（方案 A）。
// 这样 full/no_history/no_reasoning 等观察有效的模式才能正确判"答对"，
// 而 no_tool_results 观察被隐藏、no_tool_calls 无工具 → 无汇率可循 → 不判对。

/** 从工具观察里提取模型实际使用的汇率（无则返回 null） */
function extractRateFromObservations(toolResultTexts: string[]): number | null {
  for (const text of toolResultTexts) {
    const m = text.match(/(?:备用)?汇率:\s*([\d.]+)/);
    if (m && m[1] !== undefined) {
      const rate = parseFloat(m[1]);
      if (!Number.isNaN(rate)) return rate;
    }
  }
  return null;
}

/** 从工具观察里提取 Q2 营收折人民币的换算结果（无则返回 null） */
function extractConvertedQ2(toolResultTexts: string[]): number | null {
  for (const text of toolResultTexts) {
    const m = text.match(/=\s*([\d,]+(?:\.\d+)?)\s*CNY/);
    if (m && m[1] !== undefined) {
      const value = parseFloat(m[1].replace(/,/g, ''));
      if (!Number.isNaN(value)) return value;
    }
  }
  return null;
}

/**
 * 判断答案是否通过任务专属数值规则（对应参考实现 canonical_answer_correct）。
 * 依赖模型实际看到的工具观察动态计算期望值：
 * - 同比增速 (1500-1200)/1200 = 0.25，与汇率无关
 * - Q2 折 CNY = 观察中的换算结果
 * - 两季度总营收 = Q2 换算结果 × (1500+1800)/1800（同一汇率下同口径）
 * 观察无效（no_tool_results / no_tool_calls）时无法判定 → 返回 false。
 */
function canonicalAnswerCorrect(
  finalAnswer: string | null,
  toolResultTexts: string[]
): boolean {
  if (!finalAnswer) return false;
  const rate = extractRateFromObservations(toolResultTexts);
  const q2Converted = extractConvertedQ2(toolResultTexts);
  if (rate === null || q2Converted === null) return false;

  const hasGrowth = /(?:0\.25|25%)/.test(finalAnswer);
  const answerQuantities = extractQuantities(finalAnswer);
  const totalExpected = q2Converted * (3300 / 1800);
  const hasQ2 = answerQuantities.some((q) => matchesAny(q, [q2Converted]));
  const hasTotal = answerQuantities.some((q) => matchesAny(q, [totalExpected]));

  return hasGrowth && hasQ2 && hasTotal;
}

/**
 * 合并三轴为一个结局标签（对应参考实现 arm_outcome）：
 * - completed：是否有终止回复
 * - correct：是否通过任务数值规则
 * - verdict：数字是否有来源
 *
 * completed 无法区分两种"没有答对"的结束方式，而它们危害不同：
 * 只引用已知数字的拒答是安全失败，从记忆里编造汇率则是貌似正确的错误。
 */
function armOutcome(
  completed: boolean,
  correct: boolean,
  verdict: GroundednessVerdict
): Outcome {
  if (!completed) return 'no_terminal_response';
  if (correct) return 'correct';
  if (verdict === 'ungrounded') return 'unsupported_numbers';
  if (verdict === 'grounded' || verdict === 'no_quantities') return 'no_unsupported_numbers';
  return 'incorrect';
}

/**
 * 运行单次消融实验
 */
export async function runSingleExperiment(
  mode: ContextMode,
  config: AblationConfig,
  task: string
): Promise<ExperimentResult> {
  const startTime = Date.now();
  const agent = new FinancialAgent(config);

  try {
    const result = await agent.run(task);
    // completed = 是否有终止回复（final answer 非空），与"是否撑满迭代上限"解耦
    const completed = result.finalAnswer !== null;
    // 数值规则仅对默认实验任务可判；自定义任务无法判对错
    const taskSuccess = result.finalAnswer !== null && task === EXPERIMENT_TASK
      ? canonicalAnswerCorrect(result.finalAnswer, result.toolResultTexts)
      : null;
    // 数字依据：读取的是模型实际"看到"的工具结果（no_tool_results 下为占位符）
    const observations = observationQuantities(result.toolResultTexts);
    const grounding = assessGroundedness(result.finalAnswer, task, observations);
    return {
      mode,
      iteration: result.iterations,
      toolCalls: result.toolCalls,
      completed,
      taskSuccess,
      groundingVerdict: grounding.verdict,
      unsupportedQuantities: grounding.unsupportedQuantities,
      outcome: armOutcome(completed, taskSuccess === true, grounding.verdict),
      answer: (result.finalAnswer ?? result.answer).substring(0, 500),
      durationMs: Date.now() - startTime,
    };
  } catch (e) {
    return {
      mode,
      iteration: 0,
      toolCalls: 0,
      completed: false,
      taskSuccess: false,
      groundingVerdict: 'no_answer',
      unsupportedQuantities: [],
      outcome: 'no_terminal_response',
      answer: '实验异常中断',
      durationMs: Date.now() - startTime,
      error: e instanceof Error ? e.message : '未知错误',
    };
  }
}

/**
 * 运行全部 5 种消融模式
 */
export async function runAblationStudy(
  task?: string
): Promise<ExperimentResult[]> {
  const results: ExperimentResult[] = [];
  const testTask = task || EXPERIMENT_TASK;

  console.log('='.repeat(60));
  console.log('开始运行消融实验（Ablation Study）');
  console.log('='.repeat(60));
  console.log('任务: ' + testTask.substring(0, 80) + '...');
  console.log('');

  for (const [mode, config] of Object.entries(ABLATION_CONFIGS)) {
    console.log('正在运行模式: ' + mode + '...');
    const result = await runSingleExperiment(
      mode as ContextMode,
      config,
      testTask
    );
    results.push(result);

    console.log(
      '   迭代次数: ' + result.iteration +
      ' | 工具调用: ' + result.toolCalls +
      ' | 完成: ' + result.completed +
      ' | 结局: ' + OUTCOME_LABEL[result.outcome] +
      ' | 耗时: ' + result.durationMs + 'ms'
    );
    console.log('   答案摘要: ' + result.answer.substring(0, 100) + '...');
  }

  printResultsTable(results);
  return results;
}

/**
 * 打印结果汇总表
 */
const OUTCOME_LABEL: Record<Outcome, string> = {
  no_terminal_response: '✗ 无终止回复',
  correct: '✓ 答对',
  unsupported_numbers: '⚠ 编造数字',
  no_unsupported_numbers: '◦ 拒答/无据',
  incorrect: '✗ 答错',
};

const GROUNDING_LABEL: Record<GroundednessVerdict, string> = {
  grounded: '有据',
  ungrounded: 'UNSUPPORTED',
  not_assessable: '已看工具',
  no_quantities: '无数',
  no_answer: '-',
};

function printResultsTable(results: ExperimentResult[]) {
  console.log('');
  console.log('='.repeat(88));
  console.log('消融实验结果汇总');
  console.log('='.repeat(88));

  console.log(
    '| ' + pad('模式', 14) + ' | ' + pad('迭代次数', 8) +
    ' | ' + pad('工具调用', 8) + ' | ' + pad('完成', 6) +
    ' | ' + pad('结局', 14) + ' | ' + pad('数字依据', 10) +
    ' | ' + pad('耗时(ms)', 10) + ' |'
  );
  console.log('-'.repeat(88));

  for (const r of results) {
    console.log(
      '| ' + pad(r.mode, 14) + ' | ' + pad(String(r.iteration), 8) +
      ' | ' + pad(String(r.toolCalls), 8) + ' | ' + pad(String(r.completed), 6) +
      ' | ' + pad(OUTCOME_LABEL[r.outcome], 14) + ' | ' + pad(GROUNDING_LABEL[r.groundingVerdict], 10) +
      ' | ' + pad(String(r.durationMs), 10) + ' |'
    );
  }

  console.log('='.repeat(88));
}

function pad(str: string, len: number): string {
  return str.padEnd(len, ' ');
}