export interface Employee {
  id: string;
  name: string;
  dept: string;
  level: number;
  hireDate: string;
  leaveDate: string | null;
}

export interface SalaryRow {
  empId: string;
  payDate: string;
  amount: number;
}

export interface Question {
  id: number;
  text: string;
  hint: string;
}

export type CellValue = string | number | null;
export type ResultRow = Record<string, CellValue>;
