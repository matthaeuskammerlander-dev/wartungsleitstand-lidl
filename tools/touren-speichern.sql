-- Eigene Touren speichern (Inhaber 27.10.2026: „kann ich mir eine Tour abspeichern?“) – im Supabase SQL Editor
-- einmal ausführen. Mehrfach ausführen schadet nicht. Setzt tools/touren.sql voraus.
--
-- Bisher durfte nur das Büro (ist_admin) Zeilen in touren anlegen – Touren an andere schicken. Jetzt darf
-- jede Person, die mitarbeitet (darf_schreiben – nie Kunde, Präsentation, Fernzugriff), ihre EIGENE Tour
-- speichern: an = von = das eigene Konto und daten.gespeichert = true. Ändern darf sie sie schon über die
-- Regel „touren abhaken“ (an = auth.uid()); löschen bleibt dem Büro – entfernt wird über „erledigt“.
drop policy if exists "touren eigene speichern" on public.touren;
create policy "touren eigene speichern" on public.touren for insert to authenticated
  with check (von = auth.uid() and an = auth.uid() and public.darf_schreiben()
    and coalesce((daten->>'gespeichert')::boolean, false));
