import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BarDatum } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export function chartPath(): string {
  return resolve(HERE, '../assets/sample_chart.svg');
}

export function reportPath(): string {
  return resolve(HERE, '../assets/sample_report.md');
}

function attr(tag: string, name: string): string {
  return tag.match(new RegExp(`${name}="([^"]+)"`))?.[1] ?? '';
}

export function extractTable(svgPath: string = chartPath()): BarDatum[] {
  const svg = readFileSync(svgPath, 'utf-8');

  const ticks: Array<{ value: number; y: number }> = [];
  const tickRe = /<text x="55" y="([\d.]+)">([\d.]+)M?<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = tickRe.exec(svg)) !== null) {
    ticks.push({ y: parseFloat(m[1] ?? '0'), value: parseFloat(m[2] ?? '0') });
  }
  if (ticks.length < 2) throw new Error('axis ticks not found; cannot derive scale');
  const sorted = [...ticks].sort((a, b) => a.value - b.value);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  if (!lo || !hi || hi.y === lo.y) throw new Error('degenerate axis');
  const unitsPerPx = (hi.value - lo.value) / (lo.y - hi.y);
  const baselineY = lo.y - lo.value / unitsPerPx;

  const out: BarDatum[] = [];
  const barRe = /<rect[^>]*class="bar"[^>]*>/g;
  while ((m = barRe.exec(svg)) !== null) {
    const tag = m[0];
    const quarter = attr(tag, 'data-quarter');
    const y = parseFloat(attr(tag, 'y'));
    if (!quarter || !Number.isFinite(y)) continue;
    const value = Math.round((baselineY - y) * unitsPerPx * 10) / 10;
    out.push({ quarter, value });
  }
  const order = ['Q1', 'Q2', 'Q3', 'Q4'];
  return out.sort((a, b) => order.indexOf(a.quarter) - order.indexOf(b.quarter));
}

export function tableText(rows: BarDatum[]): string {
  return rows.map((r) => `${r.quarter}: ${r.value}M`).join('\n');
}
