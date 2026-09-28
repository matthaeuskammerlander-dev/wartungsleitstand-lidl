-- ---------------------------------------------------------------------------
-- Änderungswünsche an der App
--
-- Wer mitarbeitet (nicht Kunde/Präsentation), kann aus der App einen Wunsch
-- schicken („Änderung vorschlagen“). Nur Inhaber sehen alle Wünsche, geben
-- sie an Claude frei (GitHub), sehen Vorschau und Prüfergebnis und übernehmen
-- die Änderung in die echte App – oder lehnen ab. Das Weiterreichen an GitHub
-- macht die Funktion „wuensche“ (supabase/functions/wuensche).
--
-- Voraussetzung: tools/rollen.sql ist gelaufen (meine_rolle, darf_schreiben,
-- ist_inhaber). Einmal im SQL Editor ausführen; mehrfach ausführen schadet nicht.
-- ---------------------------------------------------------------------------
create table if not exists public.aenderungswuensche (
  id          bigserial primary key,
  erstellt    timestamptz not null default now(),
  -- ohne „not null“: sonst scheitert das Löschen eines Kontos an „on delete set null“;
  -- neue Zeilen haben trotzdem immer einen Absender (Regel „wunsch schicken“: von = auth.uid())
  von         uuid default auth.uid() references auth.users(id) on delete set null,
  von_name    text,
  text        text not null check (length(trim(text)) between 5 and 4000),
  kontext     text,
  status      text not null default 'neu'
              check (status in ('neu','in_arbeit','vorschau','uebernommen','abgelehnt','fehler')),
  text_claude text,          -- vom Inhaber freigegebener (ggf. bearbeiteter) Auftrag
  issue_nr    int,
  pr_nr       int,
  pr_url      text,
  branch      text,
  pruefung    text,          -- Ergebnis der automatischen Prüfung: ok / fehler / laeuft
  antwort     text,          -- letzte Rückmeldung von Claude (gekürzt)
  notiz       text,          -- Notiz/Grund des Inhabers (etwa beim Ablehnen)
  merge_sha   text,          -- Stand in der App nach dem Übernehmen (für „Rückgängig“)
  rueckgaengig_von bigint,   -- dieser Eintrag nimmt Wunsch Nr. … zurück
  geaendert   timestamptz not null default now(),
  verlauf     jsonb not null default '[]'::jsonb
);
-- spätere Spalten auch bei schon angelegter Tabelle
alter table public.aenderungswuensche add column if not exists merge_sha text;
alter table public.aenderungswuensche add column if not exists rueckgaengig_von bigint;
-- Stand des Pull Requests beim „Nachbessern“: bis Claude einen neuen Stand
-- schiebt, bleibt der Wunsch „in Arbeit“ (nicht wieder „Vorschau bereit“)
alter table public.aenderungswuensche add column if not exists warte_auf_sha text;
-- schon angelegte Tabelle: „not null“ bei von entfernen (siehe oben)
alter table public.aenderungswuensche alter column von drop not null;
alter table public.aenderungswuensche enable row level security;

drop policy if exists "wunsch schicken" on public.aenderungswuensche;
-- auch Präsentations-Konten dürfen einen Wunsch schicken (ihr einziger Eintrag);
-- der Kunde nicht. An Claude geht ein Wunsch erst nach Freigabe durch den Inhaber.
create policy "wunsch schicken" on public.aenderungswuensche for insert to authenticated
  with check (von = auth.uid() and (public.darf_schreiben() or public.meine_rolle() = 'praesentation')
              and status = 'neu' and issue_nr is null and pr_nr is null);

drop policy if exists "wuensche lesen" on public.aenderungswuensche;
create policy "wuensche lesen" on public.aenderungswuensche for select to authenticated
  using (von = auth.uid() or public.ist_inhaber());

-- ändern (Status, Freigabe) nur Inhaber – die Funktion arbeitet mit deren Anmeldung
drop policy if exists "wuensche bearbeiten" on public.aenderungswuensche;
create policy "wuensche bearbeiten" on public.aenderungswuensche for update to authenticated
  using (public.ist_inhaber()) with check (public.ist_inhaber());

revoke all on public.aenderungswuensche from anon;
grant select, update on public.aenderungswuensche to authenticated;
-- Wer einen Wunsch schickt, füllt nur Text, Ort und Namen – alles andere
-- (Status, Prüfung, Rückmeldung, Zweig, Verlauf …) kommt aus den Vorgaben
-- bzw. später vom Inhaber. Sonst ließen sich Prüfergebnis, Claude-Auftrag
-- oder ein fremder Zweig schon beim Schicken vorbelegen.
revoke insert on public.aenderungswuensche from authenticated;
grant insert (text, kontext, von_name) on public.aenderungswuensche to authenticated;
grant usage, select on sequence public.aenderungswuensche_id_seq to authenticated;

-- Kontrolle
select count(*) as wuensche from public.aenderungswuensche;
