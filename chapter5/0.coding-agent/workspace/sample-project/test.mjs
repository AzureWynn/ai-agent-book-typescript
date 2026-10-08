// TODO: add edge case tests for negative numbers
import { add } from './calc.mjs';

const cases = [[1, 2, 3], [0, 0, 0], [-5, 5, 0]];
let fail = 0;
for (const [a, b, want] of cases) {
  const got = add(a, b);
  if (got !== want) { console.log(`FAIL add(${a},${b})=${got}, want ${want}`); fail++; }
}
if (fail === 0) console.log('ALL TESTS PASS');
else { console.log(`${fail} FAILURES`); process.exit(1); }
