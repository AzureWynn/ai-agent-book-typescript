import { Puzzle } from './types.js';

export const PUZZLES: Puzzle[] = [
  {
    id: 'kk01',
    people: ['A', 'B'],
    stem: 'A 说：“我们两个都是无赖。”请判断 A 和 B 各是骑士还是无赖。',
    statements: [{ speaker: 'A', says: { kind: 'all-knave', who: ['A', 'B'] } }],
    solution: { A: 'knave', B: 'knight' },
  },
  {
    id: 'kk02',
    people: ['A', 'B'],
    stem: 'A 说：“B 是骑士。”B 说：“我们两个是同类。”请判断 A 和 B 各是骑士还是无赖。',
    statements: [
      { speaker: 'A', says: { kind: 'is-knight', who: 'B' } },
      { speaker: 'B', says: { kind: 'same-type', a: 'A', b: 'B' } },
    ],
    solution: { A: 'knight', B: 'knight' },
  },
  {
    id: 'kk03',
    people: ['A', 'B', 'C'],
    stem: 'A 说：“B 是无赖。”B 说：“C 是无赖。”C 说：“A 和 B 都是骑士。”请判断三人身份。',
    statements: [
      { speaker: 'A', says: { kind: 'is-knave', who: 'B' } },
      { speaker: 'B', says: { kind: 'is-knave', who: 'C' } },
      { speaker: 'C', says: { kind: 'all-knight', who: ['A', 'B'] } },
    ],
    solution: { A: 'knave', B: 'knight', C: 'knave' },
  },
  {
    id: 'kk04',
    people: ['A', 'B', 'C'],
    stem: 'A 说：“B 和 C 都是无赖。”B 说：“A 是骑士。”C 说：“A 是无赖。”请判断三人身份。',
    statements: [
      { speaker: 'A', says: { kind: 'all-knave', who: ['B', 'C'] } },
      { speaker: 'B', says: { kind: 'is-knight', who: 'A' } },
      { speaker: 'C', says: { kind: 'is-knave', who: 'A' } },
    ],
    solution: { A: 'knave', B: 'knave', C: 'knight' },
  },
  {
    id: 'kk05',
    people: ['A', 'B', 'C', 'D'],
    stem: 'A 说：“我们四人中有两个骑士。”B 说：“C 是骑士。”C 说：“D 是无赖。”D 说：“A 是无赖。”请判断四人身份。',
    statements: [
      { speaker: 'A', says: { kind: 'exactly-n-knights', n: 2 } },
      { speaker: 'B', says: { kind: 'is-knight', who: 'C' } },
      { speaker: 'C', says: { kind: 'is-knave', who: 'D' } },
      { speaker: 'D', says: { kind: 'is-knave', who: 'A' } },
    ],
    solution: { A: 'knave', B: 'knave', C: 'knave', D: 'knight' },
  },
  {
    id: 'kk06',
    people: ['A', 'B', 'C', 'D'],
    stem: 'A 说：“B 和我是同类。”B 说：“C 和我是同类。”C 说：“D 是骑士。”D 说：“A 是无赖。”请判断四人身份。',
    statements: [
      { speaker: 'A', says: { kind: 'same-type', a: 'A', b: 'B' } },
      { speaker: 'B', says: { kind: 'same-type', a: 'B', b: 'C' } },
      { speaker: 'C', says: { kind: 'is-knight', who: 'D' } },
      { speaker: 'D', says: { kind: 'is-knave', who: 'A' } },
    ],
    solution: { A: 'knave', B: 'knight', C: 'knight', D: 'knight' },
  },
  {
    id: 'kk07',
    people: ['A', 'B', 'C', 'D', 'E'],
    stem: 'A 说：“B 是骑士。”B 说：“C 是无赖。”C 说：“D 是骑士。”D 说：“E 是无赖。”E 说：“我们五人中至少有两个骑士。”请判断五人身份。',
    statements: [
      { speaker: 'A', says: { kind: 'is-knight', who: 'B' } },
      { speaker: 'B', says: { kind: 'is-knave', who: 'C' } },
      { speaker: 'C', says: { kind: 'is-knight', who: 'D' } },
      { speaker: 'D', says: { kind: 'is-knave', who: 'E' } },
      { speaker: 'E', says: { kind: 'at-least-n-knights', n: 2 } },
    ],
    solution: { A: 'knight', B: 'knight', C: 'knave', D: 'knave', E: 'knight' },
  },
  {
    id: 'kk08',
    people: ['A', 'B', 'C'],
    stem: 'A 说：“B 是骑士或者 C 是骑士。”B 说：“A 是无赖。”C 说：“B 是无赖。”请判断三人身份。',
    statements: [
      { speaker: 'A', says: { kind: 'or-is-knight', who: ['B', 'C'] } },
      { speaker: 'B', says: { kind: 'is-knave', who: 'A' } },
      { speaker: 'C', says: { kind: 'is-knave', who: 'B' } },
    ],
    solution: { A: 'knight', B: 'knave', C: 'knight' },
  },
];
