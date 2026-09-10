/**
 * 注意力统计（对应官方 visualization.py 的 attention_sink_stats 等）。
 *
 * 矩阵约定：行 = Query 位置，列 = Key 位置；每行之和 ≈ 1。
 * 上三角（col > row）应为 0（因果掩码）。
 */

export interface SinkStats {
  mean_sink_share: number;
  max_sink_share: number;
}

/** attention sink 占比：每行注意力落在第一个 token 上的比例。 */
export function attentionSinkStats(matrix: number[][]): SinkStats {
  let sum = 0;
  let max = 0;
  for (const row of matrix) {
    const first = row[0] ?? 0;
    sum += first;
    if (first > max) max = first;
  }
  const n = matrix.length || 1;
  return { mean_sink_share: sum / n, max_sink_share: max };
}

/** 因果三角校验：col > row 的位置是否（约）为 0。 */
export function causalViolations(matrix: number[][]): {
  upper_nonzero: number;
  max_upper: number;
  pass: boolean;
} {
  let count = 0;
  let maxVal = 0;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = r + 1; c < (matrix[r]?.length ?? 0); c++) {
      const v = Math.abs(matrix[r]?.[c] ?? 0);
      if (v > 1e-6) count++;
      if (v > maxVal) maxVal = v;
    }
  }
  return { upper_nonzero: count, max_upper: maxVal, pass: count === 0 };
}

/** 每行的熵（信息论视角：注意力越集中熵越小）。 */
export function rowEntropies(matrix: number[][]): number[] {
  return matrix.map((row) => {
    let h = 0;
    for (const v of row) {
      if (v > 1e-12) h -= v * Math.log2(v);
    }
    return h;
  });
}

/** 按位置分段统计：开头 / 中间 / 结尾 的平均 sink 占比。 */
export function positionalSinkStats(matrix: number[][]): {
  beginning: number;
  middle: number;
  end: number;
} {
  const n = matrix.length;
  if (n === 0) return { beginning: 0, middle: 0, end: 0 };
  const third = Math.max(1, Math.floor(n / 3));
  const avg = (lo: number, hi: number) => {
    if (hi <= lo) return 0;
    let s = 0;
    for (let i = lo; i < hi; i++) s += matrix[i]?.[0] ?? 0;
    return s / (hi - lo);
  };
  return {
    beginning: avg(0, third),
    middle: avg(third, Math.min(2 * third, n)),
    end: avg(Math.max(0, n - third), n),
  };
}