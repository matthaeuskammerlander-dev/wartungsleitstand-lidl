-- Vor Ort klären (Büro 03.10.2026): Fragen je Markt, die sich nur vor Ort beantworten lassen
-- (welche Straße, dieselbe Anlage?, Baujahr …). Das Büro (Inhaber, Admins) stellt sie und hakt sie ab;
-- wer schreiben darf – auch Techniker –, sieht sie beim Protokoll an diesem Markt und antwortet.
-- Kunde und Präsentation sehen nichts. Einmal im SQL-Editor von Supabase ausführen (wiederholbar).

create table if not exists public.vor_ort_fragen (
  id              uuid primary key default gen_random_uuid(),
  standort_id     text not null,
  position_id     text,
  frage           text not null check (length(frage) between 3 and 1000),
  herkunft        text,                       -- z. B. „Prüfung der alten Liste“
  angelegt        timestamptz not null default now(),
  angelegt_von    text,
  antwort         text check (antwort is null or length(antwort) <= 2000),
  beantwortet     timestamptz,
  beantwortet_von text,
  erledigt        timestamptz,
  erledigt_von    text
);
create index if not exists vor_ort_fragen_offen on public.vor_ort_fragen (standort_id) where erledigt is null;

alter table public.vor_ort_fragen enable row level security;
drop policy if exists "vor ort lesen"     on public.vor_ort_fragen;
drop policy if exists "vor ort stellen"   on public.vor_ort_fragen;
drop policy if exists "vor ort antworten" on public.vor_ort_fragen;
drop policy if exists "vor ort loeschen"  on public.vor_ort_fragen;
create policy "vor ort lesen"     on public.vor_ort_fragen for select to authenticated using (public.darf_schreiben());
create policy "vor ort stellen"   on public.vor_ort_fragen for insert to authenticated
  with check (public.ist_admin() or public.ist_inhaber());
create policy "vor ort antworten" on public.vor_ort_fragen for update to authenticated
  using (public.darf_schreiben()) with check (public.darf_schreiben());
create policy "vor ort loeschen"  on public.vor_ort_fragen for delete to authenticated
  using (public.ist_admin() or public.ist_inhaber());

-- Wer nicht zum Büro gehört, setzt nur die Antwort – Frage, Markt und „erledigt“ bleiben beim Büro.
-- Die Zeit der Antwort setzt die Datenbank selbst.
create or replace function public.vor_ort_pruefen() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  -- ohne Anmeldung (SQL-Editor, Server) ist es Wartung durch das Büro
  if auth.uid() is not null and not (public.ist_admin() or public.ist_inhaber()) then
    if new.frage is distinct from old.frage or new.standort_id is distinct from old.standort_id
       or new.position_id is distinct from old.position_id or new.herkunft is distinct from old.herkunft
       or new.angelegt is distinct from old.angelegt or new.angelegt_von is distinct from old.angelegt_von
       or new.erledigt is distinct from old.erledigt or new.erledigt_von is distinct from old.erledigt_von then
      raise exception 'Frage und Erledigt-Vermerk ändert nur das Büro';
    end if;
    if old.erledigt is not null then
      raise exception 'Diese Frage ist schon erledigt';
    end if;
  end if;
  if new.antwort is distinct from old.antwort then
    new.beantwortet := now();
  else
    new.beantwortet := old.beantwortet;
  end if;
  return new;
end $$;
drop trigger if exists vor_ort_pruefen on public.vor_ort_fragen;
create trigger vor_ort_pruefen before update on public.vor_ort_fragen
  for each row execute function public.vor_ort_pruefen();

revoke all on public.vor_ort_fragen from anon;
grant select, insert, update, delete on public.vor_ort_fragen to authenticated;
