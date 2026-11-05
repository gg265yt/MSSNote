import { SCALE, categoryAverage, subjectScore, type AlRatio, type Category, type Grade, type Level, type MissingMode, type Role, type SubjectResult } from './grades';

export type SimResult = {
  before: SubjectResult; after: SubjectResult;
  catBefore: number | null; catAfter: number | null;
  role: Role; factor: number; partBefore: number | null; partAfter: number | null;
  delta: number | null;
};

/** Rechnet mit derselben subjectScore-Logik wie die App. Die Eingaben werden nie veraendert (nur eine Kopie wird erweitert). */
export function simulate(categories: Category[], grades: Grade[], categoryId: string, value: number, mode: MissingMode, ratio: AlRatio = 1): SimResult {
  const sim: Grade[] = [...grades, { categoryId, points: value }];
  const before = subjectScore(categories, grades, mode, ratio);
  const after = subjectScore(categories, sim, mode, ratio);
  const cat = categories.find(c => c.id === categoryId);
  const role: Role = cat?.role ?? 'al';
  return {
    before, after, role, factor: cat?.factor ?? 0,
    catBefore: categoryAverage(grades, categoryId), catAfter: categoryAverage(sim, categoryId),
    partBefore: role === 'klausur' ? before.klausur : before.al, partAfter: role === 'klausur' ? after.klausur : after.al,
    delta: before.score !== null && after.score !== null ? after.score - before.score : null,
  };
}

/**
 * Kleinster Wert (Oberstufe) bzw. groesster Wert (Mittelstufe), mit dem eine weitere Note in der Kategorie
 * das Ziel erreicht. null = mit keinem zulaessigen Wert erreichbar. Probiert alle zulaessigen Werte durch.
 */
export function requiredValue(categories: Category[], grades: Grade[], categoryId: string, target: number, mode: MissingMode, level: Level, half: boolean, ratio: AlRatio = 1): number | null {
  const { min, max } = SCALE[level];
  const step = half ? 0.5 : 1;
  const vals: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) vals.push(Math.round(v * 2) / 2);
  const score = (v: number) => subjectScore(categories, [...grades, { categoryId, points: v }], mode, ratio).score;
  if (level === 'oberstufe') {
    for (const v of vals) { const s = score(v); if (s !== null && s >= target - 1e-9) return v; }
  } else {
    for (const v of [...vals].reverse()) { const s = score(v); if (s !== null && s <= target + 1e-9) return v; }
  }
  return null;
}
