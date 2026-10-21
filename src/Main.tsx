import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { de } from './Auth';
import { SCALE, isValidValue, normalizeWeights, scalePos, subjectScore, type Level, type MissingMode } from './lib/grades';
import type { Cat, Grade, Period, Profile, Semester, Slot, Subject } from './types';

const f = (n: number | null) => (n == null ? '–' : n.toLocaleString('de-DE', { maximumFractionDigits: 2 }));
const DEFAULT_WEIGHTS = [{ name: 'Klausuren', weight: 50 }, { name: 'Mündliche Mitarbeit', weight: 30 }, { name: 'Tests', weight: 20 }];
type Data = { sems: Semester[]; subjects: Subject[]; cats: Cat[]; grades: Grade[]; periods: Period[]; slots: Slot[]; ttMissing: boolean };
type SubjectValues = { name: string; short_name: string; kind: 'grundfach' | 'leistungsfach'; color: string; semester: string };
const lv = (s: Subject): Level => s.level ?? 'oberstufe';
const semOf = (sems: Semester[], s: Subject) => sems.find(x => x.id === s.semester_id)?.label;
type Res = PromiseLike<{ error: { message: string } | null }>;

const scoreOf = (cats: Cat[], grades: Grade[], mode: MissingMode) =>
  subjectScore(cats.map(c => ({ id: c.id, name: c.name, weight: c.weight, active: c.active })), grades.map(g => ({ categoryId: g.category_id, points: g.points })), mode);

