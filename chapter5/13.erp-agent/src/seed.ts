import { DatabaseSync } from 'node:sqlite';
import { Employee, SalaryRow } from './types.js';

export const ASOF = '2026-06-15';
export const ASOF_YEAR = 2026;
export const DEPTS = ['研发部', '销售部', '市场部', '财务部', '人事部'];

const SURNAMES = ['张', '李', '王', '赵', '刘', '陈', '杨', '黄', '周', '吴'];
const GIVEN = ['伟', '芳', '娜', '敏', '静', '磊', '洋', '艳', '勇', '杰'];

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

export interface SeedData {
  employees: Employee[];
  salaries: SalaryRow[];
  raises: number[];
}

export function generateSeed(): SeedData {
  const rand = mulberry32(42);
  const hireYears = [2018, 2018, 2018, 2018, 2019, 2019, 2019, 2019, 2019, 2020, 2020, 2020, 2020, 2020, 2021, 2021, 2021, 2021, 2021, 2022, 2022, 2022, 2022, 2022, 2023, 2023, 2023, 2023, 2023, 2024, 2024, 2024, 2024, 2024, 2025, 2025, 2025, 2025, 2026, 2026];
  const leavers = new Set([3, 9, 17, 24, 31, 36]);
  const employees: Employee[] = [];
  const salaries: SalaryRow[] = [];
  const raises: number[] = [];

  for (let i = 0; i < 40; i++) {
    const id = `E${String(i + 1).padStart(3, '0')}`;
    const name = `${SURNAMES[i % SURNAMES.length]}${GIVEN[Math.floor(rand() * GIVEN.length)]}`;
    const dept = DEPTS[(i < 25 ? i : Math.floor(rand() * 5)) % 5] ?? '研发部';
    const level = 1 + Math.floor(rand() * 5);
    const hireYear = hireYears[i] ?? 2022;
    const hireMonth = 1 + Math.floor(rand() * 12);
    const hireDate = `${hireYear}-${pad2(hireMonth)}-01`;
    let leaveDate: string | null = null;
    if (leavers.has(i)) {
      const leaveYear = Math.min(hireYear + 1 + Math.floor(rand() * 3), 2025);
      const leaveMonth = 1 + Math.floor(rand() * 12);
      leaveDate = `${leaveYear}-${pad2(leaveMonth)}-01`;
      if (leaveDate >= '2026-06-01') leaveDate = '2025-12-01';
    }
    employees.push({ id, name, dept, level, hireDate, leaveDate });

    const base = 8000 + level * 2000;
    const raise = 300 + i * 17;
    raises.push(raise);
    let y = hireYear;
    let m = hireMonth;
    while (`${y}-${pad2(m)}-01` <= '2026-06-01') {
      if (!(leaveDate && `${y}-${pad2(m)}-01` > leaveDate)) {
        const years = y - hireYear;
        salaries.push({ empId: id, payDate: `${y}-${pad2(m)}-01`, amount: base + raise * years });
      }
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }

  const kept = salaries.filter((s) => !(s.empId === 'E007' && s.payDate === '2026-04-01'));
  return { employees, salaries: kept, raises };
}

export function createTables(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      dept TEXT NOT NULL,
      level INTEGER NOT NULL,
      hire_date TEXT NOT NULL,
      leave_date TEXT
    );
    CREATE TABLE salaries (
      emp_id TEXT NOT NULL,
      pay_date TEXT NOT NULL,
      amount REAL NOT NULL,
      PRIMARY KEY (emp_id, pay_date)
    );
  `);
}

export function openDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  createTables(db);
  return db;
}

export function seedDatabase(db: DatabaseSync, data: SeedData): void {
  const insertEmp = db.prepare('INSERT INTO employees (id, name, dept, level, hire_date, leave_date) VALUES (?, ?, ?, ?, ?, ?)');
  for (const e of data.employees) {
    insertEmp.run(e.id, e.name, e.dept, e.level, e.hireDate, e.leaveDate);
  }
  const insertSal = db.prepare('INSERT INTO salaries (emp_id, pay_date, amount) VALUES (?, ?, ?)');
  db.exec('BEGIN');
  for (const r of data.salaries) insertSal.run(r.empId, r.payDate, r.amount);
  db.exec('COMMIT');
}
