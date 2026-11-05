import { describe, it, expect } from 'vitest';
import { categoryAverage, isValidPoints, isValidValue, scalePos, subjectScore, type Category } from './grades';

const cats: Category[] = [
  { id: 'k', name: 'Klausuren', role: 'klausur', factor: 1, active: true },
  { id: 'm', name: 'Mündlich', role: 'al', factor: 2, active: true },
  { id: 't', name: 'Tests', role: 'al', factor: 1, active: true },
];
const g = (c: string, p: number) => ({ categoryId: c, points: p });

describe('AL-System', () => {
  it('mündliche Note zählt doppelt so viel wie ein Test', () => {
    const r = subjectScore(cats, [g('m', 12), g('t', 6)]);
    expect(r.al).toBeCloseTo(10); // (12*2 + 6*1) / 3, nicht 9
  });
  it('der Faktor gilt pro Note, nicht pro Kategorie-Durchschnitt', () => {
    const r = subjectScore(cats, [g('m', 12), g('m', 8), g('t', 6)]);
    expect(r.al).toBeCloseTo(9.2); // (24 + 16 + 6) / 5
    expect(r.alSum).toBeCloseTo(46); expect(r.alW).toBe(5);
  });
  it('Klausur 1:1 AL', () => {
    const r = subjectScore(cats, [g('k', 9), g('m', 12), g('t', 6)], 'renormalize', 1);
    expect(r.klausur).toBe(9); expect(r.al).toBeCloseTo(10); expect(r.score).toBeCloseTo(9.5); expect(r.complete).toBe(true);
    expect(r.shares?.klausur).toBeCloseTo(0.5);
  });
  it('Klausur 1:2 AL', () => {
    const r = subjectScore(cats, [g('k', 9), g('m', 12), g('t', 6)], 'renormalize', 2);
    expect(r.score).toBeCloseTo(29 / 3); expect(r.shares?.al).toBeCloseTo(2 / 3);
  });
  it('Bereich ohne Noten: nur der vorhandene Bereich zählt und das Ergebnis ist vorläufig', () => {
    const r = subjectScore(cats, [g('m', 12), g('t', 6)], 'renormalize', 2);
    expect(r.score).toBeCloseTo(10); expect(r.complete).toBe(false); expect(r.klausur).toBeNull();
    expect(r.steps.find(s => s.category === 'Klausuren')?.used).toBe(false);
  });
  it('strenger Modus: kein Ergebnis, solange ein Bereich unbewertet ist', () => {
    const r = subjectScore(cats, [g('m', 12)], 'strict', 1);
    expect(r.score).toBeNull(); expect(r.reason).toContain('Klausur');
  });
  it('Fach ohne Klausur-Kategorie ist vollständig, wenn AL Noten hat', () => {
    const r = subjectScore(cats.filter(c => c.role === 'al'), [g('m', 12), g('t', 6)], 'strict', 2);
    expect(r.score).toBeCloseTo(10); expect(r.complete).toBe(true);
  });
  it('Fach ohne Noten und ohne Kategorien', () => {
    expect(subjectScore(cats, []).score).toBeNull(); expect(subjectScore(cats, []).reason).toBe('Noch keine Noten.');
    expect(subjectScore([], []).reason).toBe('Es gibt keine aktive Kategorie.');
  });
  it('ungültiger Faktor (0 oder negativ) liefert kein Ergebnis', () => {
    const bad = cats.map(c => (c.id === 't' ? { ...c, factor: 0 } : c));
    const r = subjectScore(bad, [g('t', 5)]);
    expect(r.valid).toBe(false); expect(r.score).toBeNull();
  });
  it('inaktive Kategorien zählen nicht', () => {
    const r = subjectScore(cats.map(c => (c.id === 't' ? { ...c, active: false } : c)), [g('m', 12), g('t', 3)]);
    expect(r.al).toBeCloseTo(12);
  });
  it('Grenzwerte 0 und 15', () => {
    expect(subjectScore(cats, [g('k', 0), g('m', 0), g('t', 0)]).score).toBe(0);
    expect(subjectScore(cats, [g('k', 15), g('m', 15), g('t', 15)], 'renormalize', 2).score).toBeCloseTo(15);
  });
  it('0 Punkte sind etwas anderes als keine Note', () => {
    expect(categoryAverage([], 'k')).toBeNull(); expect(categoryAverage([g('k', 0)], 'k')).toBe(0);
    expect(subjectScore(cats, [g('k', 0), g('m', 12)], 'strict').score).toBeCloseTo(6);
  });
});
describe('Skalen', () => {
  it('Punkte', () => { expect(isValidPoints(0)).toBe(true); expect(isValidPoints(15.5)).toBe(false); expect(isValidPoints(7.5, true)).toBe(true); });
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
