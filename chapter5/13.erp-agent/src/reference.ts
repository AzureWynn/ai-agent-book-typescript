import { Employee, ResultRow, SalaryRow } from './types.js';
import { ASOF, DEPTS } from './seed.js';

function parseDate(s: string): number {
  return Date.parse(`${s}T00:00:00Z`);
}

const ASOF_MS = parseDate(ASOF);
const DAY = 86400000;

function isActive(e: Employee): boolean {
  return e.leaveDate === null || e.leaveDate > '2026-06-01';
}

function monthKey(payDate: string): string {
  return payDate.slice(0, 7);
}

function nextMonthStart(ymd: string): string {
  let [y, m] = ymd.split('-').map(Number) as [number, number];
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

function monthsBetween(start: string, endExclusive: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split('-').map(Number) as [number, number];
  while (`${y}-${String(m).padStart(2, '0')}-01` < endExclusive) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export interface Reference {
  employees: Employee[];
  salaries: SalaryRow[];
}

function byEmp(salaries: SalaryRow[]): Map<string, SalaryRow[]> {
  const map = new Map<string, SalaryRow[]>();
  for (const s of salaries) {
    const list = map.get(s.empId) ?? [];
    list.push(s);
    map.set(s.empId, list);
  }
  return map;
}

function avg(xs: number[]): number {
  return xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

export function referenceAnswer(qid: number, ref: Reference): ResultRow[] {
  const { employees, salaries } = ref;
  const active = employees.filter(isActive);
  const salByEmp = byEmp(salaries);
  const nameOf = new Map(employees.map((e) => [e.id, e.name] as [string, string]));

  switch (qid) {
    case 1: {
      const years = active.map((e) => (ASOF_MS - parseDate(e.hireDate)) / (365.25 * DAY));
      return [{ avg_years: avg(years) }];
    }
    case 2: {
      return DEPTS.map((dept) => ({ dept, n: active.filter((e) => e.dept === dept).length })).sort((a, b) =>
        String(a.dept).localeCompare(String(b.dept), 'zh')
      );
    }
    case 3: {
      const scored = DEPTS.map((dept) => {
        const members = active.filter((e) => e.dept === dept);
        return { dept, avg: avg(members.map((e) => e.level)) };
      }).sort((a, b) => b.avg - a.avg || String(a.dept).localeCompare(String(b.dept), 'zh'));
      const top = scored[0];
      return top ? [{ dept: top.dept }] : [];
    }
    case 4: {
      return DEPTS.map((dept) => ({
        dept,
        y2026: active.filter((e) => e.dept === dept && e.hireDate.startsWith('2026')).length,
        y2025: employees.filter((e) => e.dept === dept && e.hireDate.startsWith('2025')).length,
      })).sort((a, b) => String(a.dept).localeCompare(String(b.dept), 'zh'));
    }
    case 5: {
      const rows = salaries.filter((s) => {
        const emp = employees.find((e) => e.id === s.empId);
        return emp?.dept === '研发部' && s.payDate >= '2024-03-01' && s.payDate <= '2025-05-01';
      });
      return [{ avg: avg(rows.map((r) => r.amount)) }];
    }
    case 6: {
      const avgDept = (dept: string): number => {
        const rows = salaries.filter((s) => {
          const emp = employees.find((e) => e.id === s.empId);
          return emp?.dept === dept && s.payDate >= '2025-01-01' && s.payDate <= '2025-12-01';
        });
        return avg(rows.map((r) => r.amount));
      };
      const a = avgDept('研发部');
      const b = avgDept('销售部');
      return [{ dept: a >= b ? '研发部' : '销售部' }];
    }
    case 7: {
      const out: ResultRow[] = [];
      for (let level = 1; level <= 5; level++) {
        const rows = salaries.filter((s) => {
          const emp = employees.find((e) => e.id === s.empId);
          return emp?.level === level && s.payDate >= '2026-01-01' && s.payDate <= '2026-06-01';
        });
        out.push({ level, avg: avg(rows.map((r) => r.amount)) });
      }
      return out;
    }
    case 8: {
      const bandOf = (e: Employee): string | null => {
        const years = (ASOF_MS - parseDate(e.hireDate)) / (365.25 * DAY);
        if (years < 1) return '<1y';
        if (years < 2) return '1-2y';
        if (years < 3) return '2-3y';
        return null;
      };
      return ['<1y', '1-2y', '2-3y'].map((band) => {
        const members = active.filter((e) => bandOf(e) === band);
        const latest = members
          .map((e) => {
            const rows = (salByEmp.get(e.id) ?? []).filter((s) => s.payDate <= '2026-06-01');
            rows.sort((x, y) => (x.payDate < y.payDate ? 1 : -1));
            return rows[0]?.amount;
          })
          .filter((x): x is number => typeof x === 'number');
        return { band, avg: avg(latest) };
      });
    }
    case 9: {
      const scored = active
        .map((e) => {
          const rows = salByEmp.get(e.id) ?? [];
          const in2025 = rows.filter((s) => s.payDate >= '2025-01-01' && s.payDate <= '2025-12-01');
          const in2026 = rows.filter((s) => s.payDate >= '2026-01-01' && s.payDate <= '2026-06-01');
          if (in2025.length === 0 || in2026.length === 0) return null;
          return { name: e.name, raise: avg(in2026.map((r) => r.amount)) - avg(in2025.map((r) => r.amount)) };
        })
        .filter((x): x is { name: string; raise: number } => x !== null)
        .sort((a, b) => b.raise - a.raise || a.name.localeCompare(b.name, 'zh'))
        .slice(0, 10);
      return scored.map((s) => ({ name: s.name }));
    }
    case 10: {
      const out: ResultRow[] = [];
      for (const e of employees) {
        const endExclusive = e.leaveDate && e.leaveDate <= '2026-06-01' ? nextMonthStart(e.leaveDate) : '2026-07-01';
        const expected = new Set(monthsBetween(e.hireDate.slice(0, 7), endExclusive));
        const actual = new Set((salByEmp.get(e.id) ?? []).map((s) => monthKey(s.payDate)));
        for (const m of [...expected].sort()) {
          if (!actual.has(m)) out.push({ name: e.name, month: `${m}-01` });
        }
      }
      out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh') || String(a.month).localeCompare(String(b.month)));
      return out;
    }
    default:
      return [];
  }
}
