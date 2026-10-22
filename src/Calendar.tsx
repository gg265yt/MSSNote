import { useState } from 'react';
import { supabase } from './supabase';
import type { Evt, Subject, Topic } from './types';
import {
  KINDS, MONTHS, NO_FILTER, PREP_KINDS, PREP_LABEL, PREP_SYMBOL, WEEKDAYS, WEEKDAYS_LONG,
  addDays, applyFilters, byStart, endOf, eventsOn, fmtDE, hm, iso, kindOf, monthGrid, mondayOf, parseISO, timeLabel, type Filters,
} from './lib/calendar';

type Res = PromiseLike<{ error: { message: string } | null }>;
type Draft = {
  id?: string; title: string; kind: string; subject_id: string; start_date: string; end_date: string; all_day: boolean;
  start_time: string; end_time: string; location: string; description: string; prep_status: Evt['prep_status'];
  study_notes: string; remind: boolean; topics: { text: string; done: boolean }[];
};
const blank = (date: string): Draft => ({ title: '', kind: 'klausur', subject_id: '', start_date: date, end_date: '', all_day: true, start_time: '', end_time: '', location: '', description: '', prep_status: 'nicht_begonnen', study_notes: '', remind: false, topics: [] });
const fromEvent = (e: Evt, topics: Topic[]): Draft => ({
  id: e.id, title: e.title, kind: e.kind, subject_id: e.subject_id ?? '', start_date: e.start_date, end_date: e.end_date ?? '', all_day: e.all_day,
  start_time: e.start_time ? hm(e.start_time) : '', end_time: e.end_time ? hm(e.end_time) : '', location: e.location ?? '', description: e.description ?? '',
  prep_status: e.prep_status, study_notes: e.study_notes ?? '', remind: e.remind,
  topics: topics.filter(t => t.event_id === e.id).sort((a, b) => a.sort_order - b.sort_order).map(t => ({ text: t.text, done: t.done })),
});

