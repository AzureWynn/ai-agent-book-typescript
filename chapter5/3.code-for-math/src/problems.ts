import { Problem } from './types.js';

export const PROBLEMS: Problem[] = [
  {
    id: 'm01',
    topic: 'number theory (inclusion)',
    question: '求 1 到 1000 中既是 3 的倍数又是 7 的倍数的所有数之和。',
    answer: 23688,
    reference: 'print(sum(x for x in range(1, 1001) if x % 3 == 0 and x % 7 == 0))',
  },
  {
    id: 'm02',
    topic: 'modular exponentiation',
    question: '求 7 的 50 次方除以 101 的余数。',
    answer: 100,
    reference: 'print(pow(7, 50, 101))',
  },
  {
    id: 'm03',
    topic: 'lattice points',
    question: '平面上有多少个整点 (x, y) 满足 x^2 + y^2 < 100？',
    answer: 305,
    reference: 'print(sum(1 for x in range(-10, 11) for y in range(-10, 11) if x*x + y*y < 100))',
  },
  {
    id: 'm04',
    topic: 'lcm',
    question: '求 1 到 10 的最小公倍数。',
    answer: 2520,
    reference: 'import math\nprint(math.lcm(*range(1, 11)))',
  },
  {
    id: 'm05',
    topic: 'factorial trailing zeros',
    question: '100 的阶乘末尾有多少个 0？',
    answer: 24,
    reference: 'print(sum(100 // 5**k for k in range(1, 5)))',
  },
  {
    id: 'm06',
    topic: 'prime factorization',
    question: '求 600851475143 的最大素因子。',
    answer: 6857,
    reference: 'n = 600851475143\nf, d, mx = n, 2, 1\nwhile d * d <= f:\n    while f % d == 0:\n        mx = d\n        f //= d\n    d += 1 if d == 2 else 2\nprint(max(mx, f))',
  },
  {
    id: 'm07',
    topic: 'lattice circle',
    question: '平面上有多少个整点 (x, y) 满足 x^2 + y^2 <= 25？',
    answer: 81,
    reference: 'print(sum(1 for x in range(-5, 6) for y in range(-5, 6) if x*x + y*y <= 25))',
  },
  {
    id: 'm08',
    topic: 'digit sum of powers',
    question: '求 2 的 1000 次方的十进制各位数字之和。',
    answer: 1366,
    reference: 'print(sum(map(int, str(2**1000))))',
  },
];
