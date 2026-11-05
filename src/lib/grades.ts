/**
 * Berechnungssystem (AL-System)
 * - Jede Kategorie gehört zum Bereich "Klausur" oder "AL" (Allgemeine Leistung) und hat einen Faktor (Gewichtung pro Note).
 * - Bereichsdurchschnitt = Σ (Note × Faktor der Kategorie) ÷ Σ Faktoren. Beispiel AL: mündlich Faktor 2, Test Faktor 1,
 *   dann zählt eine mündliche Note doppelt so viel wie ein Test.
 * - Fachergebnis = (Klausur × 1 + AL × r) ÷ (1 + r) mit r = 1 (Klausur 1:1 AL) oder r = 2 (Klausur 1:2 AL).
 */
export type Role = 'klausur' | 'al';
export type AlRatio = 1 | 2;
export type Category = { id: string; name: string; role: Role; factor: number; active: boolean };
export type Grade = { categoryId: string; points: number };
export type MissingMode = 'renormalize' | 'strict';
export type Step = { category: string; role: Role; count: number; average: number | null; factor: number; used: boolean };
export type SubjectResult = {
  score: number | null; complete: boolean; valid: boolean; steps: Step[]; reason?: string; ratio: AlRatio;
  klausur: number | null; al: number | null; klausurSum: number; klausurW: number; alSum: number; alW: number;
  shares: { klausur: number; al: number } | null;
};
export const ROLE_LABEL: Record<Role, string> = { klausur: 'Klausur', al: 'AL' };

export function isValidPoints(p: number, half = false): boolean {
  return Number.isFinite(p) && p >= 0 && p <= 15 && (half ? p * 2 : p) % 1 === 0;
}
/** Durchschnitt einer Kategorie (nur zur Anzeige); null = noch keine Note (nicht gleich 0 Punkte). */
export function categoryAverage(grades: Grade[], categoryId: string): number | null {
  const g = grades.filter(x => x.categoryId === categoryId);
  return g.length ? g.reduce((s, x) => s + x.points, 0) / g.length : null;
}

export function subjectScore(categories: Category[], grades: Grade[], mode: MissingMode = 'renormalize', ratio: AlRatio = 1): SubjectResult {
  const active = categories.filter(c => c.active);
  const steps: Step[] = active.map(c => {
    const g = grades.filter(x => x.categoryId === c.id);
    return { category: c.name, role: c.role, count: g.length, average: g.length ? g.reduce((s, x) => s + x.points, 0) / g.length : null, factor: c.factor, used: false };
  });
  const res: SubjectResult = { score: null, complete: false, valid: true, steps, ratio, klausur: null, al: null, klausurSum: 0, klausurW: 0, alSum: 0, alW: 0, shares: null };
  if (active.some(c => !Number.isFinite(c.factor) || c.factor <= 0))
    return { ...res, valid: false, reason: 'Alle Gewichtungsfaktoren müssen größer als 0 sein.' };
  const part = (role: Role) => {
    const cs = active.filter(c => c.role === role);
    let sum = 0, w = 0;
    for (const c of cs) for (const x of grades) if (x.categoryId === c.id) { sum += x.points * c.factor; w += c.factor; }
    return { exists: cs.length > 0, sum, w };
  };
  const k = part('klausur'), a = part('al');
  res.klausurSum = k.sum; res.klausurW = k.w; res.alSum = a.sum; res.alW = a.w;
  res.klausur = k.w > 0 ? k.sum / k.w : null;
  res.al = a.w > 0 ? a.sum / a.w : null;
  if (!k.exists && !a.exists) return { ...res, reason: 'Es gibt keine aktive Kategorie.' };
  res.complete = (!k.exists || k.w > 0) && (!a.exists || a.w > 0);
  if (!res.complete && mode === 'strict') {
    const miss = [k.exists && k.w === 0 ? 'Klausur' : '', a.exists && a.w === 0 ? 'AL' : ''].filter(Boolean).join(' und ');
    return { ...res, reason: `Es fehlen Noten im Bereich ${miss}.` };
  }
  if (k.w === 0 && a.w === 0) return { ...res, reason: 'Noch keine Noten.' };
  const wk = k.w > 0 ? 1 : 0, wa = a.w > 0 ? ratio : 0;
  res.score = ((res.klausur ?? 0) * wk + (res.al ?? 0) * wa) / (wk + wa);
  res.shares = { klausur: wk / (wk + wa), al: wa / (wk + wa) };
  for (const s of steps) s.used = s.count > 0 && (s.role === 'klausur' ? k.w > 0 : a.w > 0);
  return res;
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
