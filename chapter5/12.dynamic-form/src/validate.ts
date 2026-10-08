// validate_form 的 TS 版：正则 + 字符串匹配做鲁棒校验（对应官方 BeautifulSoup 版）。
// 模型标签写法不可控，策略相同：语义等价即算通过，逐项给证据。
export interface StaticReport {
  '出发城市(文本输入)': boolean;
  '出发日期(日期选择器)': boolean;
  '旅行类型(单选:单程)': boolean;
  '旅行类型(单选:往返)': boolean;
  '返程日期(日期选择器)': boolean;
  '返程字段级联逻辑(仅往返显示)': boolean;
}

export function validateForm(html: string): { pass: boolean; report: StaticReport; script: string } {
  const lower = html.toLowerCase();
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1] ?? '').join('\n');

  const depCity = /name\s*=\s*["']departure_city["']/i.test(html) && /<input[^>]*name\s*=\s*["']departure_city["'][^>]*>/i.test(html);
  const depDate = /<input[^>]*type\s*=\s*["']date["'][^>]*name\s*=\s*["']departure_date["'][^>]*>/i.test(html)
    || /<input[^>]*name\s*=\s*["']departure_date["'][^>]*type\s*=\s*["']date["'][^>]*>/i.test(html);
  const radios = [...html.matchAll(/<input[^>]*type\s*=\s*["']radio["'][^>]*>/gi)];
  const radioVals = radios.map((r) => r[0].toLowerCase()).join(' ');
  const hasOne = /one_way|单程/.test(radioVals + lower);
  const hasRound = /round_trip|往返/.test(radioVals + lower);
  const retDate = /name\s*=\s*["']return_date["']/i.test(html);
  const cascade = /round_trip|往返/.test(scripts)
    && /return_date|return_date_field|returndate/i.test(scripts)
    && /display|hidden|style|classlist|\.hide|\.show|toggle/i.test(scripts);

  const report: StaticReport = {
    '出发城市(文本输入)': depCity,
    '出发日期(日期选择器)': depDate,
    '旅行类型(单选:单程)': radios.length >= 2 && hasOne,
    '旅行类型(单选:往返)': radios.length >= 2 && hasRound,
    '返程日期(日期选择器)': retDate,
    '返程字段级联逻辑(仅往返显示)': cascade,
  };
  return { pass: Object.values(report).every(Boolean), report, script: scripts };
}
