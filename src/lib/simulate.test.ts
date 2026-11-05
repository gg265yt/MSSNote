import { describe, it, expect } from 'vitest';
import { requiredValue, simulate } from './simulate';
import type { Category } from './grades';

const cats: Category[] = [
  { id: 'k', name: 'Klausuren', role: 'klausur', factor: 1, active: true },
  { id: 'm', name: 'Mündlich', role: 'al', factor: 2, active: true },
  { id: 't', name: 'Tests', role: 'al', factor: 1, active: true },
];
const g = (c: string, p: number) => ({ categoryId: c, points: p });
const base = [g('k', 9), g('m', 12), g('t', 6)];

describe('Noten-Simulator (AL-System)', () => {
  it('Klausur-Note verändert den Klausur-Bereich', () => {
    const r = simulate(cats, base, 'k', 15, 'renormalize', 2);
    expect(r.before.score).toBeCloseTo(29 / 3); expect(r.partBefore).toBe(9); expect(r.partAfter).toBe(12);
    expect(r.after.score).toBeCloseTo(32 / 3); expect(r.delta).toBeCloseTo(1); expect(r.role).toBe('klausur'); expect(r.factor).toBe(1);
  });
  it('mündliche Note zählt doppelt so viel wie eine Test-Note', () => {
    const m = simulate(cats, base, 'm', 6, 'renormalize', 2); // AL = (24 + 12 + 6) / 5 = 8,4
    const t = simulate(cats, base, 't', 6, 'renormalize', 2); // AL = (24 + 6 + 6) / 4 = 9
    expect(m.partAfter).toBeCloseTo(8.4); expect(t.partAfter).toBeCloseTo(9);
    expect(m.after.score).toBeCloseTo((9 + 2 * 8.4) / 3); expect(m.delta).toBeCloseTo((9 + 16.8) / 3 - 29 / 3);
  });
  it('Bereich ohne Noten wird erst durch die Simulation berücksichtigt', () => {
    const r = simulate(cats, [g('k', 10)], 'm', 4, 'renormalize', 1);
    expect(r.before.score).toBeCloseTo(10); expect(r.before.complete).toBe(false); expect(r.catBefore).toBeNull();
    expect(r.after.score).toBeCloseTo(7); expect(r.delta).toBeCloseTo(-3);
  });
  it('strenger Modus: kein Ergebnis, solange ein Bereich fehlt', () => {
    const r = simulate(cats, [g('k', 10)], 'm', 6, 'strict', 1);
    expect(r.before.score).toBeNull(); expect(r.after.score === null).toBe(false); // nach der Simulation sind Klausur und AL vorhanden
  });
  it('ungültiger Faktor liefert kein Ergebnis', () => {
    const bad = cats.map(c => (c.id === 't' ? { ...c, factor: 0 } : c));
    const r = simulate(bad, base, 'k', 12, 'renormalize', 1);
    expect(r.after.valid).toBe(false); expect(r.after.score).toBeNull(); expect(r.delta).toBeNull();
  });
  it('Grenzwerte 0 und 15', () => {
    const all = [g('k', 10), g('m', 10), g('t', 10)];
    expect(simulate(cats, all, 'k', 0, 'renormalize', 1).after.score).toBeCloseTo(7.5);
    expect(simulate(cats, all, 'k', 15, 'renormalize', 1).after.score).toBeCloseTo(11.25);
  });
  it('Fach ohne Noten: nur die simulierte Note zählt', () => {
    const r = simulate(cats, [], 'k', 12, 'renormalize', 1);
    expect(r.before.score).toBeNull(); expect(r.after.score).toBeCloseTo(12); expect(r.delta).toBeNull();
  });
  it('verändert keine echten Daten', () => {
    const grades = [g('k', 10)]; const c2 = JSON.parse(JSON.stringify(cats));
    simulate(cats, grades, 'k', 3, 'renormalize', 2); requiredValue(cats, grades, 'k', 9, 'renormalize', 'oberstufe', false, 2);
    expect(grades).toEqual([g('k', 10)]); expect(grades).toHaveLength(1); expect(cats).toEqual(c2);
  });
  it('mehrere Szenarien werden korrekt verglichen (monoton steigend)', () => {
    const res = [6, 8, 10, 12, 15].map(v => simulate(cats, base, 'k', v, 'renormalize', 2).after.score as number);
    for (let i = 1; i < res.length; i++) expect(res[i] > res[i - 1]).toBe(true);
  });
  it('Zielrechner: Mindestpunktzahl, Halbpunkte und unerreichbares Ziel', () => {
    expect(requiredValue(cats, base, 'k', 10, 'renormalize', 'oberstufe', false, 2)).toBe(11);
    expect(requiredValue(cats, base, 'k', 9.9, 'renormalize', 'oberstufe', false, 2)).toBe(11);
    expect(requiredValue(cats, base, 'k', 9.9, 'renormalize', 'oberstufe', true, 2)).toBe(10.5);
    expect(requiredValue(cats, base, 'k', 11, 'renormalize', 'oberstufe', false, 2)).toBeNull();
    expect(requiredValue(cats, base, 'k', 0, 'renormalize', 'oberstufe', false, 2)).toBe(0);
  });
  it('Zielrechner Mittelstufe: schlechteste noch ausreichende Note', () => {
    const one: Category[] = [{ id: 's', name: 'Schriftlich', role: 'klausur', factor: 1, active: true }];
    expect(requiredValue(one, [g('s', 2)], 's', 2.5, 'renormalize', 'mittelstufe', false, 1)).toBe(3);
  });
});
