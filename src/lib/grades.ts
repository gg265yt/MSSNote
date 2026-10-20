export type Category = { id: string; name: string; weight: number; active: boolean };
export type Grade = { categoryId: string; points: number };
export type MissingMode = 'renormalize' | 'strict';
export type Step = { category: string; count: number; average: number | null; weight: number; used: boolean };
export type SubjectResult = {
  score: number | null; complete: boolean; weightSum: number; valid: boolean; steps: Step[]; reason?: string;
};
const EPS = 0.005; // Toleranz für Rundung (z. B. 33,33 + 33,33 + 33,34)

export function isValidPoints(p: number, half = false): boolean {
  return Number.isFinite(p) && p >= 0 && p <= 15 && (half ? p * 2 : p) % 1 === 0;
}
/** Durchschnitt einer Kategorie; null = noch keine Note (nicht gleich 0 Punkte). */
export function categoryAverage(grades: Grade[], categoryId: string): number | null {
  const g = grades.filter(x => x.categoryId === categoryId);
  return g.length ? g.reduce((s, x) => s + x.points, 0) / g.length : null;
}
export function weightSum(categories: Category[]): number {
  return categories.filter(c => c.active).reduce((s, c) => s + c.weight, 0);
}
/** Skaliert aktive Gewichte auf 100 %. */
export function normalizeWeights(categories: Category[]): Category[] {
  const sum = weightSum(categories);
  if (sum <= 0) return categories;
  return categories.map(c => (c.active ? { ...c, weight: (c.weight / sum) * 100 } : c));
}
/** Fachpunktzahl = Summe(Kategoriedurchschnitt x Gewicht/100). Bei ungueltiger Summe: kein Ergebnis. */
export function subjectScore(categories: Category[], grades: Grade[], mode: MissingMode = 'renormalize'): SubjectResult {
  const active = categories.filter(c => c.active);
  const sum = weightSum(categories);
  const steps: Step[] = active.map(c => ({ category: c.name, count: grades.filter(g => g.categoryId === c.id).length, average: categoryAverage(grades, c.id), weight: c.weight, used: false }));
  if (Math.abs(sum - 100) > EPS)
    return { score: null, complete: false, weightSum: sum, valid: false, steps, reason: 'Gewichtungen ergeben nicht 100 %.' };
  const rated = steps.filter(s => s.average !== null);
  const complete = rated.length === steps.length;
  if (!complete && mode === 'strict')
    return { score: null, complete, weightSum: sum, valid: true, steps, reason: 'Es fehlen Noten in gewichteten Kategorien.' };
  const usedWeight = rated.reduce((s, x) => s + x.weight, 0);
  if (usedWeight <= 0) return { score: null, complete, weightSum: sum, valid: true, steps, reason: 'Noch keine Noten.' };
  rated.forEach(s => (s.used = true));
  const score = rated.reduce((s, x) => s + (x.average as number) * x.weight, 0) / usedWeight;
  return { score, complete, weightSum: sum, valid: true, steps };
}

export type Level = 'oberstufe' | 'mittelstufe';
export const SCALE = {
  oberstufe: { min: 0, max: 15, unit: 'Punkte', label: 'Punkte (0 bis 15)', ticks: [0, 5, 10, 15] },
  mittelstufe: { min: 1, max: 6, unit: 'Note', label: 'Note (1 bis 6)', ticks: [6, 5, 4, 3, 2, 1] },
} as const;
export function isValidValue(v: number, level: Level, half = false): boolean {
  const { min, max } = SCALE[level];
  return Number.isFinite(v) && v >= min && v <= max && (half ? v * 2 : v) % 1 === 0;
}
/** Position 0..1 auf der Skala, 1 = beste Leistung (bei Noten ist die 1 am besten). */
export function scalePos(v: number, level: Level): number {
  const p = level === 'oberstufe' ? v / 15 : (6 - v) / 5;
  return Math.min(1, Math.max(0, p));
}
