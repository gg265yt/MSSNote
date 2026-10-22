import { useState } from 'react';
import { SCALE, isValidValue, scalePos, type Level, type MissingMode } from './lib/grades';
import { requiredValue, simulate } from './lib/simulate';
import type { Cat, Grade, Subject } from './types';

const f = (n: number | null) => (n == null ? '–' : n.toLocaleString('de-DE', { maximumFractionDigits: 2 }));

type Props = { subjects: Subject[]; cats: Cat[]; grades: Grade[]; mode: MissingMode; half: boolean; level: Level; back: () => void };

export default function Simulator({ subjects, cats, grades, mode, half, level, back }: Props) {
  const sc = SCALE[level];
  const startVal = level === 'oberstufe' ? '10' : '3';
  const [sid, setSid] = useState(subjects[0]?.id ?? '');
  const [cid, setCid] = useState('');
  const [val, setVal] = useState(startVal);
  const [title, setTitle] = useState('');
  const [custom, setCustom] = useState<number[]>([]);
  const [cval, setCval] = useState('');
  const [target, setTarget] = useState('');
  const subject = subjects.find(s => s.id === sid) ?? subjects[0];
  if (!subject)
    return <><p><button onClick={back}>← Zurück</button></p><h2>Noten-Simulator</h2><div className="card"><p>Lege zuerst ein Fach mit Noten an, dann kannst du hier ausprobieren, wie sich eine Note auswirkt.</p></div></>;

  const sCats = cats.filter(c => c.subject_id === subject.id).map(c => ({ id: c.id, name: c.name, weight: c.weight, active: c.active }));
  const sGrades = grades.filter(g => g.subject_id === subject.id).map(g => ({ categoryId: g.category_id, points: g.points }));
  const catId = sCats.some(c => c.id === cid) ? cid : sCats[0]?.id ?? '';
  const cat = sCats.find(c => c.id === catId);
  const v = Number(val.replace(',', '.'));
  const valid = val !== '' && isValidValue(v, level, half);
  const sim = cat && valid ? simulate(sCats, sGrades, catId, v, mode) : null;
  const better = (d: number) => (level === 'oberstufe' ? d > 0 : d < 0);
  const unit = level === 'oberstufe' ? 'Punkte' : '';
  const dtxt = (d: number | null) =>
    d === null ? '–' : Math.abs(d) < 0.005 ? '● unverändert' : `${better(d) ? '▲ besser' : '▼ schlechter'} (${d > 0 ? '+' : '−'}${f(Math.abs(d))} ${unit})`.replace(' )', ')');
  const bar = (x: number | null) => <div className="bar" aria-hidden><i style={{ width: `${x === null ? 0 : scalePos(x, level) * 100}%` }} /></div>;
  const reset = () => { setVal(startVal); setTitle(''); setCustom([]); setCval(''); setTarget(''); };

  const usedW = sim ? sim.after.steps.filter(s => s.used).reduce((a, s) => a + s.weight, 0) : 0;
  const effW = sim && cat && usedW > 0 && cat.active ? (cat.weight / usedW) * 100 : null;
  const base = level === 'oberstufe' ? [6, 8, 10, 12, 15] : [1, 2, 3, 4, 5, 6];
  const scen = [...base, ...custom.filter(x => !base.includes(x))].sort((a, b) => a - b);
  const t = Number(target.replace(',', '.'));
  const hasTarget = target !== '' && Number.isFinite(t) && !!cat;
  const req = hasTarget && cat ? requiredValue(sCats, sGrades, catId, t, mode, level, half) : null;
  const bestVal = level === 'oberstufe' ? sc.max : sc.min;
  const best = hasTarget && cat ? simulate(sCats, sGrades, catId, bestVal, mode).after : null;
  const stepTxt = half ? 'in Schritten von 0,5' : 'als ganze Zahl';

  return (
    <>
      <p><button onClick={back}>← Zurück</button></p>
      <div className="row sp"><h2>Noten-Simulator</h2><button onClick={reset}>Simulation zurücksetzen</button></div>
      <p className="mut small">Hier probierst du eine mögliche Note aus. Es wird nichts gespeichert und keine echte Note verändert.</p>

      <div className="card">
        <div className="row">
          <div style={{ flex: 1, minWidth: '10rem' }}><label htmlFor="ss">Fach</label>
            <select id="ss" value={subject.id} onChange={e => { setSid(e.target.value); setCid(''); }}>{subjects.map(s => <option key={s.id} value={s.id}>{s.short_name ? `${s.short_name} – ${s.name}` : s.name}</option>)}</select></div>
          <div style={{ flex: 1, minWidth: '10rem' }}><label htmlFor="sk">Kategorie</label>
            <select id="sk" value={catId} onChange={e => setCid(e.target.value)}>{sCats.map(c => <option key={c.id} value={c.id}>{c.name} ({f(c.weight)} %)</option>)}</select></div>
        </div>
        {!sCats.length && <div className="alert">Dieses Fach hat noch keine Kategorien. Lege sie im Fach an.</div>}
        {!sGrades.length && sCats.length > 0 && <div className="note-box">Dieses Fach hat noch keine Noten. Die Simulation zeigt dann nur das Ergebnis mit der simulierten Note.</div>}
        <label htmlFor="sv">{sc.label} für die simulierte Note</label>
        <div className="row">
          <input id="sv" style={{ maxWidth: '7rem' }} type="number" inputMode="decimal" min={sc.min} max={sc.max} step={half ? 0.5 : 1} value={val} onChange={e => setVal(e.target.value)} />
          <input aria-label="Regler für die simulierte Note" style={{ flex: 1, minWidth: '8rem' }} type="range" min={sc.min} max={sc.max} step={half ? 0.5 : 1}
            value={Number.isFinite(v) ? Math.min(sc.max, Math.max(sc.min, v)) : sc.min} onChange={e => setVal(e.target.value)} />
        </div>
        {!valid && <div className="alert" role="alert">Bitte einen Wert von {sc.min} bis {sc.max} eingeben ({stepTxt}).</div>}
        <label htmlFor="st">Bezeichnung (optional)</label>
        <input id="st" maxLength={60} placeholder="z. B. Nächste Klausur" value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      {sim && cat && (
        <>
          {!sim.after.valid && <div className="alert" role="alert">{sim.after.reason} Passe die Gewichtungen im Fach an, bis sie genau 100 % ergeben, dann kann der Simulator rechnen.</div>}
          {!cat.active && <div className="alert">Die Kategorie „{cat.name}“ ist inaktiv und zählt deshalb nicht zum Fachergebnis.</div>}
          {sim.catBefore === null && sim.after.valid && <div className="note-box">In „{cat.name}“ gibt es noch keine Note. Mit der simulierten Note zählt die Kategorie erstmals mit{mode === 'renormalize' ? ', die übrigen Gewichte werden entsprechend neu verteilt' : ''}.</div>}
          <div className="grid" style={{ marginBottom: '1rem' }}>
            <div className="card"><h3>Aktuell</h3><div className="big">{f(sim.before.score)}</div><div className="mut small">{sc.unit} im Fach</div>{bar(sim.before.score)}
              <p className="small">Ø „{cat.name}“: <b>{f(sim.catBefore)}</b></p>{sim.before.reason && <p className="mut small">{sim.before.reason}</p>}</div>
            <div className="card"><h3>Simuliert{title.trim() ? `: ${title.trim()}` : ''}</h3><div className="big">{f(sim.after.score)}</div><div className="mut small">{sc.unit} im Fach</div>{bar(sim.after.score)}
              <p className="small">Ø „{cat.name}“: <b>{f(sim.catAfter)}</b></p></div>
          </div>
          <div className="card" aria-live="polite"><h3>Veränderung</h3>
            <p className="big" style={{ fontSize: '1.6rem' }}>{dtxt(sim.delta)}</p>
            <p>Verwendete Gewichtung: „{cat.name}“ zählt <b>{f(cat.weight)} %</b>{effW !== null && Math.abs(effW - cat.weight) > 0.05 ? <> (bei der aktuellen Verteilung effektiv {f(effW)} %)</> : null}.</p>
            {sim.after.valid && (
              <div className="tw"><table><thead><tr><th>Kategorie</th><th>Gewicht</th><th>Ø vorher</th><th>Ø nachher</th><th>Zählt</th></tr></thead><tbody>
                {sim.after.steps.map(s => { const b = sim.before.steps.find(x => x.category === s.category); return (
                  <tr key={s.category}><td>{s.category}{s.category === cat.name ? ' (simuliert)' : ''}</td><td>{f(s.weight)} %</td><td>{f(b?.average ?? null)}</td><td>{f(s.average)}</td><td>{s.used ? 'ja' : 'nein'}</td></tr>); })}
              </tbody></table></div>)}
            <details><summary>So wird gerechnet</summary>
              <p className="small">Die simulierte Note wird testweise zu den vorhandenen Noten der Kategorie „{cat.name}“ hinzugefügt. Der Kategorie-Durchschnitt ist das Mittel aller Noten dieser Kategorie ({f(sim.catBefore)} → {f(sim.catAfter)}). Das Fachergebnis ist die Summe aus Kategorie-Durchschnitt × Gewicht, geteilt durch die Summe der berücksichtigten Gewichte. Das ist dieselbe Berechnung wie im Fach selbst. Einzelne Noten werden nicht zusätzlich gewichtet.</p></details>
          </div>
        </>)}

      {cat && (
        <div className="card"><h3>Szenarien vergleichen</h3>
          <p className="mut small">Ergebnis im Fach, wenn die nächste Note in „{cat.name}“ so ausfällt:</p>
          <div className="tw"><table><thead><tr><th>{sc.unit} in der Note</th><th>Fachergebnis</th><th>Veränderung</th><th></th></tr></thead><tbody>
            {scen.map(x => { const r = simulate(sCats, sGrades, catId, x, mode); return (
              <tr key={x}><td>{f(x)}</td><td>{f(r.after.score)}</td><td>{dtxt(r.delta)}</td><td>{custom.includes(x) && <button onClick={() => setCustom(custom.filter(y => y !== x))} aria-label={`Szenario ${f(x)} entfernen`}>Entfernen</button>}</td></tr>); })}
          </tbody></table></div>
          <div className="row" style={{ marginTop: '.6rem' }}>
            <input aria-label="Eigenen Wert als Szenario hinzufügen" style={{ maxWidth: '8rem' }} type="number" inputMode="decimal" min={sc.min} max={sc.max} step={half ? 0.5 : 1} placeholder="Eigener Wert" value={cval} onChange={e => setCval(e.target.value)} />
            <button disabled={!(cval !== '' && isValidValue(Number(cval.replace(',', '.')), level, half))} onClick={() => { setCustom([...custom, Number(cval.replace(',', '.'))]); setCval(''); }}>Szenario hinzufügen</button>
          </div>
        </div>)}

      {cat && (
        <div className="card"><h3>Zielrechner</h3>
          <label htmlFor="sz">Gewünschtes Fachergebnis ({sc.unit})</label>
          <input id="sz" style={{ maxWidth: '8rem' }} type="number" inputMode="decimal" step="0.1" value={target} onChange={e => setTarget(e.target.value)} />
          {hasTarget && best && (
            <p role="status">{req !== null
              ? level === 'oberstufe'
                ? (req === sc.min ? `Dein Ziel von ${f(t)} erreichst du mit jedem gültigen Wert in „${cat.name}“.` : `Du brauchst in „${cat.name}“ mindestens ${f(req)} Punkte, um ${f(t)} im Fach zu erreichen.`)
                : (req === sc.max ? `Dein Ziel von ${f(t)} erreichst du mit jeder gültigen Note in „${cat.name}“.` : `Du darfst in „${cat.name}“ höchstens die Note ${f(req)} schreiben, um ${f(t)} im Fach zu erreichen.`)
              : best.score === null
                ? `Das lässt sich gerade nicht berechnen: ${best.reason ?? 'Es fehlen Angaben.'}`
                : `Das Ziel ${f(t)} ist mit einer einzelnen weiteren Note in „${cat.name}“ nicht erreichbar. Selbst mit ${f(bestVal)}${level === 'oberstufe' ? ' Punkten' : ''} ergäbe sich nur ${f(best.score)}.`}</p>)}
        </div>)}
    </>
  );
}