/** Zeigt lokale Browser-Benachrichtigungen, solange die Seite geöffnet ist und der Nutzer zugestimmt hat. */
export function notifyDue(events: Evt[]) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || localStorage.getItem('mss_notify') !== '1') return;
    const today = iso(new Date());
    const tomorrow = addDays(today, 1);
    events.filter(e => e.remind && (e.start_date === today || e.start_date === tomorrow)).forEach(e => {
      const key = `mss_notified_${e.id}_${today}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
      new Notification(`${e.start_date === today ? 'Heute' : 'Morgen'}: ${e.title}`, { body: `${kindOf(e.kind).label} · ${timeLabel(e)}` });
    });
  } catch { /* Benachrichtigungen nicht verfügbar */ }
}

function NotifyBox() {
  const supported = typeof Notification !== 'undefined';
  const read = () => { try { return localStorage.getItem('mss_notify') === '1'; } catch { return false; } };
  const [on, setOn] = useState(read());
  const [perm, setPerm] = useState<string>(supported ? Notification.permission : 'denied');
  async function enable() {
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === 'granted') { try { localStorage.setItem('mss_notify', '1'); } catch { /* egal */ } setOn(true); }
  }
  const disable = () => { try { localStorage.removeItem('mss_notify'); } catch { /* egal */ } setOn(false); };
  return (
    <details className="card"><summary>Browser-Benachrichtigungen</summary>
      <p className="small">Für Termine mit aktivierter Erinnerung zeigt MSSNote am Tag davor und am Tag selbst eine Benachrichtigung. Das klappt nur, solange MSSNote in einem Browser-Tab geöffnet ist. Bei geschlossener Seite oder im Hintergrund werden keine Benachrichtigungen gesendet, dafür gibt es hier keinen Server.</p>
      {!supported ? <p className="mut small">Dein Browser unterstützt keine Benachrichtigungen.</p>
        : perm === 'denied' ? <p className="mut small">Benachrichtigungen sind im Browser blockiert. Erlaube sie in den Website-Einstellungen, wenn du sie nutzen möchtest.</p>
        : on && perm === 'granted' ? <button onClick={disable}>Benachrichtigungen ausschalten</button>
        : <button onClick={enable}>Benachrichtigungen erlauben</button>}
    </details>
  );
}

const prepText = (e: Evt) => `${PREP_SYMBOL[e.prep_status]} ${PREP_LABEL[e.prep_status]}`;

export function UpcomingCard({ events, subjects, onOpen, onAdd }: { events: Evt[]; subjects: Subject[]; onOpen: (id: string) => void; onAdd: () => void }) {
  const today = iso(new Date());
  const up = events.filter(e => endOf(e) >= today).sort(byStart);
  const klausuren = up.filter(e => e.kind === 'klausur');
  const week = klausuren.filter(e => e.start_date <= addDays(today, 7));
  const open = up.filter(e => PREP_KINDS.includes(e.kind) && e.prep_status !== 'gut_vorbereitet').slice(0, 3);
  const row = (e: Evt) => {
    const s = subjects.find(x => x.id === e.subject_id);
    return <button key={e.id} className="evrow" style={{ borderLeft: `5px solid ${s?.color ?? 'var(--line)'}` }} onClick={() => onOpen(e.id)}>
      <span aria-hidden>{kindOf(e.kind).icon}</span> <b>{e.title}</b>{e.remind && <span aria-label="Erinnerung aktiv"> 🔔</span>}
      <span className="mut small"> · {fmtDE(e.start_date)} {timeLabel(e)}{s ? ' · ' + (s.short_name || s.name) : ''}</span></button>;
  };
  if (!events.length)
    return <div className="card"><h3>Termine</h3><p className="mut">Noch keine Termine eingetragen. Trage Klausuren, Tests und Abgaben ein, dann behältst du den Überblick.</p><button className="pri" onClick={onAdd}>Ersten Termin hinzufügen</button></div>;
  return (
    <div className="card"><div className="row sp"><h3>Termine</h3><button onClick={onAdd}>Termin hinzufügen</button></div>
      <h4>Nächste Termine</h4>{up.length ? up.slice(0, 5).map(row) : <p className="mut small">Keine bevorstehenden Termine.</p>}
      <h4>Nächste Klausur</h4>{klausuren[0] ? row(klausuren[0]) : <p className="mut small">Keine Klausur eingetragen.</p>}
      <h4>Klausuren in den nächsten 7 Tagen</h4>{week.length ? week.map(row) : <p className="mut small">Keine.</p>}
      {open.length > 0 && <><h4>Vorbereitung noch offen</h4>{open.map(row)}</>}
    </div>
  );
}

type Props = { events: Evt[]; topics: Topic[]; subjects: Subject[]; missing: boolean; run: (p: Res) => Promise<void>; setErr: (m: string) => void; initialOpen: string | null; initialNew: boolean; back: () => void };

export default function Calendar({ events, topics, subjects, missing, run, setErr, initialOpen, initialNew, back }: Props) {
  const today = iso(new Date());
  const startDay = events.find(e => e.id === initialOpen)?.start_date ?? today;
  const [view, setView] = useState<'monat' | 'woche' | 'agenda'>('monat');
  const [anchor, setAnchor] = useState(startDay);
  const [sel, setSel] = useState(startDay);
  const [open, setOpen] = useState<string | null>(initialOpen);
  const [draft, setDraft] = useState<Draft | null>(initialNew ? blank(today) : null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [fl, setFl] = useState<Filters>(NO_FILTER);

  const subj = (e: Evt) => subjects.find(s => s.id === e.subject_id);
  const color = (e: Evt) => subj(e)?.color ?? 'var(--line)';
  const up = (p: Partial<Draft>) => setDraft(d => (d ? { ...d, ...p } : d));
  const filtered = applyFilters(events, fl, today);
  const agenda = applyFilters(events, fl.when === 'standard' ? { ...fl, when: 'bevorstehend' } : fl, today).sort(byStart);
  const activeFilters = [fl.subject, fl.kind, fl.from, fl.to, fl.q.trim()].filter(Boolean).length + (fl.when !== 'standard' ? 1 : 0);
  const ev = events.find(e => e.id === open);
  const addOn = (day: string) => { setMsg(''); setSel(day); setDraft(blank(day)); };

  const move = (dir: number) => {
    if (view === 'monat') { const d = parseISO(anchor); d.setDate(1); d.setMonth(d.getMonth() + dir); setAnchor(iso(d)); }
    else setAnchor(addDays(anchor, 7 * dir));
  };
  const am = parseISO(anchor);
  const label = view === 'monat' ? `${MONTHS[am.getMonth()]} ${am.getFullYear()}` : view === 'woche' ? `${fmtDE(mondayOf(anchor))} – ${fmtDE(addDays(mondayOf(anchor), 6))}` : 'Terminliste';

  async function save() {
    if (!draft) return;
    const fail = (m: string) => { setMsg(m); setBusy(false); };
    const title = draft.title.trim();
    if (!title) return setMsg('Bitte einen Titel eingeben.');
    if (!draft.start_date) return setMsg('Bitte ein Datum wählen.');
    if (draft.end_date && draft.end_date < draft.start_date) return setMsg('Das Enddatum darf nicht vor dem Startdatum liegen.');
    if (!draft.all_day && draft.start_time && draft.end_time && (!draft.end_date || draft.end_date === draft.start_date) && draft.end_time <= draft.start_time) return setMsg('Das Ende muss nach dem Beginn liegen.');
    const row = {
      title, kind: draft.kind, subject_id: draft.subject_id || null, start_date: draft.start_date, end_date: draft.end_date || null, all_day: draft.all_day,
      start_time: draft.all_day ? null : draft.start_time || null, end_time: draft.all_day ? null : draft.end_time || null,
      location: draft.location.trim() || null, description: draft.description.trim() || null, prep_status: draft.prep_status, study_notes: draft.study_notes.trim() || null, remind: draft.remind,
    };
    setBusy(true); setMsg('');
    let id = draft.id;
    if (id) { const r = await supabase.from('events').update(row).eq('id', id); if (r.error) return fail(r.error.message); }
    else { const r = await supabase.from('events').insert(row).select().single(); if (r.error || !r.data) return fail(r.error?.message ?? 'Termin konnte nicht gespeichert werden.'); id = r.data.id as string; }
    const del = await supabase.from('event_topics').delete().eq('event_id', id);
    if (del.error) return fail(del.error.message);
    const list = draft.topics.map(t => ({ ...t, text: t.text.trim() })).filter(t => t.text);
    if (list.length) {
      const ins = await supabase.from('event_topics').insert(list.map((t, i) => ({ event_id: id, text: t.text, done: t.done, sort_order: i })));
      if (ins.error) return fail(ins.error.message);
    }
    setBusy(false); setDraft(null); setOpen(id); setSel(draft.start_date); setAnchor(draft.start_date);
    await run(Promise.resolve({ error: null }));
  }

  const row = (e: Evt) => (
    <button key={e.id} className="evrow" style={{ borderLeft: `5px solid ${color(e)}` }} onClick={() => setOpen(e.id)}>
      <span aria-hidden>{kindOf(e.kind).icon}</span> <b>{e.title}</b>
      <span className="mut small"> · {kindOf(e.kind).label}{subj(e) ? ' · ' + (subj(e)!.short_name || subj(e)!.name) : ''} · {fmtDE(e.start_date)}{e.end_date && e.end_date !== e.start_date ? '–' + fmtDE(e.end_date) : ''} {timeLabel(e)}</span>
      {PREP_KINDS.includes(e.kind) && <span className="small"> · {prepText(e)}</span>}{e.remind && <span aria-label="Erinnerung aktiv"> 🔔</span>}
    </button>
  );

  const monthView = () => {
    const cells = monthGrid(am.getFullYear(), am.getMonth());
    return (
      <>
        <div className="cal">
          {WEEKDAYS.map(w => <div key={w} className="mut small" style={{ textAlign: 'center' }}>{w}</div>)}
          {cells.map(day => {
            const evs = eventsOn(filtered, day);
            return (
              <div key={day} className={'cell' + (day.slice(0, 7) === anchor.slice(0, 7) ? '' : ' out') + (day === today ? ' today' : '') + (day === sel ? ' sel' : '')}>
                <button className="dn" aria-label={`${fmtDE(day)}${evs.length ? `, ${evs.length} Termine` : ''}`} onClick={() => setSel(day)} onDoubleClick={() => !missing && addOn(day)}>{Number(day.slice(8))}</button>
                {evs.slice(0, 3).map(e => (
                  <button key={e.id} className="chip" style={{ ['--c' as string]: color(e) }} title={`${e.title} (${kindOf(e.kind).label})`} onClick={() => setOpen(e.id)}>
                    <span aria-hidden>{kindOf(e.kind).icon}</span><span className="t"> {e.title}</span>{PREP_KINDS.includes(e.kind) && <span aria-hidden> {PREP_SYMBOL[e.prep_status]}</span>}
                  </button>))}
                {evs.length > 3 && <button className="chip more" onClick={() => setSel(day)}>+{evs.length - 3} weitere</button>}
              </div>);
          })}
        </div>
        <div className="card" style={{ marginTop: '.8rem' }}>
          <div className="row sp"><h3>{WEEKDAYS_LONG[parseISO(sel).getDay()]}, {fmtDE(sel)}</h3><button disabled={missing} onClick={() => addOn(sel)}>Termin an diesem Tag</button></div>
          {eventsOn(filtered, sel).length ? eventsOn(filtered, sel).map(e => row(e)) : <p className="mut small">Keine Termine an diesem Tag.</p>}
        </div>
      </>
    );
  };
  const weekView = () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i));
    return (
      <div className="weekgrid">{days.map((day, i) => (
        <div key={day} className="card" style={{ margin: 0, outline: day === today ? '2px solid var(--ink)' : undefined }}>
          <b>{WEEKDAYS[i]} {fmtDE(day).slice(0, 5)}</b>{day === today && <span className="mut small"> (heute)</span>}
          {eventsOn(filtered, day).map(e => row(e))}
          <p><button className="small" disabled={missing} onClick={() => addOn(day)}>+ Termin</button></p>
        </div>))}
      </div>
    );
  };
  const agendaView = () => {
    const groups = new Map<string, Evt[]>();
    agenda.forEach(e => groups.set(e.start_date, [...(groups.get(e.start_date) ?? []), e]));
    if (!agenda.length) return <div className="card"><p className="mut">Keine Termine für diese Auswahl.{fl.when === 'standard' ? ' Vergangene Termine findest du über den Filter „Zeitraum“.' : ''}</p></div>;
    return <>{[...groups.entries()].map(([day, list]) => (
      <div key={day} className="card"><h3>{WEEKDAYS_LONG[parseISO(day).getDay()]}, {fmtDE(day)}{day === today ? ' (heute)' : ''}</h3>{list.map(e => row(e))}</div>))}</>;
  };

  return (
    <>
      <p><button onClick={back}>← Zurück</button></p>
      <div className="row sp"><h2>Kalender</h2><button className="pri" disabled={missing} onClick={() => addOn(view === 'agenda' ? today : sel)}>Termin hinzufügen</button></div>
      {missing && <div className="alert" role="alert">Der Kalender braucht eine Datenbank-Erweiterung: Führe die Datei 0004_calendar.sql im Supabase SQL Editor aus.</div>}

      {draft && (
        <form className="card" onSubmit={e => { e.preventDefault(); save(); }}>
          <h3>{draft.id ? 'Termin bearbeiten' : 'Neuer Termin'}</h3>
          <label htmlFor="et">Titel</label><input id="et" required maxLength={120} value={draft.title} onChange={e => up({ title: e.target.value })} />
          <label htmlFor="ek">Terminart</label>
          <select id="ek" value={draft.kind} onChange={e => up({ kind: e.target.value })}>{KINDS.map(k => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}</select>
          <label htmlFor="es">Fach (optional)</label>
          <select id="es" value={draft.subject_id} onChange={e => up({ subject_id: e.target.value })}><option value="">Kein Fach</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.short_name ? `${s.short_name} – ${s.name}` : s.name}</option>)}</select>
          <label htmlFor="ed">Datum</label><input id="ed" type="date" required value={draft.start_date} onChange={e => up({ start_date: e.target.value })} />
          <label><input type="checkbox" style={{ width: 'auto' }} checked={draft.all_day} onChange={e => up({ all_day: e.target.checked })} /> Ganztägig</label>
          {!draft.all_day && <div className="row">
            <div style={{ flex: 1 }}><label htmlFor="eb">Beginn</label><input id="eb" type="time" value={draft.start_time} onChange={e => up({ start_time: e.target.value })} /></div>
            <div style={{ flex: 1 }}><label htmlFor="ee">Ende (optional)</label><input id="ee" type="time" value={draft.end_time} onChange={e => up({ end_time: e.target.value })} /></div></div>}
          <label htmlFor="eed">Enddatum (optional, für mehrtägige Termine)</label><input id="eed" type="date" value={draft.end_date} onChange={e => up({ end_date: e.target.value })} />
          <label htmlFor="el">Ort (optional)</label><input id="el" maxLength={120} value={draft.location} onChange={e => up({ location: e.target.value })} />
          <label htmlFor="eds">Beschreibung (optional)</label><textarea id="eds" rows={3} value={draft.description} onChange={e => up({ description: e.target.value })} />
          {PREP_KINDS.includes(draft.kind) && <>
            <label htmlFor="ep">Lernstatus</label>
            <select id="ep" value={draft.prep_status} onChange={e => up({ prep_status: e.target.value as Evt['prep_status'] })}>{(Object.keys(PREP_LABEL) as Evt['prep_status'][]).map(k => <option key={k} value={k}>{PREP_LABEL[k]}</option>)}</select>
            <label>Zu lernende Themen</label>
            {draft.topics.map((t, i) => (
              <div key={i} className="row" style={{ marginBottom: '.3rem' }}>
                <input type="checkbox" style={{ width: 'auto' }} aria-label="Erledigt" checked={t.done} onChange={e => up({ topics: draft.topics.map((x, k) => (k === i ? { ...x, done: e.target.checked } : x)) })} />
                <input style={{ flex: 1 }} aria-label={`Thema ${i + 1}`} maxLength={200} value={t.text} onChange={e => up({ topics: draft.topics.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} />
                <button type="button" className="d" onClick={() => up({ topics: draft.topics.filter((_, k) => k !== i) })}>Entfernen</button></div>))}
            <p><button type="button" onClick={() => up({ topics: [...draft.topics, { text: '', done: false }] })}>Thema hinzufügen</button></p>
            <label htmlFor="en">Lernnotizen (optional)</label><textarea id="en" rows={3} value={draft.study_notes} onChange={e => up({ study_notes: e.target.value })} />
          </>}
          <label><input type="checkbox" style={{ width: 'auto' }} checked={draft.remind} onChange={e => up({ remind: e.target.checked })} /> Erinnerung aktivieren (Hinweis im Dashboard, optional als Browser-Benachrichtigung)</label>
          {msg && <div className="alert" role="alert">{msg}</div>}
          <p className="row"><button className="pri" disabled={busy}>Speichern</button><button type="button" onClick={() => { setDraft(null); setMsg(''); }}>Abbrechen</button></p>
        </form>)}

      {ev && !draft && (
        <div className="card"><div className="row sp"><h3><span aria-hidden>{kindOf(ev.kind).icon}</span> {ev.title}</h3><button onClick={() => setOpen(null)}>Schließen</button></div>
          <p><b>Art:</b> {kindOf(ev.kind).label}<br /><b>Fach:</b> {subj(ev) ? subj(ev)!.name : 'Kein Fach'}<br />
            <b>Datum:</b> {fmtDE(ev.start_date)}{ev.end_date && ev.end_date !== ev.start_date ? ' bis ' + fmtDE(ev.end_date) : ''}{timeLabel(ev) ? ' · ' + timeLabel(ev) : ''}
            {ev.location && <><br /><b>Ort:</b> {ev.location}</>}{ev.remind && <><br />🔔 Erinnerung aktiv</>}</p>
          {ev.description && <p style={{ whiteSpace: 'pre-wrap' }}><b>Beschreibung:</b> {ev.description}</p>}
          {PREP_KINDS.includes(ev.kind) && (
            <div><label htmlFor="dp">Lernstatus</label>
              <select id="dp" value={ev.prep_status} onChange={e => run(supabase.from('events').update({ prep_status: e.target.value }).eq('id', ev.id))}>{(Object.keys(PREP_LABEL) as Evt['prep_status'][]).map(k => <option key={k} value={k}>{PREP_SYMBOL[k]} {PREP_LABEL[k]}</option>)}</select>
              {topics.filter(t => t.event_id === ev.id).sort((a, b) => a.sort_order - b.sort_order).map(t => (
                <label key={t.id} style={{ fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto' }} checked={t.done} onChange={() => run(supabase.from('event_topics').update({ done: !t.done }).eq('id', t.id))} /> {t.text}</label>))}
              {ev.study_notes && <p style={{ whiteSpace: 'pre-wrap' }}><b>Lernnotizen:</b> {ev.study_notes}</p>}
            </div>)}
          <p className="row">
            <button onClick={() => { setMsg(''); setDraft(fromEvent(ev, topics)); }}>Bearbeiten</button>
            <button onClick={() => { setMsg(''); setDraft({ ...fromEvent(ev, topics), id: undefined, title: ev.title + ' (Kopie)', prep_status: 'nicht_begonnen', topics: fromEvent(ev, topics).topics.map(t => ({ ...t, done: false })) }); }}>Duplizieren</button>
            <button className="d" onClick={() => { if (confirm(`Termin „${ev.title}“ wirklich löschen?`)) { run(supabase.from('events').delete().eq('id', ev.id)); setOpen(null); } }}>Löschen</button></p>
        </div>)}

      <div className="row sp" style={{ marginBottom: '.6rem' }}>
        <span className="row" role="group" aria-label="Ansicht">{(['monat', 'woche', 'agenda'] as const).map(v => <button key={v} className={view === v ? 'pri' : ''} aria-pressed={view === v} onClick={() => setView(v)}>{{ monat: 'Monat', woche: 'Woche', agenda: 'Agenda' }[v]}</button>)}</span>
        {view !== 'agenda' && <span className="row"><button aria-label="Zurück" onClick={() => move(-1)}>◀</button><button onClick={() => { setAnchor(today); setSel(today); }}>Heute</button><button aria-label="Weiter" onClick={() => move(1)}>▶</button></span>}
      </div>
      <h3 aria-live="polite">{label}</h3>

      <details className="card"><summary>Filter und Suche{activeFilters ? ` (${activeFilters} aktiv)` : ''}</summary>
        <div className="row">
          <div style={{ flex: 1, minWidth: '10rem' }}><label htmlFor="fq">Suche</label><input id="fq" placeholder="Titel oder Beschreibung" value={fl.q} onChange={e => setFl({ ...fl, q: e.target.value })} /></div>
          <div style={{ flex: 1, minWidth: '10rem' }}><label htmlFor="fs">Fach</label><select id="fs" value={fl.subject} onChange={e => setFl({ ...fl, subject: e.target.value })}><option value="">Alle Fächer</option><option value="__none">Ohne Fach</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.short_name || s.name}</option>)}</select></div>
          <div style={{ flex: 1, minWidth: '10rem' }}><label htmlFor="fk">Terminart</label><select id="fk" value={fl.kind} onChange={e => setFl({ ...fl, kind: e.target.value })}><option value="">Alle Arten</option>{KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</select></div>
          <div style={{ flex: 1, minWidth: '10rem' }}><label htmlFor="fw">Zeitraum</label><select id="fw" value={fl.when} onChange={e => setFl({ ...fl, when: e.target.value as Filters['when'] })}><option value="standard">Standard (Agenda: bevorstehend)</option><option value="alle">Alle</option><option value="bevorstehend">Bevorstehend</option><option value="vergangen">Vergangen</option></select></div>
          <div style={{ flex: 1, minWidth: '9rem' }}><label htmlFor="ff">Von</label><input id="ff" type="date" value={fl.from} onChange={e => setFl({ ...fl, from: e.target.value })} /></div>
          <div style={{ flex: 1, minWidth: '9rem' }}><label htmlFor="ft">Bis</label><input id="ft" type="date" value={fl.to} onChange={e => setFl({ ...fl, to: e.target.value })} /></div>
        </div>
        <p><button onClick={() => setFl(NO_FILTER)} disabled={!activeFilters}>Filter zurücksetzen</button></p>
      </details>

      {view === 'monat' ? monthView() : view === 'woche' ? weekView() : agendaView()}
      <NotifyBox />
    </>
  );
}
