import { runAgent } from './agent.js';

const argv = process.argv.slice(2);
const qi = argv.indexOf('--ask');

async function main(): Promise<void> {
  if (qi === -1 || !argv[qi + 1]) {
    console.log('usage: cli --ask "question about CHANGELOG.md"');
    return;
  }
  const result = await runAgent(argv[qi + 1] ?? '');
  console.log(result.answer);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
