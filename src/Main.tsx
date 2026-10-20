import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { isValidPoints, normalizeWeights, subjectScore } from './lib/grades';
import type { Cat, Grade, Subject } from './types';

const f = (n: number | null) => (n == null ? '–' : n.toLocaleString('de-DE', { maximumFractionDigits: 2 }));
const DEFAULT_CATS: [string, number][] = [['Klausuren', 50], ['Mündliche Mitarbeit', 30], ['Tests', 20]];
type Data = { subjects: Subject[]; cats: Cat[]; grades: Grade[] };
type Res = PromiseLike<{ error: { message: string } | null }>;

const scoreOf = (cats: Cat[], grades: Grade[]) =>
  subjectScore(cats.map(c => ({ id: c.id, name: c.name, weight: c.weight, active: c.active })), grades.map(g => ({ categoryId: g.category_id, points: g.points })));

export default function Main({ user }: { user: User }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState('');

  const reload = useCallback(async () => {
    const [s, c, g] = await Promise.all([
      supabase.from('subjects').select('*').order('sort_order').order('created_at'),
      supabase.from('categories').select('*').order('created_at'),
      supabase.from('grades').select('*').order('graded_on', { ascending: false }),
    ]);
    const e = s.error || c.error || g.error;
    if (e) { setErr('Daten konnten nicht geladen werden: ' + e.message + ' (Wurde die SQL-Datei ausgeführt?)'); return; }
    setErr('');
    setD({ subjects: s.data as Subject[], cats: (c.data as Cat[]).map(x => ({ ...x, weight: Number(x.weight) })), grades: (g.data as Grade[]).map(x => ({ ...x, points: Number(x.points) })) });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const run = async (p: Res) => { const { error } = await p; await reload(); if (error) setErr(error.message); };

  async function addSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!d || !name.trim()) return;
    const { data, error } = await supabase.from('subjects').insert({ name: name.trim(), sort_order: d.subjects.length }).select().single();
    if (error || !data) { setErr(error?.message ?? 'Fach konnte nicht angelegt werden.'); return; }
    setName('');
    await run(supabase.from('categories').insert(DEFAULT_CATS.map(([n, w]) => ({ subject_id: data.id, name: n, weight: w }))));
  }

  const header = (
    <div className="row sp"><h1>MSS Grade Tracker</h1>
      <span className="row"><span className="mut">{user.email}</span><button onClick={() => supabase.auth.signOut()}>Abmelden</button></span></div>
  );
  if (!d) return <main>{header}{err ? <div className="alert" role="alert">{err}</div> : <p>Lädt …</p>}</main>;
  const subject = d.subjects.find(s => s.id === sel);
  if (subject)
    return <main>{header}{err && <div className="alert" role="alert">{err}</div>}
      <SubjectView s={subject} cats={d.cats.filter(c => c.subject_id === subject.id)} grades={d.grades.filter(g => g.subject_id === subject.id)} run={run} setErr={setErr} back={() => setSel(null)} /></main>;

  const results = d.subjects.map(s => ({ s, r: scoreOf(d.cats.filter(c => c.subject_id === s.id), d.grades.filter(g => g.subject_id === s.id)) }));
  const ok = results.filter(x => x.r.score !== null);
  const avg = ok.length ? ok.reduce((a, x) => a + (x.r.score as number), 0) / ok.length : null;
  return (
    <main>{header}{err && <div className="alert" role="alert">{err}</div>}
      <div className="card">
        <div className="big">{f(avg)} <span className="mut" style={{ fontSize: '1rem' }}>Ø Punkte</span></div>
        <p className="mut">Aus {ok.length} von {d.subjects.length} Fächern. {avg != null && <>Näherung Note: {f((17 - avg) / 3)} (keine offizielle Abiturprognose).</>}</p>
      </div>
      <form className="row" onSubmit={addSubject} style={{ marginBottom: '1rem' }}>
        <input style={{ flex: 1 }} aria-label="Name des neuen Fachs" placeholder="Neues Fach, z. B. Mathematik" value={name} onChange={e => setName(e.target.value)} />
        <button className="pri">Fach anlegen</button>
      </form>
      {!d.subjects.length && <div className="card"><p>Noch keine Fächer. Lege oben dein erstes Fach an.</p></div>}
      <div className="grid">{results.map(({ s, r }) => (
        <button key={s.id} className="card tile" style={{ borderLeft: `6px solid ${s.color}` }} onClick={() => setSel(s.id)}>
          <b>{s.name}</b><div className="big">{f(r.score)}</div>
          {r.reason && <span className="mut">{r.reason}</span>}{r.score != null && !r.complete && <span className="mut">vorläufig</span>}
        </button>))}</div>
    </main>
  );
}

