import fs from 'node:fs';
import path from 'node:path';

export interface SampleTask {
  name: string;
  description: string;
  task: string;
}

// PDF 任务使用的本地样例文件（与 create_sample_pdf.py 生成的同名）
const PDF_PATH = path.join('fixtures', 'pdfs', 'simple_expense_report.pdf');
const hasLocalPdf = fs.existsSync(PDF_PATH);

/**
 * 内置 5 个示例任务（对应参考实现 main.py get_sample_tasks）。
 * 第 2 个是 PDF 财务分析，需要本地样例 PDF。
 */
export function getSampleTasks(): SampleTask[] {
  const pdfPath = hasLocalPdf ? PDF_PATH : '<缺少 fixtures/pdfs/simple_expense_report.pdf，请先运行 create_pdfs>';
  const pdfNote = hasLocalPdf ? '使用本地 PDF' : '本地 PDF 缺失';

  return [
    {
      name: '货币换算任务',
      description: '在多种货币之间进行换算',
      task: 'Convert $1000 USD to EUR, GBP, and JPY. Then calculate the average value across all three converted currencies.',
    },
    {
      name: 'PDF 财务分析',
      description: `从 PDF 文档中提取并分析数据（${pdfNote}）`,
      task: `Analyze this PDF document: ${pdfPath}\nExtract any text content and provide a summary of what you found.`,
    },
    {
      name: '复杂财务分析',
      description: '多步骤财务计算（多币种营收折算）',
      task: `A company has the following quarterly revenues:
- Q1: $2,500,000 USD
- Q2: €2,100,000 EUR
- Q3: £1,800,000 GBP
- Q4: ¥380,000,000 JPY

Please:
1. Convert all revenues to USD
2. Calculate the total annual revenue in USD
3. Determine the average quarterly revenue
4. Find which quarter had the highest revenue
5. If the company has a 20% profit margin, calculate the annual profit in USD`,
    },
    {
      name: '多币种预算规划',
      description: '跨国预算换算与占比计算',
      task: `An international conference has the following budget allocations:
- Venue (UK): £45,000
- Speakers (US): $75,000
- Catering (France): €38,000
- Technology (Japan): ¥8,500,000
- Marketing (Singapore): S$25,000

Tasks:
1. Convert all amounts to USD
2. Calculate the total budget
3. Determine what percentage each category represents
4. If we need to cut the budget by 15%, how much should each category be reduced to (in their original currencies)?`,
    },
    {
      name: '投资组合分析',
      description: '多币种投资收益与回报率计算',
      task: `An investor has the following international investments with their current values:
- US Tech Stocks: $125,000 (purchased for $100,000)
- European Bonds: €85,000 (purchased for €90,000)
- UK Real Estate: £200,000 (purchased for £175,000)
- Japanese ETFs: ¥15,000,000 (purchased for ¥12,000,000)

Calculate:
1. Convert all current values to USD
2. Convert all purchase prices to USD (use current exchange rates for simplicity)
3. Calculate the profit/loss for each investment in USD
4. Determine the total portfolio value and overall return percentage
5. Which investment performed best in percentage terms?`,
    },
  ];
}