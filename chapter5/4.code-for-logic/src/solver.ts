import { Assignment, Puzzle, Statement, Utterance } from './types.js';

function evalStatement(st: Statement, a: Assignment, people: string[]): boolean {
  switch (st.kind) {
    case 'is-knight':
      return a[st.who] === true;
    case 'is-knave':
      return a[st.who] === false;
    case 'all-knave':
      return st.who.every((p) => a[p] === false);
    case 'all-knight':
      return st.who.every((p) => a[p] === true);
    case 'same-type':
      return a[st.a] === a[st.b];
    case 'exactly-n-knights': {
      const n = people.filter((p) => a[p] === true).length;
      return n === st.n;
    }
    case 'at-least-n-knights': {
      const n = people.filter((p) => a[p] === true).length;
      return n >= st.n;
    }
    case 'or-is-knight':
      return st.who.some((p) => a[p] === true);
  }
}

export function solvePuzzle(people: string[], statements: Utterance[]): Assignment[] {
  const out: Assignment[] = [];
  const total = 1 << people.length;
  for (let mask = 0; mask < total; mask++) {
    const a: Assignment = {};
    people.forEach((p, i) => {
      a[p] = ((mask >> i) & 1) === 1;
    });
    const ok = statements.every((u) => {
      const speakerIsKnight = a[u.speaker] === true;
      return speakerIsKnight === evalStatement(u.says, a, people);
    });
    if (ok) out.push(a);
  }
  return out;
}

export function assignmentToSolution(a: Assignment): Record<string, 'knight' | 'knave'> {
  const out: Record<string, 'knight' | 'knave'> = {};
  for (const [k, v] of Object.entries(a)) out[k] = v ? 'knight' : 'knave';
  return out;
}

export function verifyPuzzle(p: Puzzle): { solutions: number; matchesGold: boolean } {
  const sols = solvePuzzle(p.people, p.statements);
  const matchesGold =
    sols.length === 1 &&
    p.people.every((person) => sols[0]?.[person] === (p.solution[person] === 'knight'));
  return { solutions: sols.length, matchesGold };
}
