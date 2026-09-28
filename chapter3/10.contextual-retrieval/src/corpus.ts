import { Chunk, QuerySpec } from './types.js';

export const CHUNKS: Chunk[] = [
  { id: 'a1', docId: 'docA', text: '为促进新能源汽车消费，延续实施车辆购置税减免政策。', orphan: false },
  { id: 'a2', docId: 'docA', text: '该政策于次年生效，有效期三年。', orphan: true },
  { id: 'a3', docId: 'docA', text: '减免幅度为购置税全额，单车上限三万元。', orphan: false },
  { id: 'b1', docId: 'docB', text: '纳税人赡养老人支出可按每月三千元扣除。', orphan: false },
  { id: 'b2', docId: 'docB', text: '上述扣除标准自明年一月起执行。', orphan: true },
  { id: 'b3', docId: 'docB', text: '扣除方式包括自行申报和单位代扣。', orphan: false },
  { id: 'c1', docId: 'docC', text: '人民检察院依法独立行使检察权。', orphan: false },
  { id: 'c2', docId: 'docC', text: '该职权不受行政机关干涉。', orphan: true },
  { id: 'c3', docId: 'docC', text: '国家主席每届任期五年，可连选连任。', orphan: false },
  { id: 'd1', docId: 'docD', text: '天翼科技2023年年报显示，公司收入增长3%。', orphan: false },
  { id: 'd2', docId: 'docD', text: '其中云业务增长20%，占比首次过半。', orphan: true },
  { id: 'd3', docId: 'docD', text: '公司计划加大人工智能投入。', orphan: false },
];

export const PREFIXES: Record<string, string> = {
  a2: '本块属于2023年发布的新能源汽车购置税减免政策说明。',
  b2: '本块属于个人所得税赡养老人专项附加扣除，每月三千元。',
  c2: '本块讨论人民检察院依法独立行使的检察权。',
  d2: '这是天翼科技2023年年报的业务构成部分。',
};

export const QUERIES: QuerySpec[] = [
  { query: '新能源汽车购置税政策何时生效', relevant: ['a2'] },
  { query: '赡养老人扣除标准何时执行', relevant: ['b2'] },
  { query: '检察权受不受行政机关干涉', relevant: ['c2'] },
  { query: '天翼科技云业务增长多少', relevant: ['d2'] },
  { query: '车辆购置税减免上限', relevant: ['a3'] },
  { query: '赡养老人每月扣多少', relevant: ['b1'] },
  { query: '国家主席任期几年', relevant: ['c3'] },
  { query: '天翼科技哪块业务占比过半', relevant: ['d2'] },
];
