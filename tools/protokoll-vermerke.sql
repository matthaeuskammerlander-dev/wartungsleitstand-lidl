-- Vermerke an Protokollen (Büro 01.10.2026): der Inhaber vermerkt ein Protokoll
-- (z. B. ungleiche Angaben, nicht ernst gemeinter Eintrag). Das Protokoll selbst
-- bleibt unverändert; der Vermerk steht sichtbar daneben – in der App bei jedem,
-- der mitarbeitet. Eintragen und löschen nur der Inhaber.
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.

create table if not exists public.protokoll_vermerke (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null,
  text         text not null check (length(text) between 1 and 1000),
  von          text,
  erstellt     timestamptz not null default now(),
  erstellt_von uuid not null default auth.uid()
);
create index if not exists protokoll_vermerke_client_idx on public.protokoll_vermerke (client_id);
alter table public.protokoll_vermerke enable row level security;
drop policy if exists "vermerke lesen"     on public.protokoll_vermerke;
drop policy if exists "vermerke anlegen"   on public.protokoll_vermerke;
drop policy if exists "vermerke loeschen"  on public.protokoll_vermerke;
create policy "vermerke lesen"    on public.protokoll_vermerke for select to authenticated using (public.darf_schreiben());
create policy "vermerke anlegen"  on public.protokoll_vermerke for insert to authenticated
  with check (public.ist_inhaber() and erstellt_von = auth.uid());
create policy "vermerke loeschen" on public.protokoll_vermerke for delete to authenticated using (public.ist_inhaber());
-- Archivkonto schreibt nie
do $$
begin
  if exists (select 1 from pg_proc where proname = 'ist_archiv') then
    drop policy if exists "archiv schreibt nie insert" on public.protokoll_vermerke;
    create policy "archiv schreibt nie insert" on public.protokoll_vermerke as restrictive for insert to authenticated with check (not public.ist_archiv());
  end if;
end $$;
revoke all on public.protokoll_vermerke from anon;
grant select, insert, delete on public.protokoll_vermerke to authenticated;

-- Kontrolle
select count(*) as vermerke from public.protokoll_vermerke;
