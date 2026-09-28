import { MemChunk, MemoryCard, QuerySpec } from './types.js';

export const CHUNKS: MemChunk[] = [
  { id: 't1', text: '东京的机票订好了，1月25日出发。', orphan: false },
  { id: 't2', text: '好的，就订这个吧。', orphan: true },
  { id: 't3', text: '我的护照2025年2月18日过期。', orphan: false },
  { id: 't4', text: '他已经改了时间，推迟了一周。', orphan: true },
  { id: 'b1', text: '我的工资卡尾号是4832。', orphan: false },
  { id: 'b2', text: '就用这张卡付款吧。', orphan: true },
  { id: 'h1', text: '西雅图出差住凯悦酒店。', orphan: false },
  { id: 'h2', text: '可以，帮我订下来。', orphan: true },
  { id: 'c1', text: '本田车下周三上午保养。', orphan: false },
  { id: 'c2', text: '特斯拉胎压这周检查。', orphan: false },
  { id: 'p1', text: '东京之行要带护照和机票行程单。', orphan: false },
  { id: 'p2', text: '别忘了提前三小时到机场。', orphan: true },
];

export const PREFIXES: Record<string, string> = {
  t2: '确认订1月25日飞东京机票。',
  t4: '东京之行改期推迟一周。',
  b2: '用尾号4832工资卡付款。',
  h2: '确认订西雅图凯悦酒店。',
  p2: '出国机场准备建议。',
};

export const CARDS: MemoryCard[] = [
  {
    key: 'travel.tokyo_trip',
    category: 'travel',
    backstory: '用户预订1月机票时确认的行程',
    person: 'Alice (primary)',
    relationship: 'self',
    facts: { destination: '东京', depart: '1月25日', note: '已推迟一周' },
  },
  {
    key: 'personal.passport',
    category: 'personal',
    backstory: '用户办理签证时提供的证件信息',
    person: 'Alice (primary)',
    relationship: 'self',
    facts: { expiry: '2025年2月18日' },
  },
  {
    key: 'financial.bank_account',
    category: 'financial',
    backstory: '用户开设银行账户时提供的信息',
    person: 'Alice (primary)',
    relationship: 'primary account holder',
    facts: { tail: '4832' },
  },
  {
    key: 'travel.hotel_seattle',
    category: 'travel',
    backstory: '用户安排西雅图出差时确认',
    person: 'Alice (primary)',
    relationship: 'self',
    facts: { hotel: '凯悦酒店', status: '已预订' },
  },
];

export const QUERIES: QuerySpec[] = [
  { query: '我最后确认预订的那张机票是哪个航班', relevant: ['t2'] },
  { query: '西雅图酒店确认了吗', relevant: ['h2'] },
  { query: '护照什么时候过期', relevant: ['t3'] },
  { query: '工资卡尾号是多少', relevant: ['b1'] },
  { query: '特斯拉胎压什么时候检查', relevant: ['c2'] },
  { query: '东京之行什么时候出发', relevant: ['t1'] },
  { query: '他改时间推迟了多久', relevant: ['t4'] },
  { query: '出国要提前多久到机场', relevant: ['p2'] },
];
