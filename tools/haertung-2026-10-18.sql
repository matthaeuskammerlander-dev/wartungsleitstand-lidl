-- Härtung nach der Supabase-Sicherheitsprüfung vom 18.10.2026 (Inhaber: „prüf die ersten beiden Punkte“).
-- Nimmt nur Rechte weg, die die App nicht braucht – lockert nichts. Mehrfach ausführbar.

-- 1. Wochenübersicht: lief ohne Anmeldung aufrufbar (/rest/v1/rpc/wochenuebersicht_anstossen) – jeder mit dem öffentlichen
--    Schlüssel der App hätte beliebig oft Push-Nachrichten an Inhaber und Admins auslösen können. Aufgerufen wird sie nur vom
--    Zeitplan (pg_cron, Montag 05:00, läuft als Eigentümer) – App und Konten brauchen das Recht nicht.
revoke execute on function public.wochenuebersicht_anstossen() from public, anon, authenticated;

-- 2. standort_kunde(sid): verriet ohne Anmeldung, zu welchem Kunden eine Markt-Kennung gehört. Verwendet wird sie nur in
--    kunde_sieht() (läuft als Eigentümer) – angemeldete Konten behalten das Recht, ohne Anmeldung nicht mehr.
revoke execute on function public.standort_kunde(text) from public, anon;

-- 3. Ansicht fernzugriff_zugang: nur Lesen ist gewollt; Schreibrechte (die bei dieser Ansicht ohnehin nicht greifen) weg.
revoke insert, update, delete, truncate, references, trigger on public.fernzugriff_zugang from authenticated;

-- Kontrolle: alle vier false
select has_function_privilege('anon', 'public.wochenuebersicht_anstossen()', 'execute') as anon_wochen,
       has_function_privilege('authenticated', 'public.wochenuebersicht_anstossen()', 'execute') as konto_wochen,
       has_function_privilege('anon', 'public.standort_kunde(text)', 'execute') as anon_standort_kunde,
       has_table_privilege('authenticated', 'public.fernzugriff_zugang', 'update') as konto_update_zugang;