type Form = { id?: string; title: string; category_id: string; points: string; graded_on: string; note: string };
function SubjectView({ s, cats, grades, run, setErr, back }: { s: Subject; cats: Cat[]; grades: Grade[]; run: (p: Res) => Promise<void>; setErr: (m: string) => void; back: () => void }) {
  const r = scoreOf(cats, grades);
  const [form, setForm] = useState<Form | null>(null);
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
    if (form.points === '' || !isValidPoints(p, false)) return setErr('Punkte müssen eine ganze Zahl von 0 bis 15 sein.');
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
      <div className="row sp"><h2>{s.name}</h2>
        <span className="row">
          <button onClick={() => { const n = prompt('Neuer Name', s.name); if (n?.trim()) run(supabase.from('subjects').update({ name: n.trim() }).eq('id', s.id)); }}>Umbenennen</button>
          <button className="d" onClick={() => { if (confirm(`Fach „${s.name}“ und alle Noten löschen?`)) { run(supabase.from('subjects').delete().eq('id', s.id)); back(); } }}>Löschen</button></span></div>
      <div className="card"><div className="big">{f(r.score)} <span className="mut" style={{ fontSize: '1rem' }}>Punkte</span></div>
        {r.reason && <div className="alert">{r.reason}</div>}
        {r.score != null && !r.complete && <div className="alert">Vorläufig: Kategorien ohne Noten bleiben unberücksichtigt, die übrigen werden neu gewichtet.</div>}
        <details><summary>Rechenweg</summary><div className="tw"><table><thead><tr><th>Kategorie</th><th>Noten</th><th>Ø</th><th>Gewicht</th><th>Zählt</th></tr></thead><tbody>
          {r.steps.map(x => <tr key={x.category}><td>{x.category}</td><td>{x.n}</td><td>{f(x.average)}</td><td>{f(x.weight)} %</td><td>{x.used ? 'ja' : 'nein'}</td></tr>)}</tbody></table></div>
          <p className="mut">Fachpunktzahl = Σ (Ø × Gewicht) ÷ Σ berücksichtigte Gewichte.</p></details></div>

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

      <div className="card"><div className="row sp"><h3>Noten</h3>
        <button className="pri" onClick={() => setForm({ title: '', category_id: cats[0]?.id ?? '', points: '', graded_on: new Date().toISOString().slice(0, 10), note: '' })}>Note eintragen</button></div>
        {form && <form onSubmit={saveGrade} className="card">
          <label htmlFor="gt">Bezeichnung</label><input id="gt" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <label htmlFor="gc">Kategorie</label><select id="gc" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label htmlFor="gp">Punkte (0 bis 15)</label><input id="gp" type="number" min={0} max={15} step={1} value={form.points} onChange={e => setForm({ ...form, points: e.target.value })} />
          <label htmlFor="gd">Datum</label><input id="gd" type="date" required value={form.graded_on} onChange={e => setForm({ ...form, graded_on: e.target.value })} />
          <label htmlFor="gn">Bemerkung (optional)</label><input id="gn" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
          <p className="row"><button className="pri">Speichern</button><button type="button" onClick={() => setForm(null)}>Abbrechen</button></p></form>}
        {grades.length ? <div className="tw"><table><thead><tr><th>Datum</th><th>Bezeichnung</th><th>Kategorie</th><th>Punkte</th><th></th></tr></thead><tbody>{grades.map(g => (
          <tr key={g.id}><td>{new Date(g.graded_on + 'T00:00:00').toLocaleDateString('de-DE')}</td><td>{g.title}{g.note && <div className="mut">{g.note}</div>}</td><td>{cn(g.category_id)}</td><td>{f(g.points)}</td>
            <td className="row"><button onClick={() => setForm({ id: g.id, title: g.title, category_id: g.category_id, points: String(g.points), graded_on: g.graded_on, note: g.note ?? '' })}>Ändern</button>
              <button className="d" onClick={() => confirm('Note löschen?') && run(supabase.from('grades').delete().eq('id', g.id))}>Löschen</button></td></tr>))}</tbody></table></div> : <p className="mut">Noch keine Noten.</p>}</div>
    </>
  );
}
