import { Ollama } from 'ollama';
import { writeFileSync } from 'node:fs';

const o = new Ollama({ host: 'http://localhost:11434' });

async function gen(task: string): Promise<string> {
  const r = await o.chat({
    model: 'gemma4:latest',
    messages: [{ role: 'user', content: `${task} 只输出 Python 代码，不要解释，不要 markdown 围栏。` }],
    options: { temperature: 0 },
  });
  return r.message.content.replace(/```python|```/g, '');
}

const t1 = await gen('写函数 fizzbuzz(n)，返回 1 到 n 的 FizzBuzz 列表（3 的倍数 Fizz，5 的倍数 Buzz，15 的倍数 FizzBuzz），最后加一行 print(fizzbuzz(15))');
writeFileSync('/tmp/touch1.py', t1);
const t2 = await gen('计算 1 到 1000 中既是 3 的倍数又是 7 的倍数的所有数之和，最后加一行 print(答案)');
writeFileSync('/tmp/touch2.py', t2);
console.log('saved');
