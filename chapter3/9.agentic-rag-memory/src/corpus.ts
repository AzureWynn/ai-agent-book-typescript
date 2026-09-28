import { QuerySpec, Round } from './types.js';

export const ROUNDS: Round[] = [
  { sessionId: 's1', roundNo: 1, user: '我的本田车跑了八万公里，下个月想去做保养。', assistant: '好的，已记下本田保养计划。', facets: ['本田里程', '保养计划'] },
  { sessionId: 's1', roundNo: 2, user: '4S店离家远吗？', assistant: '不远，地铁直达。', facets: [] },
  { sessionId: 's2', roundNo: 3, user: '特斯拉提示胎压不足，这周要去检查一下。', assistant: '好的，特斯拉胎压检查已记下。', facets: ['特斯拉胎压'] },
  { sessionId: 's2', roundNo: 4, user: '检查要预约吗？', assistant: '建议提前一天预约。', facets: [] },
  { sessionId: 's3', roundNo: 5, user: '我喜欢海边，今年夏天想去海边旅行。', assistant: '海边旅行听起来不错。', facets: ['海边偏好'] },
  { sessionId: 's3', roundNo: 6, user: '海边有什么推荐吗？', assistant: '可以看看三亚和厦门。', facets: [] },
  { sessionId: 's4', roundNo: 7, user: '海边旅行取消了，改成去山区。', assistant: '好的，改去山区旅行。', facets: ['取消海边', '山区偏好'] },
  { sessionId: 's4', roundNo: 8, user: '山区要带什么？', assistant: '带登山鞋和外套。', facets: [] },
  { sessionId: 's5', roundNo: 9, user: '我的工资卡尾号是4832。', assistant: '已记下工资卡尾号。', facets: ['银行卡'] },
  { sessionId: 's5', roundNo: 10, user: '工资卡是哪个银行的？', assistant: '招商银行。', facets: ['银行卡'] },
  { sessionId: 's6', roundNo: 11, user: '本田4S店确认了，下周三上午保养，工单号FS-447291。', assistant: '确认收到，本田保养已确认。', facets: ['本田确认'] },
  { sessionId: 's6', roundNo: 12, user: '保养要带什么证件？', assistant: '带行驶证。', facets: [] },
  { sessionId: 's7', roundNo: 13, user: '今天天气不错。', assistant: '是的，适合出门。', facets: [] },
  { sessionId: 's7', roundNo: 14, user: '明天会下雨吗？', assistant: '有阵雨。', facets: [] },
  { sessionId: 's8', roundNo: 15, user: '我喜欢喝拿铁，不加糖。', assistant: '已记下拿铁口味。', facets: ['咖啡偏好'] },
  { sessionId: 's8', roundNo: 16, user: '拿铁一般多少钱？', assistant: '约二十五元。', facets: [] },
];

export const QUESTIONS: QuerySpec[] = [
  {
    query: '我的工资卡尾号是多少',
    relevant: ['k_s5'],
    facets: ['银行卡'],
    subqueries: [{ text: '工资卡尾号', facets: ['银行卡'] }],
    difficulty: 'easy',
    layer: 'L1',
  },
  {
    query: '我喜欢喝什么咖啡',
    relevant: ['k_s8'],
    facets: ['咖啡偏好'],
    subqueries: [{ text: '咖啡口味偏好', facets: ['咖啡偏好'] }],
    difficulty: 'easy',
    layer: 'L1',
  },
  {
    query: '哪辆车先去保养',
    relevant: ['k_s1', 'k_s2', 'k_s6'],
    facets: ['保养计划', '特斯拉胎压', '本田确认'],
    subqueries: [{ text: '本田保养计划', facets: ['保养计划'] }, { text: '特斯拉检查', facets: ['特斯拉胎压'] }, { text: '保养确认工单', facets: ['本田确认'] }],
    difficulty: 'hard',
    layer: 'L2',
  },
  {
    query: '海边旅行还去吗',
    relevant: ['k_s4'],
    facets: ['取消海边'],
    subqueries: [{ text: '取消海边旅行', facets: ['取消海边'] }],
    difficulty: 'hard',
    layer: 'L2',
  },
  {
    query: '出门前要准备什么证件和物品',
    relevant: ['k_s4', 'k_s6'],
    facets: ['山区偏好', '本田确认'],
    subqueries: [{ text: '山区携带物品', facets: ['山区偏好'] }, { text: '保养证件', facets: ['本田确认'] }],
    difficulty: 'hard',
    layer: 'L3',
  },
];
