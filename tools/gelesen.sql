-- Gelesen-Stand je Konto (Team-Chat und Meldungen) – im Supabase SQL Editor
-- einmal ausführen. Mehrfach ausführen schadet nicht.
--
-- Je Konto eine Zeile: bis wann der Chat und die Meldungen gelesen sind. So
-- gilt am PC als gelesen, was am Handy gelesen wurde. Jedes Konto sieht und
-- schreibt nur seine eigene Zeile.
create table if not exists public.gelesen (
  user_id   uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  chat      timestamptz,
  meldungen timestamptz,
  geaendert timestamptz not null default now()
);
alter table public.gelesen enable row level security;

drop policy if exists "gelesen lesen" on public.gelesen;
create policy "gelesen lesen" on public.gelesen for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "gelesen anlegen" on public.gelesen;
create policy "gelesen anlegen" on public.gelesen for insert to authenticated
  with check (user_id = auth.uid() and public.darf_schreiben());
drop policy if exists "gelesen aendern" on public.gelesen;
create policy "gelesen aendern" on public.gelesen for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.darf_schreiben());

revoke all on public.gelesen from anon;
grant select, insert, update on public.gelesen to authenticated;
