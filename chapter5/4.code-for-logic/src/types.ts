export type Statement =
  | { kind: 'is-knight'; who: string }
  | { kind: 'is-knave'; who: string }
  | { kind: 'all-knave'; who: string[] }
  | { kind: 'all-knight'; who: string[] }
  | { kind: 'same-type'; a: string; b: string }
  | { kind: 'exactly-n-knights'; n: number }
  | { kind: 'at-least-n-knights'; n: number }
  | { kind: 'or-is-knight'; who: string[] };

export interface Utterance {
  speaker: string;
  says: Statement;
}

export interface Puzzle {
  id: string;
  people: string[];
  stem: string;
  statements: Utterance[];
  solution: Record<string, 'knight' | 'knave'>;
}

export type Assignment = Record<string, boolean>;
