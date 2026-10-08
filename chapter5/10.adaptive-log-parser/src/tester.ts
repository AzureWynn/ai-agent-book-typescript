import { ParseEngine } from './engine.js';
import { TestReport } from './types.js';

export async function testParser(
  engine: ParseEngine,
  file: string,
  samples: string[],
  requiredKeys: string[]
): Promise<TestReport> {
  const details: string[] = [];
  let passed = 0;
  for (const sample of samples) {
    const fields = await engine.runCandidateFile(file, sample);
    if (!fields) {
      details.push(`样本返回 None：${sample.slice(0, 60)}`);
      continue;
    }
    const missing = requiredKeys.filter((k) => fields[k] === undefined || fields[k] === null || fields[k] === '');
    if (missing.length > 0) {
      details.push(`缺字段 [${missing.join(', ')}]：${sample.slice(0, 60)}`);
      continue;
    }
    passed += 1;
    details.push(`通过，字段：[${Object.keys(fields).join(', ')}]`);
  }
  return { passed: passed === samples.length, details };
}
