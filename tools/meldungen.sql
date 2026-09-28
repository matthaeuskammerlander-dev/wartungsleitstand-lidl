-- Meldungen in der App: jedes Konto darf die Push-Ereignisse lesen, die es
-- betreffen (alle allgemeinen, die seiner Rolle, die persönlich an es).
-- Im Supabase SQL Editor einmal ausführen (nach tools/push.sql). Mehrfach
-- ausführen schadet nicht.
--
-- Die Spalte nur_user legt sonst erst tools/chat-direkt.sql an – hier
-- ebenfalls, damit die Reihenfolge der beiden Dateien keine Rolle spielt.
alter table public.push_ereignisse add column if not exists nur_user uuid;
drop policy if exists "meldungen lesen" on public.push_ereignisse;
create policy "meldungen lesen" on public.push_ereignisse for select to authenticated
  using (public.darf_schreiben()
         and (nur_user is null or nur_user = auth.uid())
         and (nur_rolle is null or public.meine_rolle() = any (string_to_array(nur_rolle, ','))));
grant select on public.push_ereignisse to authenticated;
