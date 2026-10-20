# MSS Grade Tracker

Notenverwaltung für die MSS (0–15 Punkte). React + Vite, Login und Datenbank über Supabase, Hosting über GitHub Pages. Alles im kostenlosen Tarif, keine Kreditkarte nötig (siehe `KOSTEN.md`).

## Einrichtung in 4 Schritten (ca. 15 Minuten, nichts muss installiert werden)

### 1. Supabase-Projekt anlegen
1. Auf supabase.com kostenlos registrieren, **New project** wählen, Namen und Datenbank-Passwort vergeben (Passwort notieren, wird aber nicht in der App gebraucht), Region „Frankfurt“ wählen.
2. Links **SQL Editor** → **New query**. Den kompletten Inhalt von `supabase/migrations/0001_init.sql` hineinkopieren → **Run**. Das legt alle Tabellen und die Zugriffsregeln (RLS) an.
3. Empfohlen für den Start: **Authentication** → **Sign In / Providers** → **Email** → „Confirm email“ ausschalten. Dann klappt die Registrierung ohne Bestätigungs-Mail. (Die eingebaute Mail-Funktion von Supabase verschickt nur sehr wenige Mails pro Stunde.)
4. **Project Settings** → **API**: **Project URL** und den **anon public** Key kopieren. Niemals den `service_role` Key verwenden.

### 2. GitHub-Repository anlegen
1. Auf github.com ein neues **öffentliches** Repository erstellen (z. B. `mss-grade-tracker`).
2. **Add file** → **Upload files**: den ausgepackten Projektordner-Inhalt per Drag-and-drop hochladen (auch den Ordner `.github`; falls er fehlt: **Add file → Create new file**, Name `.github/workflows/deploy.yml`, Inhalt aus der Datei einfügen). **Commit changes**.

### 3. Secrets und Pages einstellen
1. Im Repository: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Zwei Secrets anlegen: `VITE_SUPABASE_URL` (Project URL) und `VITE_SUPABASE_ANON_KEY` (anon public Key).
2. **Settings** → **Pages** → **Source: GitHub Actions**.
3. Tab **Actions**: Der Workflow „Deploy“ läuft (ggf. **Run workflow** drücken). Danach steht die Adresse unter Settings → Pages, meist `https://DEINNAME.github.io/mss-grade-tracker/`.

### 4. Adresse in Supabase eintragen
**Authentication** → **URL Configuration** → **Site URL** auf die GitHub-Pages-Adresse setzen und dieselbe Adresse unter **Redirect URLs** ergänzen. Nötig für Passwort-zurücksetzen und Bestätigungs-Mails.

Fertig. Registriere dich auf der Seite und lege dein erstes Fach an.

## Hinweise
- Der anon Key ist öffentlich vorgesehen. Den Schutz der Daten übernimmt Row Level Security: Jeder sieht nur eigene Zeilen.
- Kostenlose Supabase-Projekte werden nach 7 Tagen ohne Nutzung pausiert. Im Dashboard mit **Restore** wieder aktivieren, die Daten bleiben erhalten.
- Lokal testen (optional): Node.js installieren, `.env.example` nach `.env` kopieren und ausfüllen, dann `npm install`, `npm run dev`. Tests: `npm test`.

## Fehlerbehebung
- **Weiße Seite / „Supabase fehlt“**: Secrets falsch geschrieben. Namen exakt `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`, danach Workflow neu starten.
- **„Daten konnten nicht geladen werden“**: SQL aus Schritt 1.2 noch nicht ausgeführt oder Projekt pausiert.
- **Link in der Mail führt ins Leere**: Site URL und Redirect URL in Schritt 4 prüfen.
- **Workflow rot**: Im Tab Actions den fehlgeschlagenen Lauf öffnen und die Fehlermeldung ansehen.

## Noch nicht enthalten
Dashboard-Verlaufsdiagramm, mehrere Halbjahre, halbe Punkte, Dark-Mode-Schalter, Export/Import, Doppelwertung der Leistungsfächer. Die Berechnung liegt in `src/lib/grades.ts`, die Oberfläche in `src/Main.tsx`.
