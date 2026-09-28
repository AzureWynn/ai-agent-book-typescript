export type Charge = 'theft' | 'injury' | 'fraud';

export interface GoldFactors {
  surrender: boolean;
  compensation: boolean;
  plea: boolean;
  record: boolean;
  amount: number | null;
  gang: boolean;
  weapon: boolean;
  home: boolean;
  level: '轻微伤' | '轻伤' | '重伤' | null;
  premeditation: boolean;
  victims: number | null;
}

export interface CaseItem {
  id: string;
  charge: Charge;
  fact: string;
  gold: GoldFactors;
  labelMonths: number;
}

export interface FactorSchema {
  core: string[];
  extensions: Record<Charge, string[]>;
}

export type FactorValue = boolean | number | string | null;

export interface Archetype {
  id: string;
  charge: Charge;
  size: number;
  members: string[];
  medianMonths: number;
  lo: number;
  hi: number;
  defining: Array<{ factor: string; z: number }>;
  centroid: number[];
}

export interface AdviseResult {
  charge: Charge | null;
  known: Record<string, FactorValue>;
  missing: string[];
  ask: string | null;
  archetype: Archetype | null;
  distance: number;
  advice: string;
}