export default function Main({ user }: { user: User }) {
  const [d0, setD0] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const synced = useRef(false);
  const [creating, setCreating] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [prof, setProf] = useState<Profile>({ display_name: null, half_points: false, theme: 'system', missing_category_mode: 'renormalize', school_level: 'oberstufe', default_weights: DEFAULT_WEIGHTS });
  const [view, setView] = useState<'home' | 'settings' | 'timetable'>('home');
  const lvl = prof.school_level;
  const mode = prof.missing_category_mode;
  const d = d0 ? { ...d0, subjects: d0.subjects.filter(x => lv(x) === lvl) } : null;
  useEffect(() => {
    if (prof.theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = prof.theme;
  }, [prof.theme]);

  const reload = useCallback(async () => {
    const [s, c, g, pr, se, pe, sl] = await Promise.all([
      supabase.from('subjects').select('*').order('sort_order').order('created_at'),
      supabase.from('categories').select('*').order('created_at'),
      supabase.from('grades').select('*').order('graded_on', { ascending: false }),
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('semesters').select('*').order('sort_order'),
      supabase.from('periods').select('*').order('nr'),
      supabase.from('timetable_entries').select('*'),
    ]);
    const e = s.error || c.error || g.error || se.error;
    if (e) { setErr('Daten konnten nicht geladen werden: ' + e.message + ' (Wurde die SQL-Datei ausgeführt?)'); return; }
    setErr('');
    if (pr.data) setProf({ display_name: pr.data.display_name ?? null, half_points: !!pr.data.half_points, theme: pr.data.theme, missing_category_mode: pr.data.missing_category_mode, school_level: pr.data.school_level === 'mittelstufe' ? 'mittelstufe' : 'oberstufe', default_weights: Array.isArray(pr.data.default_weights) ? pr.data.default_weights : DEFAULT_WEIGHTS });
    // Benutzername aus der Registrierung einmalig ins Profil übernehmen
    const meta = String(user.user_metadata?.display_name ?? '').trim();
    if (!synced.current && !pr.data?.display_name && meta) {
      synced.current = true;
      await supabase.from('profiles').upsert({ id: user.id, display_name: meta });
      setProf(p => ({ ...p, display_name: meta }));
    }
    synced.current = true;
    setD0({ periods: pe.error ? [] : (pe.data as Period[]), slots: sl.error ? [] : (sl.data as Slot[]), ttMissing: !!(pe.error || sl.error), sems: se.data as Semester[], subjects: s.data as Subject[], cats: (c.data as Cat[]).map(x => ({ ...x, weight: Number(x.weight) })), grades: (g.data as Grade[]).map(x => ({ ...x, points: Number(x.points) })) });
  }, [user.id]);
  useEffect(() => { reload(); }, [reload]);
  const savePref = (patch: Partial<Profile>) => { setProf({ ...prof, ...patch }); run(supabase.from('profiles').upsert({ id: user.id, ...patch })); };
  const run = async (p: Res) => { const { error } = await p; await reload(); if (error) setErr(error.message); };

  async function saveSubject(v: SubjectValues, id?: string): Promise<string | null> {
    if (!d) return null;
    let semester_id: string | null = null;
    const label = v.semester.trim();
    if (label) {
      const ex = d.sems.find(x => x.label.toLowerCase() === label.toLowerCase());
      if (ex) semester_id = ex.id;
      else {
        const r = await supabase.from('semesters').insert({ label, sort_order: d.sems.length }).select().single();
        if (r.error || !r.data) return r.error?.message ?? 'Halbjahr konnte nicht angelegt werden.';
        semester_id = r.data.id;
      }
    }
    const row = { name: v.name.trim(), short_name: v.short_name.trim() || null, kind: v.kind, color: v.color, semester_id };
    if (id) { await run(supabase.from('subjects').update(row).eq('id', id)); return null; }
    const { data, error } = await supabase.from('subjects').insert({ ...row, level: lvl, sort_order: d.subjects.length }).select().single();
    if (error || !data) return error?.message ?? 'Fach konnte nicht angelegt werden.';
    if (!prof.default_weights.length) { await run(Promise.resolve({ error: null })); return null; }
    await run(supabase.from('categories').insert(prof.default_weights.map(w => ({ subject_id: data.id, name: w.name, weight: w.weight }))));
    return null;
  }
  async function move(i: number, dir: number) {
    if (!d || i + dir < 0 || i + dir >= d.subjects.length) return;
    const order = [...d.subjects];
    [order[i], order[i + dir]] = [order[i + dir], order[i]];
    const rs = await Promise.all(order.map((s, k) => supabase.from('subjects').update({ sort_order: k }).eq('id', s.id)));
    await run(Promise.resolve({ error: rs.find(x => x.error)?.error ?? null }));
  }

  const header = (
    <div className="row sp"><h1>MSS Grade Tracker</h1>
      <span className="row"><span className="mut">{prof.display_name || user.email}</span><button onClick={() => { setSel(null); setView('timetable'); }}>Stundenplan</button><button onClick={() => { setSel(null); setView('settings'); }}>Einstellungen</button><button onClick={() => supabase.auth.signOut()}>Abmelden</button></span></div>
  );
  if (!d) return <main>{header}{err ? <div className="alert" role="alert">{err}</div> : <p>Lädt …</p>}</main>;
  const subject = d.subjects.find(s => s.id === sel);
  if (subject)
    return <main>{header}{err && <div className="alert" role="alert">{err}</div>}
      <SubjectView s={subject} cats={d.cats.filter(c => c.subject_id === subject.id)} grades={d.grades.filter(g => g.subject_id === subject.id)} run={run} setErr={setErr} back={() => setSel(null)} half={prof.half_points} mode={prof.missing_category_mode} sems={d.sems} save={saveSubject} /></main>;

  if (view === 'timetable') return <main>{header}{err && <div className="alert" role="alert">{err}</div>}<Timetable d={d} subjects={(d0 as Data).subjects} run={run} setErr={setErr} back={() => setView('home')} /></main>;
  if (view === 'settings') return <main>{header}{err && <div className="alert" role="alert">{err}</div>}<Settings email={user.email ?? ''} prof={prof} save={savePref} all={d0 as Data} back={() => setView('home')} /></main>;
  const results = d.subjects.map(s => ({ s, r: scoreOf(d.cats.filter(c => c.subject_id === s.id), d.grades.filter(g => g.subject_id === s.id), prof.missing_category_mode) }));
  const ok = results.filter(x => x.r.score !== null);
  const avg = ok.length ? ok.reduce((a, x) => a + (x.r.score as number), 0) / ok.length : null;
  return (
    <main>{header}{err && <div className="alert" role="alert">{err}</div>}
      <div className="card">
        <div className="big">{f(avg)} <span className="mut" style={{ fontSize: '1rem' }}>Ø {SCALE[lvl].unit}</span></div>
        <p className="mut">{lvl === 'oberstufe' ? 'Oberstufe (Punkte)' : 'Mittelstufe (Noten)'}. Aus {ok.length} von {d.subjects.length} Fächern. {avg != null && lvl === 'oberstufe' && <>Näherung Note: {f((17 - avg) / 3)} (keine offizielle Abiturprognose).</>}</p>
      </div>
      {creating
        ? <SubjectForm init={null} sems={d.sems} onSave={v => saveSubject(v)} onCancel={() => setCreating(false)} />
        : <div className="row sp" style={{ marginBottom: '1rem' }}><h2 style={{ margin: 0 }}>Fächer</h2>
          <span className="row">{d.subjects.length > 1 && <button onClick={() => setSorting(!sorting)}>{sorting ? 'Fertig' : 'Reihenfolge ändern'}</button>}
            <button className="pri" onClick={() => setCreating(true)}>Fach anlegen</button></span></div>}
      {!d.subjects.length && <div className="card"><p>Noch keine Fächer. Lege oben dein erstes Fach an.</p></div>}
      {sorting ? <div className="card">{d.subjects.map((s, i) => (
        <div key={s.id} className="row sp" style={{ borderLeft: `6px solid ${s.color}`, padding: '.3rem .6rem' }}>
          <span><b>{s.short_name || s.name}</b>{s.short_name && <span className="mut small"> {s.name}</span>}</span>
          <span className="row"><button aria-label={`${s.name} nach oben`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button aria-label={`${s.name} nach unten`} disabled={i === d.subjects.length - 1} onClick={() => move(i, 1)}>↓</button></span></div>))}</div>
      : <div className="grid">{results.map(({ s, r }) => (
        <button key={s.id} className="card tile" style={{ borderLeft: `6px solid ${s.color}` }} onClick={() => setSel(s.id)}>
          <b style={{ fontSize: s.short_name ? '1.3rem' : '1.05rem' }}>{s.short_name || s.name}</b>
          {s.short_name && <div className="mut small">{s.name}</div>}
          <div className="mut small">{s.kind === 'leistungsfach' ? 'Leistungsfach' : 'Grundfach'}{semOf(d.sems, s) ? ' · ' + semOf(d.sems, s) : ''}</div>
          <div className="big">{f(r.score)}</div>
          {r.reason && <span className="mut">{r.reason}</span>}{r.score != null && !r.complete && <span className="mut">vorläufig</span>}
        </button>))}</div>}
      <div className="card" style={{ marginTop: '1rem' }}><h3>Verlauf des Gesamtschnitts</h3><Chart level={lvl} series={[{ label: 'Gesamt', color: 'var(--ink)', pts: history(d, mode) }]} /></div>
      <div className="card"><h3>Verlauf der einzelnen Fächer</h3><Chart legend level={lvl} series={d.subjects.map(x => ({ label: x.short_name || x.name, color: x.color, pts: subjHistory(d.cats.filter(c => c.subject_id === x.id), d.grades.filter(g => g.subject_id === x.id), mode) }))} /></div>
    </main>
  );
}

type Form = { id?: string; title: string; category_id: string; points: string; graded_on: string; note: string };
function SubjectView({ s, cats, grades, run, setErr, back, half, mode, sems, save }: { s: Subject; cats: Cat[]; grades: Grade[]; run: (p: Res) => Promise<void>; setErr: (m: string) => void; back: () => void; half: boolean; mode: MissingMode; sems: Semester[]; save: (v: SubjectValues, id?: string) => Promise<string | null> }) {
  const r = scoreOf(cats, grades, mode);
  const lvl: Level = s.level ?? 'oberstufe';
  const sc = SCALE[lvl];
  const hist = subjHistory(cats, grades, mode);
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState(false);
  const [moveFor, setMoveFor] = useState<Cat | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [newCat, setNewCat] = useState('');
  const cn = (id: string) => cats.find(c => c.id === id)?.name ?? '?';
  const upd = (id: string, patch: Partial<Cat>) => run(supabase.from('categories').update(patch).eq('id', id));

  function saveGrade(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const p = Number(form.points.replace(',', '.'));
    if (!form.title.trim()) return setErr('Bitte eine Bezeichnung eingeben.');
    if (!form.category_id) return setErr('Bitte eine Kategorie wählen.');
    if (form.points === '' || !isValidValue(p, lvl, half)) return setErr(`Der Wert muss zwischen ${sc.min} und ${sc.max} liegen (${half ? 'in Schritten von 0,5' : 'ganze Zahl; Zwischenwerte aktivierst du in den Einstellungen'}).`);
    const row = { subject_id: s.id, category_id: form.category_id, title: form.title.trim(), points: p, graded_on: form.graded_on, note: form.note.trim() || null };
    setErr(''); setForm(null);
    run(form.id ? supabase.from('grades').update(row).eq('id', form.id) : supabase.from('grades').insert(row));
  }
  function removeCat(c: Cat) {
    if (!grades.some(g => g.category_id === c.id)) { if (confirm(`Kategorie „${c.name}“ entfernen?`)) run(supabase.from('categories').delete().eq('id', c.id)); return; }
    const rest = cats.filter(x => x.id !== c.id);
    if (!rest.length) return setErr('Lege zuerst eine weitere Kategorie an, in die die Noten verschoben werden können.');
    setMoveFor(c); setMoveTo(rest[0].id);
  }
  async function confirmMove() {
    if (!moveFor) return;
    const m = await supabase.from('grades').update({ category_id: moveTo }).eq('category_id', moveFor.id);
    if (m.error) return setErr(m.error.message);
    setMoveFor(null);
    run(supabase.from('categories').delete().eq('id', moveFor.id));
  }
  const normalize = () => {
    const n = normalizeWeights(cats.map(c => ({ id: c.id, name: c.name, weight: c.weight, active: c.active })));
    const ws = n.map(c => (c.active ? Math.round(c.weight * 100) / 100 : c.weight));
    const first = n.findIndex(c => c.active);
    if (first >= 0) ws[first] = Math.round((ws[first] + 100 - n.reduce((a, c, i) => a + (c.active ? ws[i] : 0), 0)) * 100) / 100;
    Promise.all(n.map((c, i) => supabase.from('categories').update({ weight: ws[i] }).eq('id', c.id))).then(() => run(Promise.resolve({ error: null })));
  };

  return (
    <>
      <p><button onClick={back}>← Fächer</button></p>
      <div className="row sp" style={{ borderLeft: `6px solid ${s.color}`, paddingLeft: '.7rem' }}>
        <div><h2 style={{ margin: 0 }}>{s.short_name || s.name}</h2>{s.short_name && <div className="mut">{s.name}</div>}
          <div className="mut small">{s.kind === 'leistungsfach' ? 'Leistungsfach' : 'Grundfach'}{semOf(sems, s) ? ' · Halbjahr ' + semOf(sems, s) : ''}</div></div>
        <span className="row">
          <button onClick={() => setEditing(!editing)}>Bearbeiten</button>
          <button className="d" onClick={() => { if (confirm(`Fach „${s.name}“ und alle Noten löschen?`)) { run(supabase.from('subjects').delete().eq('id', s.id)); back(); } }}>Löschen</button></span></div>
      {editing && <SubjectForm init={s} sems={sems} onSave={v => save(v, s.id)} onCancel={() => setEditing(false)} />}
      <div className="card"><div className="big">{f(r.score)} <span className="mut" style={{ fontSize: '1rem' }}>{sc.unit}</span></div>
        {r.reason && <div className="alert">{r.reason}</div>}
        {r.score != null && !r.complete && <div className="alert">Vorläufig: Kategorien ohne Noten bleiben unberücksichtigt, die übrigen werden neu gewichtet.</div>}
        <details><summary>Rechenweg</summary><div className="tw"><table><thead><tr><th>Kategorie</th><th>Noten</th><th>Ø</th><th>Gewicht</th><th>Zählt</th></tr></thead><tbody>
          {r.steps.map(x => <tr key={x.category}><td>{x.category}</td><td>{x.count}</td><td>{f(x.average)}</td><td>{f(x.weight)} %</td><td>{x.used ? 'ja' : 'nein'}</td></tr>)}</tbody></table></div>
          <p className="mut">Fachpunktzahl = Σ (Ø × Gewicht) ÷ Σ berücksichtigte Gewichte.</p></details></div>

      <div className="card"><h3>Verlauf in diesem Fach</h3><Chart level={lvl} series={[{ label: s.short_name || s.name, color: s.color, pts: hist }]} /></div>
      <div className="card"><div className="row sp"><h3>Noten</h3>
        <button className="pri" onClick={() => setForm({ title: '', category_id: cats[0]?.id ?? '', points: '', graded_on: new Date().toISOString().slice(0, 10), note: '' })}>Note eintragen</button></div>
        {form && <form onSubmit={saveGrade} className="card">
          <label htmlFor="gt">Bezeichnung</label><input id="gt" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <label htmlFor="gc">Kategorie</label><select id="gc" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label htmlFor="gp">{sc.label}</label><input id="gp" type="number" min={sc.min} max={sc.max} step={half ? 0.5 : 1} value={form.points} onChange={e => setForm({ ...form, points: e.target.value })} />
          <label htmlFor="gd">Datum</label><input id="gd" type="date" required value={form.graded_on} onChange={e => setForm({ ...form, graded_on: e.target.value })} />
          <label htmlFor="gn">Bemerkung (optional)</label><input id="gn" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
          <p className="row"><button className="pri">Speichern</button><button type="button" onClick={() => setForm(null)}>Abbrechen</button></p></form>}
        {grades.length ? <div className="tw"><table><thead><tr><th>Datum</th><th>Bezeichnung</th><th>Kategorie</th><th>{sc.unit}</th><th></th></tr></thead><tbody>{grades.map(g => (
          <tr key={g.id}><td>{new Date(g.graded_on + 'T00:00:00').toLocaleDateString('de-DE')}</td><td>{g.title}{g.note && <div className="mut">{g.note}</div>}</td><td>{cn(g.category_id)}</td><td>{f(g.points)}</td>
            <td className="row"><button onClick={() => setForm({ id: g.id, title: g.title, category_id: g.category_id, points: String(g.points), graded_on: g.graded_on, note: g.note ?? '' })}>Ändern</button>
              <button className="d" onClick={() => confirm('Note löschen?') && run(supabase.from('grades').delete().eq('id', g.id))}>Löschen</button></td></tr>))}</tbody></table></div> : <p className="mut">Noch keine Noten.</p>}</div>
      <div className="card"><div className="row sp"><h3>Kategorien und Gewichtung</h3><button onClick={normalize}>Auf 100 % normalisieren</button></div>
        <div className={r.valid ? 'ok' : 'alert'} role="status">Summe: {f(r.weightSum)} % {r.valid ? '' : '– muss 100 % ergeben, sonst gibt es kein Ergebnis.'}</div>
        <div className="tw"><table><thead><tr><th>Name</th><th>Gewicht %</th><th>Aktiv</th><th></th></tr></thead><tbody>{cats.map(c => (
          <tr key={c.id + c.name + c.weight}>
            <td><input aria-label="Kategoriename" defaultValue={c.name} onBlur={e => e.target.value.trim() && e.target.value !== c.name && upd(c.id, { name: e.target.value.trim() })} /></td>
            <td><input aria-label="Gewicht in Prozent" type="number" min={0} max={100} step={0.5} defaultValue={c.weight} onBlur={e => { const v = Math.min(100, Math.max(0, Number(e.target.value) || 0)); if (v !== c.weight) upd(c.id, { weight: v }); }} /></td>
            <td><input type="checkbox" aria-label="Aktiv" style={{ width: 'auto' }} checked={c.active} onChange={e => upd(c.id, { active: e.target.checked })} /></td>
            <td><button className="d" onClick={() => removeCat(c)}>Entfernen</button></td></tr>))}</tbody></table></div>
        {moveFor && <div className="alert">„{moveFor.name}“ enthält Noten. Verschieben nach:{' '}
          <select style={{ width: 'auto' }} value={moveTo} onChange={e => setMoveTo(e.target.value)}>{cats.filter(c => c.id !== moveFor.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{' '}
          <button className="pri" onClick={confirmMove}>Verschieben und entfernen</button> <button onClick={() => setMoveFor(null)}>Abbrechen</button></div>}
        <form className="row" style={{ marginTop: '.6rem' }} onSubmit={e => { e.preventDefault(); const n = newCat.trim(); if (!n) return; if (cats.some(c => c.name.toLowerCase() === n.toLowerCase())) return setErr('Diese Kategorie gibt es schon.'); setNewCat(''); run(supabase.from('categories').insert({ subject_id: s.id, name: n, weight: 0 })); }}>
          <input style={{ flex: 1 }} aria-label="Neue Kategorie" placeholder="Neue Kategorie" value={newCat} onChange={e => setNewCat(e.target.value)} /><button>Hinzufügen</button></form></div>

    </>
  );
}

function history(d: Data, mode: MissingMode) {
  const days = [...new Set(d.grades.map(g => g.graded_on))].sort();
  return days.map(day => {
    const v = d.subjects.map(s => scoreOf(d.cats.filter(c => c.subject_id === s.id), d.grades.filter(g => g.subject_id === s.id && g.graded_on <= day), mode).score).filter((x): x is number => x !== null);
    return v.length ? { d: day, v: v.reduce((a, b) => a + b, 0) / v.length } : null;
  }).filter((x): x is { d: string; v: number } => x !== null);
}
const fdate = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('de-DE');
type Pt = { d: string; v: number };
type Series = { label: string; color: string; pts: Pt[] };
function subjHistory(cats: Cat[], grades: Grade[], mode: MissingMode): Pt[] {
  const days = [...new Set(grades.map(g => g.graded_on))].sort();
  return days.map(day => ({ d: day, v: scoreOf(cats, grades.filter(g => g.graded_on <= day), mode).score })).filter((x): x is Pt => x.v !== null);
}
function Chart({ series, level, legend }: { series: Series[]; level: Level; legend?: boolean }) {
  const days = [...new Set(series.flatMap(s => s.pts.map(p => p.d)))].sort();
  if (!days.length) return <p className="mut">Der Verlauf erscheint, sobald Noten mit Datum vorliegen.</p>;
  const W = 600, H = 190, L = 28, sc = SCALE[level];
  const x = (day: string) => (days.length > 1 ? L + (days.indexOf(day) * (W - L - 10)) / (days.length - 1) : (W + L) / 2);
  const y = (v: number) => H - 24 - scalePos(v, level) * (H - 40);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Verlauf über die Zeit">
        {sc.ticks.map(v => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={2} y={y(v) + 4} fontSize="11" fill="var(--mut)">{v}</text></g>)}
        {series.map((s, k) => s.pts.length > 0 && (
          <g key={k}>
            <polyline fill="none" stroke={s.color} strokeWidth="2" points={s.pts.map(p => `${x(p.d)},${y(p.v)}`).join(' ')} />
            {s.pts.map(p => <circle key={p.d} cx={x(p.d)} cy={y(p.v)} r="3.5" fill={s.color}><title>{s.label}, {fdate(p.d)}: {f(p.v)} {sc.unit}</title></circle>)}
          </g>))}
        <text x={L} y={H - 4} fontSize="11" fill="var(--mut)">{fdate(days[0])}</text>
        <text x={W - 10} y={H - 4} fontSize="11" fill="var(--mut)" textAnchor="end">{fdate(days[days.length - 1])}</text>
      </svg>
      {legend && <div className="row small">{series.filter(s => s.pts.length).map((s, k) => <span key={k}><span style={{ display: 'inline-block', width: 10, height: 10, background: s.color, borderRadius: 2, marginRight: 4 }} />{s.label}</span>)}</div>}
    </>
  );
}
function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function Settings({ email, prof, save, all, back }: { email: string; prof: Profile; save: (p: Partial<Profile>) => void; all: Data; back: () => void }) {
  const [dw, setDw] = useState(prof.default_weights);
  const [dwMsg, setDwMsg] = useState('');
  const [uname, setUname] = useState(prof.display_name ?? '');
  const [unameMsg, setUnameMsg] = useState('');
  async function saveName() {
    const v = uname.trim();
    if (v.length > 40) return setUnameMsg('Der Benutzername darf höchstens 40 Zeichen haben.');
    save({ display_name: v || null });
    await supabase.auth.updateUser({ data: { display_name: v } });
    setUnameMsg(v ? 'Benutzername gespeichert.' : 'Benutzername entfernt, es wird wieder deine E-Mail angezeigt.');
  }
  const sum = Math.round(dw.reduce((a, w) => a + (Number(w.weight) || 0), 0) * 100) / 100;
  const noten = prof.school_level === 'mittelstufe';
  const csv = () => {
    const q = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = all.grades.map(g => [all.subjects.find(s => s.id === g.subject_id)?.name, all.cats.find(c => c.id === g.category_id)?.name, g.title, g.points, g.graded_on, g.note].map(q).join(';'));
    return '\uFEFF' + ['Fach;Kategorie;Bezeichnung;Wert;Datum;Bemerkung', ...rows].join('\n');
  };
  function saveWeights() {
    const names = dw.map(w => w.name.trim());
    if (names.some(n => !n)) return setDwMsg('Jede Kategorie braucht einen Namen.');
    if (new Set(names.map(n => n.toLowerCase())).size !== names.length) return setDwMsg('Kategorienamen dürfen nicht doppelt vorkommen.');
    save({ default_weights: dw.map((w, i) => ({ name: names[i], weight: Math.min(100, Math.max(0, Number(w.weight) || 0)) })) });
    setDwMsg(sum === 100 ? 'Gespeichert.' : 'Gespeichert. Die Summe ist nicht 100 %, neue Fächer zeigen deshalb eine Warnung.');
  }
  return (
    <>
      <p><button onClick={back}>← Zurück</button></p>
      <h2>Einstellungen</h2>
      <div className="card"><h3>Profil</h3>
        <label htmlFor="un">Benutzername</label>
        <input id="un" maxLength={40} value={uname} placeholder={email} onChange={e => setUname(e.target.value)} />
        <p className="mut small">Wird oben statt deiner E-Mail angezeigt. Zum Anmelden brauchst du weiterhin die E-Mail-Adresse.</p>
        {unameMsg && <p className="small" role="status">{unameMsg}</p>}
        <p><button className="pri" onClick={saveName}>Benutzernamen speichern</button></p></div>
      <PasswordForm email={email} />
      <div className="card">
        <label htmlFor="lv">Schulstufe</label>
        <select id="lv" value={prof.school_level} onChange={e => save({ school_level: e.target.value as Level })}>
          <option value="oberstufe">Oberstufe (MSS, Punkte 0 bis 15)</option><option value="mittelstufe">Mittelstufe (Noten 1 bis 6)</option></select>
        <p className="mut small">Du siehst nur die Fächer der gewählten Stufe. Die der anderen Stufe bleiben gespeichert. Neue Fächer gehören zur gewählten Stufe.</p>
        <label htmlFor="th">Farbschema</label>
        <select id="th" value={prof.theme} onChange={e => save({ theme: e.target.value as Profile['theme'] })}>
          <option value="system">Wie Gerät</option><option value="light">Hell</option><option value="dark">Dunkel</option></select>
        <label><input type="checkbox" style={{ width: 'auto' }} checked={prof.half_points} onChange={e => save({ half_points: e.target.checked })} /> {noten ? 'Halbe Noten erlauben' : 'Halbe Punkte erlauben'}</label>
        <label htmlFor="mm">Kategorien ohne Noten</label>
        <select id="mm" value={prof.missing_category_mode} onChange={e => save({ missing_category_mode: e.target.value as Profile['missing_category_mode'] })}>
          <option value="renormalize">Ignorieren und übrige neu gewichten (vorläufig)</option>
          <option value="strict">Streng: kein Ergebnis, bis alle Kategorien bewertet sind</option></select>
      </div>
      <div className="card"><h3>Standard-Gewichtung für neue Fächer</h3>
        <p className="mut small">Diese Kategorien werden beim Anlegen eines Fachs automatisch erstellt. Bestehende Fächer ändern sich nicht.</p>
        <div className="tw"><table><thead><tr><th>Kategorie</th><th>Gewicht %</th><th></th></tr></thead><tbody>{dw.map((w, i) => (
          <tr key={i}>
            <td><input aria-label="Kategoriename" value={w.name} onChange={e => setDw(dw.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} /></td>
            <td><input aria-label="Gewicht in Prozent" type="number" min={0} max={100} step={0.5} value={w.weight} onChange={e => setDw(dw.map((x, k) => (k === i ? { ...x, weight: Number(e.target.value) } : x)))} /></td>
            <td><button className="d" onClick={() => setDw(dw.filter((_, k) => k !== i))}>Entfernen</button></td></tr>))}</tbody></table></div>
        <div className={sum === 100 ? 'ok' : 'alert'} role="status">Summe: {sum} %</div>
        {dwMsg && <p className="mut small" role="status">{dwMsg}</p>}
        <p className="row"><button onClick={() => setDw([...dw, { name: '', weight: 0 }])}>Kategorie hinzufügen</button><button className="pri" onClick={saveWeights}>Speichern</button></p></div>
      <div className="card"><h3>Daten exportieren</h3>
        <div className="row"><button onClick={() => download('mss-noten.json', JSON.stringify(all, null, 1), 'application/json')}>JSON</button>
          <button onClick={() => download('mss-noten.csv', csv(), 'text/csv')}>CSV</button></div></div>
    </>
  );
}

function SubjectForm({ init, sems, onSave, onCancel }: { init: Subject | null; sems: Semester[]; onSave: (v: SubjectValues) => Promise<string | null>; onCancel: () => void }) {
  const [v, setV] = useState<SubjectValues>({ name: init?.name ?? '', short_name: init?.short_name ?? '', kind: init?.kind ?? 'grundfach', color: init?.color ?? '#3b6fd4', semester: init ? semOf(sems, init) ?? '' : '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) return setMsg('Bitte einen Fachnamen eingeben.');
    setBusy(true);
    const r = await onSave(v);
    setBusy(false);
    if (r) setMsg(r); else onCancel();
  }
  return (
    <form className="card" onSubmit={submit}>
      <h3>{init ? 'Fach bearbeiten' : 'Neues Fach'}</h3>
      <label htmlFor="sn">Fachname</label>
      <input id="sn" required maxLength={80} value={v.name} onChange={e => setV({ ...v, name: e.target.value })} />
      <label htmlFor="sk">Kürzel (optional, höchstens 10 Zeichen)</label>
      <input id="sk" maxLength={10} value={v.short_name} onChange={e => setV({ ...v, short_name: e.target.value })} />
      <label htmlFor="sf">Fachart</label>
      <select id="sf" value={v.kind} onChange={e => setV({ ...v, kind: e.target.value as SubjectValues['kind'] })}>
        <option value="grundfach">Grundfach</option><option value="leistungsfach">Leistungsfach</option></select>
      <label htmlFor="sh">Halbjahr (z. B. 12/1, optional)</label>
      <input id="sh" list="sems" maxLength={20} value={v.semester} onChange={e => setV({ ...v, semester: e.target.value })} />
      <datalist id="sems">{sems.map(x => <option key={x.id} value={x.label} />)}</datalist>
      <label htmlFor="sc">Farbe</label>
      <input id="sc" type="color" value={v.color} onChange={e => setV({ ...v, color: e.target.value })} />
      {msg && <div className="alert" role="alert">{msg}</div>}
      <p className="row"><button className="pri" disabled={busy}>Speichern</button><button type="button" onClick={onCancel}>Abbrechen</button></p>
    </form>
  );
}

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
const hm = (t: string) => t.slice(0, 5);
const addMin = (t: string, m: number) => {
  const [h, mi] = t.split(':').map(Number);
  const x = Math.min(23 * 60 + 59, h * 60 + mi + m);
  return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
};
function Timetable({ d, subjects, run, setErr, back }: { d: Data; subjects: Subject[]; run: (p: Res) => Promise<void>; setErr: (m: string) => void; back: () => void }) {
  const periods = [...d.periods].sort((a, b) => a.nr - b.nr);
  const [edit, setEdit] = useState(periods.length === 0);
  const today = new Date().getDay();
  const slotOf = (day: number, pid: string) => d.slots.find(x => x.weekday === day && x.period_id === pid);
  const setSlot = (day: number, pid: string, sid: string) =>
    run(sid
      ? supabase.from('timetable_entries').upsert({ weekday: day, period_id: pid, subject_id: sid }, { onConflict: 'weekday,period_id' })
      : supabase.from('timetable_entries').delete().eq('weekday', day).eq('period_id', pid));
  const addPeriod = () => {
    const last = periods[periods.length - 1];
    const start = last ? hm(last.end_time) : '08:00';
    run(supabase.from('periods').insert({ nr: (last?.nr ?? 0) + 1, start_time: start, end_time: addMin(start, 45) }));
  };
  const upd = (p: Period, patch: { start_time?: string; end_time?: string }) => {
    const n = { start_time: hm(p.start_time), end_time: hm(p.end_time), ...patch };
    if (n.end_time <= n.start_time) return setErr('Das Ende muss nach dem Beginn liegen.');
    setErr('');
    run(supabase.from('periods').update(n).eq('id', p.id));
  };
  return (
    <>
      <p><button onClick={back}>← Zurück</button></p>
      <div className="row sp"><h2>Stundenplan</h2><button onClick={() => setEdit(!edit)}>{edit ? 'Zeiten fertig' : 'Zeiten bearbeiten'}</button></div>
      {d.ttMissing && <div className="alert" role="alert">Der Stundenplan braucht eine Datenbank-Erweiterung: Führe die Datei 0003_timetable.sql im Supabase SQL Editor aus.</div>}
      {!subjects.length && <div className="alert">Lege zuerst Fächer an, damit du sie den Stunden zuweisen kannst.</div>}
      {edit && (
        <div className="card"><h3>Zeiten der Stunden</h3>
          <div className="tw"><table><thead><tr><th>Stunde</th><th>Von</th><th>Bis</th><th></th></tr></thead><tbody>
            {periods.map((p, i) => (
              <tr key={p.id + p.start_time + p.end_time}>
                <td>{i + 1}.</td>
                <td><input type="time" aria-label={`Beginn der ${i + 1}. Stunde`} defaultValue={hm(p.start_time)} onBlur={e => { if (e.target.value && e.target.value !== hm(p.start_time)) upd(p, { start_time: e.target.value }); }} /></td>
                <td><input type="time" aria-label={`Ende der ${i + 1}. Stunde`} defaultValue={hm(p.end_time)} onBlur={e => { if (e.target.value && e.target.value !== hm(p.end_time)) upd(p, { end_time: e.target.value }); }} /></td>
                <td><button className="d" onClick={() => { if (confirm(`Stunde ${i + 1} samt Zuordnungen löschen?`)) run(supabase.from('periods').delete().eq('id', p.id)); }}>Entfernen</button>
                  {i > 0 && hm(p.start_time) < hm(periods[i - 1].end_time) && <div className="alert">Überschneidet sich mit der Stunde davor.</div>}</td>
              </tr>))}
          </tbody></table></div>
          <p><button className="pri" disabled={d.ttMissing} onClick={addPeriod}>Stunde hinzufügen</button></p>
        </div>)}
      {periods.length > 0 && (
        <div className="card tw"><table><thead><tr><th>Stunde</th>{DAYS.map((x, i) => <th key={x} style={today === i + 1 ? { color: 'var(--ink)', textDecoration: 'underline' } : undefined}>{x}</th>)}</tr></thead><tbody>
          {periods.map((p, i) => (
            <tr key={p.id}>
              <th scope="row">{i + 1}.<div className="mut small">{hm(p.start_time)}–{hm(p.end_time)}</div></th>
              {DAYS.map((_, k) => {
                const day = k + 1;
                const sub = subjects.find(x => x.id === slotOf(day, p.id)?.subject_id);
                return (
                  <td key={day} style={{ minWidth: '6.5rem', borderLeft: sub ? `5px solid ${sub.color}` : undefined }}>
                    <select aria-label={`${DAYS[k]}, ${i + 1}. Stunde`} value={sub?.id ?? ''} onChange={e => setSlot(day, p.id, e.target.value)} disabled={d.ttMissing}>
                      <option value="">–</option>
                      {subjects.map(x => <option key={x.id} value={x.id}>{x.short_name || x.name}</option>)}
                    </select>
                  </td>);
              })}
            </tr>))}
        </tbody></table></div>)}
    </>
  );
}

function PasswordForm({ email }: { email: string }) {
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 6) return setMsg({ ok: false, t: 'Das neue Passwort braucht mindestens 6 Zeichen.' });
    if (pw !== pw2) return setMsg({ ok: false, t: 'Die beiden neuen Passwörter stimmen nicht überein.' });
    setBusy(true);
    const chk = await supabase.auth.signInWithPassword({ email, password: cur });
    if (chk.error) {
      setBusy(false);
      return setMsg({ ok: false, t: /Invalid login/i.test(chk.error.message) ? 'Das aktuelle Passwort stimmt nicht.' : de(chk.error.message) });
    }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg({ ok: false, t: de(error.message) });
    setCur(''); setPw(''); setPw2('');
    setMsg({ ok: true, t: 'Passwort geändert.' });
  }
  return (
    <form className="card" onSubmit={submit}>
      <h3>Passwort ändern</h3>
      <label htmlFor="pc">Aktuelles Passwort</label>
      <input id="pc" type="password" required autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} />
      <label htmlFor="pn">Neues Passwort (mindestens 6 Zeichen)</label>
      <input id="pn" type="password" required minLength={6} autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
      <label htmlFor="pr">Neues Passwort wiederholen</label>
      <input id="pr" type="password" required minLength={6} autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />
      {msg && <div className={msg.ok ? 'ok' : 'alert'} role="alert">{msg.t}</div>}
      <p><button className="pri" disabled={busy}>Passwort ändern</button></p>
    </form>
  );
}
