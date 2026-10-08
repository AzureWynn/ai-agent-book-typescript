// 确定性工具（官方 tools.py 对应）：机票/酒店/餐饮三查 + 总额标准答案。
export const PRICES = { flight: 3500, hotel: 800, meal: 200 };
export const TASK = '查一下东京的机票（每人）、酒店（每晚）、餐饮（每人每天）价格，算 2 人 3 天的总预算，用中文报出分项和总额。';
// 总额 = 3500*2 + 800*3 + 200*2*3 = 10600
export const EXPECTED_TOTAL = PRICES.flight * 2 + PRICES.hotel * 3 + PRICES.meal * 2 * 3;

export function execute(name: string, args: Record<string, unknown>): string {
  const city = String(args.city ?? '东京');
  if (name === 'get_flight_price') return `${city}机票 ${PRICES.flight} 元/人`;
  if (name === 'get_hotel_price') return `${city}酒店 ${PRICES.hotel} 元/晚`;
  if (name === 'get_meal_budget') return `${city}餐饮 ${PRICES.meal} 元/人天`;
  return `未知工具 ${name}`;
}

export function answerIsCorrect(text: string): boolean {
  return text.includes(String(EXPECTED_TOTAL));
}
