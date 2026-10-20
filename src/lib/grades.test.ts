import { describe, it, expect } from 'vitest';
import { categoryAverage, isValidPoints, isValidValue, normalizeWeights, scalePos, subjectScore, type Category } from './grades';
const cats: Category[] = [
  { id: 'k', name: 'Klausuren', weight: 50, active: true },
  { id: 'm', name: 'Mündlich', weight: 30, active: true },
  { id: 't', name: 'Tests', weight: 20, active: true },
];
describe('grades', () => {
  it('validiert Punkte inkl. Grenzen und halbe Punkte', () => {
    expect(isValidPoints(0)).toBe(true); expect(isValidPoints(15)).toBe(true);
    expect(isValidPoints(15.5)).toBe(false); expect(isValidPoints(7.5)).toBe(false); expect(isValidPoints(7.5, true)).toBe(true);
  });
  it('unterscheidet leere Kategorie von 0 Punkten', () => {
    expect(categoryAverage([], 'k')).toBeNull();
    expect(categoryAverage([{ categoryId: 'k', points: 0 }], 'k')).toBe(0);
  });
  it('berechnet gewichtet (vollstaendig)', () => {
    const r = subjectScore(cats, [{ categoryId: 'k', points: 10 }, { categoryId: 'm', points: 12 }, { categoryId: 't', points: 5 }]);
    expect(r.score).toBeCloseTo(9.6); expect(r.complete).toBe(true);
  });
  it('gewichtet fehlende Kategorien neu und markiert unvollstaendig', () => {
    const r = subjectScore(cats, [{ categoryId: 'k', points: 10 }, { categoryId: 'm', points: 10 }]);
    expect(r.score).toBeCloseTo(10); expect(r.complete).toBe(false);
  });
  it('strict liefert kein Ergebnis bei fehlenden Kategorien', () => {
    expect(subjectScore(cats, [{ categoryId: 'k', points: 10 }], 'strict').score).toBeNull();
  });
  it('lehnt ungueltige Gewichtssumme ab und normalisiert', () => {
    const bad = cats.map(c => ({ ...c, weight: c.weight / 2 }));
    expect(subjectScore(bad, []).valid).toBe(false);
    expect(subjectScore(normalizeWeights(bad), [{ categoryId: 'k', points: 15 }]).score).toBe(15);
  });
});

describe('Skalen', () => {
  it('Mittelstufe erlaubt Noten 1 bis 6', () => {
    expect(isValidValue(1, 'mittelstufe')).toBe(true); expect(isValidValue(6, 'mittelstufe')).toBe(true);
    expect(isValidValue(0, 'mittelstufe')).toBe(false); expect(isValidValue(7, 'mittelstufe')).toBe(false);
    expect(isValidValue(2.5, 'mittelstufe', true)).toBe(true); expect(isValidValue(2.5, 'mittelstufe')).toBe(false);
  });
  it('Oberstufe erlaubt 0 bis 15', () => {
    expect(isValidValue(0, 'oberstufe')).toBe(true); expect(isValidValue(15, 'oberstufe')).toBe(true); expect(isValidValue(16, 'oberstufe')).toBe(false);
  });
  it('Position: bei Noten ist 1 oben', () => {
    expect(scalePos(1, 'mittelstufe')).toBe(1); expect(scalePos(6, 'mittelstufe')).toBe(0); expect(scalePos(15, 'oberstufe')).toBe(1);
  });
});
