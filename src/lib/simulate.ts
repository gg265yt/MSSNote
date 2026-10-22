import { SCALE, categoryAverage, subjectScore, type Category, type Grade, type Level, type MissingMode, type SubjectResult } from './grades';

export type SimResult = {
  before: SubjectResult; after: SubjectResult;
  catBefore: number | null; catAfter: number | null;
  delta: number | null; weight: number;
};

/** Rechnet mit derselben subjectScore-Logik wie die App. Die Eingaben werden nie veraendert (nur eine Kopie wird erweitert). */
export function simulate(categories: Category[], grades: Grade[], categoryId: string, value: number, mode: MissingMode): SimResult {
  const sim: Grade[] = [...grades, { categoryId, points: value }];
  const before = subjectScore(categories, grades, mode);
  const after = subjectScore(categories, sim, mode);
  return {
    before, after,
    catBefore: categoryAverage(grades, categoryId), catAfter: categoryAverage(sim, categoryId),
    delta: before.score !== null && after.score !== null ? after.score - before.score : null,
    weight: categories.find(c => c.id === categoryId)?.weight ?? 0,
  };
}

/**
 * Kleinster Wert (Oberstufe) bzw. groesster Wert (Mittelstufe), mit dem eine weitere Note in der Kategorie
 * das Ziel erreicht. null = mit keinem zulaessigen Wert erreichbar. Probiert alle zulaessigen Werte durch.
 */
export function requiredValue(categories: Category[], grades: Grade[], categoryId: string, target: number, mode: MissingMode, level: Level, half: boolean): number | null {
  const { min, max } = SCALE[level];
  const step = half ? 0.5 : 1;
  const vals: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) vals.push(Math.round(v * 2) / 2);
  const score = (v: number) => subjectScore(categories, [...grades, { categoryId, points: v }], mode).score;
  if (level === 'oberstufe') {
    for (const v of vals) { const s = score(v); if (s !== null && s >= target - 1e-9) return v; }
  } else {
    for (const v of [...vals].reverse()) { const s = score(v); if (s !== null && s <= target + 1e-9) return v; }
  }
  return null;
}
