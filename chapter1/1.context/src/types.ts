export enum ContextMode {
    FULL = "full",
    NO_HISTORY = "no_history",
    NO_REASONING = "no_reasoning",
    NO_TOOL_CALLS = "no_tool_calls",
    NO_TOOL_RESULTS = "no_tool_results",
}

export interface AblationConfig {
    withHistory: boolean;
    withReasoning: boolean;
    withToolCalls: boolean;
    withToolResults: boolean;
}

// 消融结果的结局标签（对应参考实现 arm_outcome）
export type Outcome =
    | 'no_terminal_response'   // 无终止回复（异常 / 撑满迭代上限）
    | 'correct'                // 通过任务专属数值规则
    | 'unsupported_numbers'    // 答案含任务与观察之外凭空出现的数字
    | 'no_unsupported_numbers' // 未答或只引用任务/观察已有的数字
    | 'incorrect';             // 其余情况

// 答案数字是否有来源（对应参考实现 assess_groundedness）
export type GroundednessVerdict =
    | 'no_answer'        // 没有终止回复可评估
    | 'not_assessable'   // 模型看到了观察，无法仅凭文本判定对错
    | 'no_quantities'    // 没看到观察、答案也未声称任何大额数字
    | 'grounded'         // 答案中的每个大额数字都有来源
    | 'ungrounded';      // 无观察支撑却给出了任务文本之外的数字

// 实验结果
export interface ExperimentResult {
    mode: ContextMode; // 当前模式
    iteration: number; // 当前迭代次数
    toolCalls: number; // 当前工具调用次数
    completed: boolean; // 是否有终止回复（final answer 非空）
    taskSuccess: boolean | null; // 是否通过任务专属数值规则（null = 无规则可判）
    groundingVerdict: GroundednessVerdict; // 答案数字是否有来源
    unsupportedQuantities: number[]; // 无来源支撑的数字
    outcome: Outcome; // 合并后的结局标签
    answer: string; // 当前回答
    durationMs: number; // 当前耗时
    error?: string;
}

