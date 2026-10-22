import { describe, it, expect } from 'vitest';
import { NO_FILTER, addDays, applyFilters, eventsOn, fmtDE, iso, mondayOf, monthGrid, parseISO, timeLabel } from './calendar';
import type { Evt } from '../types';

const ev = (o: Partial<Evt>): Evt => ({ id: '1', title: 'T', kind: 'klausur', subject_id: null, start_date: '2026-10-22', start_time: null, end_date: null, end_time: null, all_day: true, description: null, location: null, prep_status: 'nicht_begonnen', study_notes: null, remind: false, ...o });

describe('Kalender-Hilfen', () => {
  it('Woche beginnt am Montag', () => {
    expect(mondayOf('2026-10-22')).toBe('2026-10-19'); expect(mondayOf('2026-10-25')).toBe('2026-10-19'); expect(mondayOf('2026-10-19')).toBe('2026-10-19');
  });
  it('Monatsraster: 42 Tage, beginnt am Montag', () => {
    const g = monthGrid(2026, 9);
    expect(g).toHaveLength(42); expect(g[0]).toBe('2026-09-28'); expect(g).toContain('2026-10-31');
  });
  it('Monats- und Jahreswechsel', () => {
    const g = monthGrid(2026, 11);
    expect(g[0]).toBe('2026-11-30'); expect(g).toContain('2027-01-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01'); expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('Datum bleibt auf dem richtigen Tag (keine Zeitzonenverschiebung)', () => {
    expect(iso(parseISO('2026-03-29'))).toBe('2026-03-29'); expect(iso(parseISO('2026-10-25'))).toBe('2026-10-25'); expect(fmtDE('2026-01-05')).toBe('05.01.2026');
  });
  it('Zeitangaben: ganztägig, mit Ende, nur Beginn, ohne Angabe', () => {
    expect(timeLabel(ev({}))).toBe('ganztägig');
    expect(timeLabel(ev({ all_day: false, start_time: '08:00:00', end_time: '09:30:00' }))).toBe('08:00–09:30');
    expect(timeLabel(ev({ all_day: false, start_time: '14:15:00' }))).toBe('14:15');
    expect(timeLabel(ev({ all_day: false }))).toBe('');
  });
  it('mehrere Termine an einem Tag, sortiert: ganztägig zuerst, dann nach Uhrzeit', () => {
    const list = [ev({ id: 'b', title: 'Spät', all_day: false, start_time: '14:00:00' }), ev({ id: 'a', title: 'Früh', all_day: false, start_time: '08:00:00' }), ev({ id: 'c', title: 'Ganztag' })];
    expect(eventsOn(list, '2026-10-22').map(e => e.id)).toEqual(['c', 'a', 'b']);
  });
  it('mehrtägige Termine erscheinen an allen Tagen', () => {
    const e = ev({ start_date: '2026-12-30', end_date: '2027-01-02' });
    expect(eventsOn([e], '2026-12-31')).toHaveLength(1); expect(eventsOn([e], '2027-01-02')).toHaveLength(1); expect(eventsOn([e], '2027-01-03')).toHaveLength(0);
  });
  it('Filter und Suche, kombinierbar; Termin ohne Fach und ohne optionale Angaben', () => {
    const list = [
      ev({ id: '1', title: 'Mathe Klausur', subject_id: 'm', start_date: '2026-10-30', description: 'Analysis lernen' }),
      ev({ id: '2', title: 'Englisch Test', kind: 'test', subject_id: 'e', start_date: '2026-10-10' }),
      ev({ id: '3', title: 'Schulfest', kind: 'sonstiges', start_date: '2026-11-05' }),
    ];
    const today = '2026-10-22';
    const ids = (f: Partial<typeof NO_FILTER>) => applyFilters(list, { ...NO_FILTER, ...f }, today).map(e => e.id);
    expect(ids({})).toEqual(['1', '2', '3']); expect(ids({ subject: 'm' })).toEqual(['1']); expect(ids({ subject: '__none' })).toEqual(['3']);
    expect(ids({ kind: 'test' })).toEqual(['2']); expect(ids({ when: 'bevorstehend' })).toEqual(['1', '3']); expect(ids({ when: 'vergangen' })).toEqual(['2']);
    expect(ids({ from: '2026-10-15', to: '2026-10-31' })).toEqual(['1']); expect(ids({ q: 'analysis' })).toEqual(['1']); expect(ids({ q: 'schul' })).toEqual(['3']);
    expect(ids({ when: 'bevorstehend', kind: 'klausur', q: 'mathe' })).toEqual(['1']);
  });
});
