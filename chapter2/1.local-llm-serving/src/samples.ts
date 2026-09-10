/**
 * 样例任务（对应官方 main.py 的 get_sample_tasks）。
 * 从简单到复杂：时间 → 天气 → 复合 → 代码解释器 → 多城市 → 财务 → 跨时区。
 */

export interface SampleTask {
  name: string;
  description: string;
  task: string;
}

export function getSampleTasks(): SampleTask[] {
  return [
    {
      name: '🕐 Current Time Check',
      description: 'Get the current time in a specific city',
      task: 'What is the current time in Vancouver?',
    },
    {
      name: '☀️ Simple Weather Check',
      description: 'Get current weather for a single city',
      task: "What's the weather like in Vancouver right now?",
    },
    {
      name: '☀️ Time and Weather Check',
      description: 'Get current time and weather for a single city',
      task: "What's the current time and weather like in Vancouver right now?",
    },
    {
      name: '💵 Compound Interest Calculation',
      description: 'Calculate compound interest using code interpreter',
      task:
        'Calculate the compound interest on $5,000 invested at 6% annual interest rate for 30 years, compounded monthly.',
    },
    {
      name: '🌡️ Multi-City Weather Analysis',
      description: 'Compare weather across multiple cities using real-time data',
      task: `Get the current weather for Tokyo, New York, London, Sydney, and Dubai.
Then:
1. Which city has the highest temperature?
2. Which city has the lowest humidity?
3. Convert all temperatures to Fahrenheit for comparison
4. Calculate the average temperature across all cities`,
    },
    {
      name: '💰 Complex Financial Analysis',
      description: 'Multi-step financial calculation with currency conversion',
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
      name: '⏰ Global Time Zone Coordination',
      description: 'Coordinate meeting times across time zones',
      task: `We need to schedule a global meeting with offices in:
- San Francisco (PST)
- New York (EST)
- London (GMT/BST)
- Tokyo (JST)
- Sydney (AEST)

If the meeting is at 2 PM London time:
1. What time would it be in each city?
2. Is this during normal business hours (9 AM - 5 PM) for each location?
3. Suggest a better time that works for most offices`,
    },
  ];
}