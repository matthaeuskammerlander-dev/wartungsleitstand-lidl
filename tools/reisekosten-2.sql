-- Reisekosten, zweite Stufe (Inhaber 27.10.2026: „im PDF alle Belege, nicht nur die Fotos; beim Eintragen alles automatisch
-- aus dem PDF oder Foto erkennen – wenn nötig mit KI; einteilen in Bewirtung, Unterkunft, Material/Werkzeug und Sonstiges;
-- am Monatsende mit und ohne Mehrwertsteuer“).
--   * kategorie: zusätzlich 'bewirtung' (Unterkunft = 'naechtigung', Material/Werkzeug = 'material'/'werkzeug';
--     die älteren Feinheiten parken/maut/tanken/oeffis/post bleiben gültig und zählen als Sonstiges)
--   * mwst: enthaltene Mehrwertsteuer in € (nie mehr als der Betrag), mwst_satz: z. B. „20 %“ oder „10 % / 20 %“
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.

alter table public.auslagen drop constraint if exists auslagen_kategorie_check;
alter table public.auslagen add constraint auslagen_kategorie_check check (kategorie is null or kategorie in
  ('material','werkzeug','bewirtung','naechtigung','parken','maut','tanken','oeffis','post','sonstiges'));

alter table public.auslagen add column if not exists mwst numeric(10,2);
alter table public.auslagen add column if not exists mwst_satz text;
alter table public.auslagen drop constraint if exists auslagen_mwst_check;
alter table public.auslagen add constraint auslagen_mwst_check check (mwst is null or (mwst >= 0 and (betrag is null or mwst <= betrag)));
alter table public.auslagen drop constraint if exists auslagen_mwst_satz_check;
alter table public.auslagen add constraint auslagen_mwst_satz_check check (mwst_satz is null or length(mwst_satz) <= 40);
