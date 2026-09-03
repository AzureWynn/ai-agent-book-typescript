import { tool } from '@langchain/core/tools';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { evaluate } from 'mathjs';
import { PDFParse } from 'pdf-parse';
import axios from 'axios';
import fs from 'fs/promises';
import vm from 'node:vm';
/**
 * 1. 计算器工具
 */
export const calculatorTool = tool(
  async ({ expression }) => {
    try {
      // 使用 mathjs 进行安全计算
      const result = evaluate(expression);
      return `计算结果: ${result}`;
    } catch (e) {
      return `计算失败: ${e instanceof Error ? e.message : '未知错误'}`;
    }
  },
  {
    name: 'calculator',
    description: '用于执行数学计算。输入数学表达式，如 "100 * 1.2 + 50"。不要自己心算！',
    schema: z.object({
      expression: z.string().describe('数学表达式'),
    }),
  }
);

/**
 * 2. 汇率转换工具
 * 模拟真实世界的 API 调用
 */
export const currencyTool = tool(
  async ({ amount, fromCurrency, toCurrency }) => {
    try {
      // 使用免费汇率 API (无需 Key)
      // 注意：实际生产环境应加缓存，这里为了演示直接请求
      const response = await axios.get(`https://open.er-api.com/v6/latest/${fromCurrency}`);
      const rate = response.data.rates[toCurrency];

      if (!rate) {
        return `未找到汇率: ${fromCurrency}->${toCurrency}`;
      }

      const converted = (amount * rate).toFixed(2);
      return `${amount}${fromCurrency} = ${converted}${toCurrency} (汇率: ${rate})`;
    } catch (e) {
      // 如果网络不好，返回备用固定汇率，防止实验中断
      console.warn('⚠️ 汇率 API 失败，使用备用汇率');
      const fallbackRate = fromCurrency === 'USD' && toCurrency === 'CNY' ? 7.2 : 1.0;
      const fallbackAmount = (amount * fallbackRate).toFixed(2);
      return `${amount}${fromCurrency} = ${fallbackAmount}${toCurrency} (备用汇率: ${fallbackRate})`;
    }
  },
  {
    name: 'convert_currency',
    description: '将金额从一种货币转换为另一种货币。例如：把 100 USD 转为 CNY。',
    schema: z.object({
      amount: z.number().describe('金额'),
      fromCurrency: z.string().describe('源货币代码，如 USD'),
      toCurrency: z.string().describe('目标货币代码，如 CNY'),
    }),
  }
);

/**
 * 3. PDF 解析工具
 * Agent 需要“阅读”文档的能力
 */
export const pdfTool = tool(
  async ({ filePath }) => {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const parser = new PDFParse({ data: dataBuffer });
      const result = await parser.getText();
      await parser.destroy();

      // 为了防止上下文爆炸，只返回前 2000 字符
      const content = result.text.substring(0, 2000);
      return `PDF 解析成功，共 ${result.total}页。内容预览:${content}`;
    } catch (e) {
      return `PDF 解析失败: ${e instanceof Error ? e.message : '文件不存在或损坏'}`;
    }
  },
  {
    name: 'parse_pdf',
    description: '读取并解析本地 PDF 文件，返回文本内容。用于分析财报、合同等。',
    schema: z.object({
      filePath: z.string().describe('PDF 文件的相对或绝对路径'),
    }),
  }
);

/**
 * 4. 代码解释器（简化版）
 * 让 Agent 能写代码处理复杂逻辑
 * 注意：使用 node:vm 创建隔离沙箱，生产环境建议升级为 Docker / WASM 等更强隔离
 */
export const codeInterpreterTool = tool(
  async ({ code }) => {
    try {
      // 只暴露白名单对象，禁止访问 process、require 等 Node 能力
      const context = vm.createContext({ Math, JSON, console });
      const script = new vm.Script(`(function() {\n${code}\n})()`);
      const result = script.runInContext(context, { timeout: 5000 });

      return `代码执行成功:\n${JSON.stringify(result, null, 2)}`;
    } catch (e) {
      return `代码执行报错: ${e instanceof Error ? e.message : '未知错误'}`;
    }
  },
  {
    name: 'code_interpreter',
    description: '执行 JavaScript 代码来处理复杂的数据逻辑。代码必须包含 return 语句。',
    schema: z.object({
      code: z.string().describe('要执行的 JavaScript 代码'),
    }),
  }
);

// 导出所有工具，方便 Agent 调用
export const allTools: DynamicStructuredTool[] = [
  calculatorTool,
  currencyTool,
  pdfTool,
  codeInterpreterTool,
];