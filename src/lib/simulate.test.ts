import { describe, it, expect } from 'vitest';
import { requiredValue, simulate } from './simulate';
import type { Category, Grade } from './grades';

const cats: Category[] = [
  { id: 'k', name: 'Klausuren', weight: 50, active: true },
  { id: 'm', name: 'Mündlich', weight: 30, active: true },
  { id: 't', name: 'Tests', weight: 20, active: true },
];
const g = (c: string, p: number): Grade => ({ categoryId: c, points: p });

describe('Noten-Simulator', () => {
  it('mehrere Kategorien mit unterschiedlichen Gewichten, mehrere Noten in einer Kategorie', () => {
    const r = simulate(cats, [g('k', 10), g('m', 12), g('t', 5)], 'k', 14, 'renormalize');
    expect(r.before.score).toBeCloseTo(9.6); expect(r.catBefore).toBe(10); expect(r.catAfter).toBe(12);
    expect(r.after.score).toBeCloseTo(10.6); expect(r.delta).toBeCloseTo(1.0); expect(r.weight).toBe(50);
  });
  it('Kategorie ohne Noten wird erst durch die Simulation berücksichtigt (neu gewichtet)', () => {
    const r = simulate(cats, [g('k', 10)], 'm', 6, 'renormalize');
    expect(r.before.score).toBeCloseTo(10); expect(r.catBefore).toBeNull(); expect(r.after.score).toBeCloseTo(8.5); expect(r.delta).toBeCloseTo(-1.5);
  });
  it('strenger Modus: kein Ergebnis solange Kategorien unbewertet sind', () => {
    const r = simulate(cats, [g('k', 10)], 'm', 6, 'strict');
    expect(r.after.score).toBeNull(); expect(r.delta).toBeNull();
  });
  it('ungültige Gewichtungssumme liefert kein Ergebnis', () => {
    const bad = cats.map(c => (c.id === 't' ? { ...c, weight: 10 } : c));
    const r = simulate(bad, [g('k', 10)], 'k', 12, 'renormalize');
    expect(r.after.valid).toBe(false); expect(r.after.score).toBeNull();
  });
  it('Grenzwerte 0 und 15', () => {
    const grades = [g('k', 10), g('m', 10), g('t', 10)];
    expect(simulate(cats, grades, 'k', 0, 'renormalize').after.score).toBeCloseTo(7.5);
    expect(simulate(cats, grades, 'k', 15, 'renormalize').after.score).toBeCloseTo(11.25);
  });
  it('Fach ohne Noten: nur die simulierte Note zählt', () => {
    const r = simulate(cats, [], 'k', 12, 'renormalize');
    expect(r.before.score).toBeNull(); expect(r.after.score).toBeCloseTo(12); expect(r.delta).toBeNull();
  });
  it('verändert keine echten Daten', () => {
    const grades = [g('k', 10)]; const c2 = JSON.parse(JSON.stringify(cats));
    simulate(cats, grades, 'k', 3, 'renormalize'); requiredValue(cats, grades, 'k', 9, 'renormalize', 'oberstufe', false);
    expect(grades).toEqual([g('k', 10)]); expect(grades).toHaveLength(1); expect(cats).toEqual(c2);
  });
  it('mehrere Szenarien werden korrekt verglichen (monoton steigend)', () => {
    const grades = [g('k', 10), g('m', 12), g('t', 5)];
    const res = [6, 8, 10, 12, 15].map(v => simulate(cats, grades, 'k', v, 'renormalize').after.score as number);
    for (let i = 1; i < res.length; i++) expect(res[i] > res[i - 1]).toBe(true);
  });
  it('Zielrechner: Mindestpunktzahl, Halbpunkte und unerreichbares Ziel', () => {
    const grades = [g('k', 10), g('m', 12), g('t', 5)];
    expect(requiredValue(cats, grades, 'k', 9.9, 'renormalize', 'oberstufe', false)).toBe(12);
    expect(requiredValue(cats, grades, 'k', 9.9, 'renormalize', 'oberstufe', true)).toBe(11.5);
    expect(requiredValue(cats, grades, 'k', 11, 'renormalize', 'oberstufe', false)).toBeNull();
    expect(requiredValue(cats, grades, 'k', 0, 'renormalize', 'oberstufe', false)).toBe(0);
  });
  it('Zielrechner Mittelstufe: schlechteste noch ausreichende Note', () => {
    const one: Category[] = [{ id: 's', name: 'Schriftlich', weight: 100, active: true }];
    expect(requiredValue(one, [g('s', 2)], 's', 2.5, 'renormalize', 'mittelstufe', false)).toBe(3);
  });
});
