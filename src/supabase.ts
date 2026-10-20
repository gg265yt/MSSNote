import { createClient } from '@supabase/supabase-js';
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
// Prüft die Werte vorab, damit eine falsche Eingabe eine lesbare Meldung statt einer weißen Seite ergibt.
export const configProblem: string | null =
  !url || !key ? 'Die Werte VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen im Build.'
  : !/^https?:\/\/[^/\s]+\.[^/\s]+/.test(url) ? 'VITE_SUPABASE_URL ist keine gültige Adresse (sie muss mit https:// beginnen).'
  : null;
export const configured = configProblem === null;
export const supabase = createClient(configured ? (url as string) : 'http://localhost', configured ? (key as string) : 'missing');
