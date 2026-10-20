import { useState } from 'react';
import { supabase } from './supabase';

const de = (m: string) =>
  /Invalid login/i.test(m) ? 'E-Mail oder Passwort stimmt nicht.' :
  /already registered/i.test(m) ? 'Diese E-Mail ist schon registriert.' :
  /not confirmed/i.test(m) ? 'Bitte bestätige zuerst deine E-Mail-Adresse.' :
  /at least|weak/i.test(m) ? 'Das Passwort ist zu kurz oder zu schwach (mindestens 6 Zeichen).' :
  /rate limit|too many/i.test(m) ? 'Zu viele Anfragen. Bitte warte einige Minuten.' :
  'Fehler: ' + m;
const here = () => window.location.origin + window.location.pathname;

export function Auth() {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) setMsg({ ok: false, t: de(error.message) });
      } else if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: here() } });
        if (error) setMsg({ ok: false, t: de(error.message) });
        else if (!data.session) setMsg({ ok: true, t: 'Fast fertig: Wir haben dir eine E-Mail zur Bestätigung geschickt.' });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: here() });
        setMsg(error ? { ok: false, t: de(error.message) } : { ok: true, t: 'Falls die Adresse existiert, ist eine E-Mail unterwegs.' });
      }
    } finally { setBusy(false); }
  }
  return (
    <main style={{ maxWidth: 420 }}>
      <h1>MSS Grade Tracker</h1>
      <form className="card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Registrieren' : 'Passwort zurücksetzen'}</h2>
        <label htmlFor="em">E-Mail</label>
        <input id="em" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
        {mode !== 'reset' && <>
          <label htmlFor="pw">Passwort</label>
          <input id="pw" type="password" required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={pw} onChange={e => setPw(e.target.value)} />
        </>}
        {msg && <div className={msg.ok ? 'ok' : 'alert'} role="alert">{msg.t}</div>}
        <p><button className="pri" disabled={busy}>{mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Konto anlegen' : 'Link senden'}</button></p>
        <div className="row">
          {mode !== 'login' && <button type="button" onClick={() => setMode('login')}>Zur Anmeldung</button>}
          {mode !== 'register' && <button type="button" onClick={() => setMode('register')}>Neues Konto</button>}
          {mode === 'login' && <button type="button" onClick={() => setMode('reset')}>Passwort vergessen</button>}
        </div>
      </form>
    </main>
  );
}

export function NewPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  async function go(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) setErr(de(error.message)); else onDone();
  }
  return (
    <main style={{ maxWidth: 420 }}>
      <form className="card" onSubmit={go}>
        <h2>Neues Passwort festlegen</h2>
        <label htmlFor="np">Neues Passwort</label>
        <input id="np" type="password" required minLength={6} autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
        {err && <div className="alert" role="alert">{err}</div>}
        <p><button className="pri">Speichern</button></p>
      </form>
    </main>
  );
}
