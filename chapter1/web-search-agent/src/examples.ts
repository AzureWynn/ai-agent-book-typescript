/** 内置示例问题（对应官方 examples.py 的场景） */

export interface ExampleQuestion {
  name: string;
  description: string;
  question: string;
}

export const EXAMPLE_QUESTIONS: ExampleQuestion[] = [
  {
    name: '实时汇率',
    description: '查询当前汇率（需实时搜索）',
    question: '今天美元兑人民币的汇率是多少？与上周相比有什么变化？',
  },
  {
    name: '新闻事件',
    description: '查询最新新闻',
    question: '最近一周 AI 领域有什么重大新闻事件？',
  },
  {
    name: '技术资料',
    description: '查询技术资料',
    question: 'LangChain 最新版本支持哪些新特性？',
  },
  {
    name: '股票价格',
    description: '查询实时股价',
    question: 'Apple（AAPL）最新的股价是多少？近期走势如何？',
  },
];