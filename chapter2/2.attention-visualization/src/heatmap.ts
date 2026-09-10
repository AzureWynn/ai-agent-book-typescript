/**
 * 热力图渲染 —— 零依赖 SVG/HTML。
 * 官方用 matplotlib 输出 PNG；这里输出可缩放的 SVG（.svg 或 .html）。
 * 行 = Query，列 = Key；上三角为因果掩码留白；可画上下文边界线。
 */

export interface HeatmapOptions {
  title: string;
  contextBoundary?: number | undefined; // 有续写时，prompt 与生成 token 的分界
  annotateSink?: boolean | undefined;
  sinkMean?: number | undefined;
  sinkMax?: number | undefined;
}

const VIRIDIS: Array<[number, number, number]> = [
  [68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37],
];

/** 把 [0,1] 值映射成 viridis 色。 */
function viridis(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (VIRIDIS.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = VIRIDIS[i]!;
  const b = VIRIDIS[Math.min(i + 1, VIRIDIS.length - 1)]!;
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r},${g},${bl})`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 大矩阵降采样为块平均（目标最大边长），返回降采样矩阵 + 每块对应的起始 token 索引。 */
function downsample(
  matrix: number[][],
  targetMax = 300
): { grid: number[][]; rowToken: number[]; colToken: number[] } {
  const n = matrix.length;
  if (n <= targetMax) {
    return {
      grid: matrix,
      rowToken: matrix.map((_, i) => i),
      colToken: matrix[0]?.map((_, i) => i) ?? [],
    };
  }
  const block = Math.ceil(n / targetMax);
  const size = Math.ceil(n / block);
  const grid: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const counts: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const br = Math.floor(r / block);
      const bc = Math.floor(c / block);
      grid[br]![bc]! += matrix[r]?.[c] ?? 0;
      counts[br]![bc]! += 1;
    }
  }
  for (let br = 0; br < size; br++) {
    for (let bc = 0; bc < size; bc++) {
      grid[br]![bc] = (grid[br]![bc] ?? 0) / (counts[br]![bc] || 1);
    }
  }
  const rowToken: number[] = [];
  const colToken: number[] = [];
  for (let i = 0; i < size; i++) {
    rowToken.push(Math.min(n - 1, i * block));
    colToken.push(Math.min(n - 1, i * block));
  }
  return { grid, rowToken, colToken };
}

export function renderHeatmap(
  matrix: number[][],
  tokens: string[],
  opts: HeatmapOptions
): string {
  const { grid, rowToken, colToken } = downsample(matrix);
  const n = grid.length;
  const cell = 22;      // 格子像素
  const margin = { top: 30, left: 110, bottom: 60, right: 20 };
  const W = margin.left + n * cell + margin.right;
  const H = margin.top + n * cell + margin.bottom;

  let maxV = 0;
  for (const row of matrix) for (const v of row) if (v > maxV) maxV = v;
  const colorOf = (v: number) => viridis(maxV > 0 ? v / maxV : 0);

  const cells: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = grid[r]?.[c] ?? 0;
      const x = margin.left + c * cell;
      const y = margin.top + r * cell;
      if (c > r) {
        // 因果掩码：上三角画斜纹，表示不允许 attend
        cells.push(
          `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="#f5f5f5"/>` +
          `<line x1="${x}" y1="${y + cell}" x2="${x + cell}" y2="${y}" stroke="#ddd" stroke-width="1"/>`
        );
      } else {
        cells.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${colorOf(v)}" stroke="#ffffff" stroke-width="0.5"/>`);
      }
    }
  }

  // 轴标签（每隔若干个显示一个，避免拥挤）
  const labelEvery = n > 40 ? Math.ceil(n / 40) : 1;
  const colLabels: string[] = [];
  const rowLabels: string[] = [];
  for (let i = 0; i < n; i++) {
    const colIdx = colToken[i] ?? i;
    const rowIdx = rowToken[i] ?? i;
    const colLabel = tokens[colIdx] === undefined ? '' : tokens[colIdx]!.replace(/\s+/g, '·');
    const rowLabel = tokens[rowIdx] === undefined ? '' : tokens[rowIdx]!.replace(/\s+/g, '·');
    if (i % labelEvery === 0) {
      colLabels.push(
        `<text x="${margin.left + (i + 0.5) * cell}" y="${margin.top - 6}" text-anchor="middle" font-size="9" transform="rotate(-55 ${margin.left + (i + 0.5) * cell} ${margin.top - 6})">${esc(colLabel)}</text>`
      );
      rowLabels.push(
        `<text x="${margin.left - 6}" y="${margin.top + (i + 0.5) * cell}" text-anchor="end" dominant-baseline="middle" font-size="9">${esc(rowLabel)}</text>`
      );
    }
  }

  // 上下文边界线（prompt | 生成）
  let boundary = '';
  if (opts.contextBoundary !== undefined && opts.contextBoundary > 0 && opts.contextBoundary < n) {
    const x = margin.left + opts.contextBoundary * cell;
    boundary = `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + n * cell}" stroke="#ff5252" stroke-width="2" stroke-dasharray="5,3"/>
      <text x="${x + 4}" y="${margin.top + 12}" font-size="10" fill="#ff5252">prompt →</text>`;
  }

  // 色标
  const bar = `
    <g transform="translate(${margin.left}, ${margin.top + n * cell + 14})">
      ${VIRIDIS.map((c, i) => `<rect x="${i * 30}" y="0" width="30" height="8" fill="rgb(${c[0]},${c[1]},${c[2]})"/>`).join('')}
      <text x="0" y="18" font-size="9">0</text>
      <text x="${VIRIDIS.length * 30 - 18}" y="18" font-size="9">max</text>
      <text x="${VIRIDIS.length * 30 + 4}" y="8" font-size="9" fill="#999">行=Query  列=Key</text>
    </g>`;

  let sinkNote = '';
  if (opts.annotateSink && opts.sinkMean !== undefined) {
    sinkNote = `<text x="${margin.left}" y="${margin.top + n * cell + 32}" font-size="11" fill="#333">attention sink（首 token 占行注意力比例）: mean ${(opts.sinkMean * 100).toFixed(1)}%, max ${((opts.sinkMax ?? 0) * 100).toFixed(1)}%</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="ui-monospace,Menlo,monospace">
  <text x="${margin.left}" y="16" font-size="14" font-weight="bold">${esc(opts.title)}</text>
  <text x="${margin.left}" y="28" font-size="10" fill="#888">${n} tokens</text>
  ${cells.join('')}
  ${colLabels.join('')}
  ${rowLabels.join('')}
  ${boundary}
  ${bar}
  ${sinkNote}
</svg>`;

  return svg;
}

/** 输出 .svg 或 .html（自包含）。 */
export function writeHeatmap(
  matrix: number[][],
  tokens: string[],
  opts: HeatmapOptions,
  outputPath: string
): string {
  const svg = renderHeatmap(matrix, tokens, opts);
  if (outputPath.endsWith('.svg')) return svg;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title></head>
<body style="background:#fff;margin:20px">${svg}</body></html>`;
}

/** 终端里的紧凑 ASCII 热力图（帮助快速看因果三角与 sink）。 */
export function renderAscii(matrix: number[][], maxWidth = 48): string {
  const n = matrix.length;
  const step = Math.max(1, Math.ceil(n / maxWidth));
  const chars = ' .:-=+*#%@';
  const rows: string[] = [];
  for (let r = 0; r < n; r += step) {
    let line = '';
    for (let c = 0; c < n; c += step) {
      const v = matrix[r]?.[c] ?? 0;
      line += chars[Math.min(chars.length - 1, Math.floor(v * (chars.length - 1)))]!;
    }
    rows.push(line);
  }
  return rows.join('\n');
}