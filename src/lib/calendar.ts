import type { Evt } from '../types';

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WEEKDAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']; // Index = Date.getDay()
export const KINDS = [
  { key: 'klausur', label: 'Klausur', icon: '📝' },
  { key: 'test', label: 'Test', icon: '✏️' },
  { key: 'muendlich', label: 'Mündliche Prüfung', icon: '🗣️' },
  { key: 'praesentation', label: 'Präsentation', icon: '📊' },
  { key: 'abgabe', label: 'Hausaufgabe / Abgabe', icon: '📥' },
  { key: 'sonstiges', label: 'Sonstiger Termin', icon: '📌' },
];
export const PREP_KINDS = ['klausur', 'test', 'muendlich'];
export const PREP_LABEL = { nicht_begonnen: 'Nicht begonnen', in_bearbeitung: 'In Bearbeitung', gut_vorbereitet: 'Gut vorbereitet' } as const;
export const PREP_SYMBOL = { nicht_begonnen: '○', in_bearbeitung: '◐', gut_vorbereitet: '●' } as const;
export const kindOf = (k: string) => KINDS.find(x => x.key === k) ?? KINDS[KINDS.length - 1];

const pad = (n: number) => String(n).padStart(2, '0');
/** Lokales Datum als JJJJ-MM-TT (ohne UTC-Umrechnung, damit nichts auf einen anderen Tag rutscht). */
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
export const mondayOf = (s: string) => { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
/** 6 Wochen (42 Tage), Woche beginnt am Montag. */
export const monthGrid = (year: number, month0: number): string[] => {
  const start = mondayOf(iso(new Date(year, month0, 1)));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
};
export const fmtDE = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
export const hm = (t: string) => t.slice(0, 5);
export const endOf = (e: Evt) => e.end_date ?? e.start_date;
export const timeLabel = (e: Evt) =>
  e.all_day ? 'ganztägig' : e.start_time ? hm(e.start_time) + (e.end_time ? '–' + hm(e.end_time) : '') : '';

export const byStart = (a: Evt, b: Evt) =>
  a.start_date.localeCompare(b.start_date) || Number(b.all_day) - Number(a.all_day) || (a.start_time ?? '').localeCompare(b.start_time ?? '') || a.title.localeCompare(b.title);
export const eventsOn = (events: Evt[], day: string) => events.filter(e => e.start_date <= day && day <= endOf(e)).sort(byStart);

export type Filters = { subject: string; kind: string; when: 'standard' | 'alle' | 'bevorstehend' | 'vergangen'; from: string; to: string; q: string };
export const NO_FILTER: Filters = { subject: '', kind: '', when: 'standard', from: '', to: '', q: '' };
export function applyFilters(events: Evt[], f: Filters, today: string): Evt[] {
  const q = f.q.trim().toLowerCase();
  return events.filter(e => {
    if (f.subject === '__none') { if (e.subject_id) return false; } else if (f.subject && e.subject_id !== f.subject) return false;
    if (f.kind && e.kind !== f.kind) return false;
    if (f.when === 'bevorstehend' && endOf(e) < today) return false;
    if (f.when === 'vergangen' && endOf(e) >= today) return false;
    if (f.from && endOf(e) < f.from) return false;
    if (f.to && e.start_date > f.to) return false;
    if (q && !(e.title.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q))) return false;
    return true;
  });
}
