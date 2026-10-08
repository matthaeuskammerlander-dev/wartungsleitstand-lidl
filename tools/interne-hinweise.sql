-- Interne Hinweise je Anlage bzw. Markt (Inhaber 08.10.2026: „bei einem Störungs- oder Wartungseinsatz eine interne Notiz
-- hinterlassen, die nicht am Protokoll erscheint – in der Anlagenansicht klar ersichtlich, dass hier ein kleiner Alarm oder
-- Fehler beiliegt, der beim nächsten Mal behoben werden muss. Das soll nur die Firma UKT intern wissen.“)
-- Eigene Tabelle – NICHT im Protokoll, nicht im PDF, nicht im Monatsbericht, nicht auf der Synology.
-- Lesen und schreiben nur, wer mitarbeitet (darf_schreiben: Inhaber, Admins, Techniker) – das Kunden-Konto und die
-- Präsentation sehen nichts. Text und Anlage ändert nur, wer den Hinweis angelegt hat, oder das Büro; „behoben“
-- vermerken darf jeder, der mitarbeitet. Löschen nur das Büro. Einmal im SQL-Editor ausführen (wiederholbar).

create table if not exists public.interne_hinweise (
  id             uuid primary key default gen_random_uuid(),
  standort_id    text not null,
  position_id    text,                       -- leer = der ganze Markt
  art            text not null default 'fehler' check (art in ('fehler','alarm','notiz')),
  text           text not null check (length(text) between 3 and 1000),
  protokoll_id   text,                       -- beim Einsatz angelegt: welches Protokoll (nur zur Herkunft)
  angelegt       timestamptz not null default now(),
  angelegt_von   text,
  angelegt_uid   uuid default auth.uid(),
  erledigt       timestamptz,
  erledigt_von   text,
  erledigt_text  text check (erledigt_text is null or length(erledigt_text) <= 1000)
);
create index if not exists interne_hinweise_offen on public.interne_hinweise (standort_id) where erledigt is null;

alter table public.interne_hinweise enable row level security;
drop policy if exists "interne hinweise lesen"    on public.interne_hinweise;
drop policy if exists "interne hinweise anlegen"  on public.interne_hinweise;
drop policy if exists "interne hinweise aendern"  on public.interne_hinweise;
drop policy if exists "interne hinweise loeschen" on public.interne_hinweise;
create policy "interne hinweise lesen"    on public.interne_hinweise for select to authenticated using (public.darf_schreiben());
create policy "interne hinweise anlegen"  on public.interne_hinweise for insert to authenticated with check (public.darf_schreiben());
create policy "interne hinweise aendern"  on public.interne_hinweise for update to authenticated
  using (public.darf_schreiben()) with check (public.darf_schreiben());
create policy "interne hinweise loeschen" on public.interne_hinweise for delete to authenticated
  using (public.ist_admin() or public.ist_inhaber());

create or replace function public.interne_hinweise_pruefen() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.angelegt_uid := auth.uid(); end if;
    new.angelegt := now(); new.erledigt := null; new.erledigt_von := null; new.erledigt_text := null;
    return new;
  end if;
  -- wer angelegt hat und wann, bleibt immer
  new.angelegt := old.angelegt; new.angelegt_uid := old.angelegt_uid; new.angelegt_von := old.angelegt_von; new.protokoll_id := old.protokoll_id;
  if auth.uid() is not null and not (public.ist_admin() or public.ist_inhaber() or old.angelegt_uid = auth.uid()) then
    if new.text is distinct from old.text or new.art is distinct from old.art
       or new.standort_id is distinct from old.standort_id or new.position_id is distinct from old.position_id then
      raise exception 'Den Hinweis selbst ändert nur, wer ihn angelegt hat, oder das Büro – „behoben“ vermerken darf jeder';
    end if;
  end if;
  if new.erledigt is not null and old.erledigt is null then new.erledigt := now(); end if;
  return new;
end $$;
drop trigger if exists interne_hinweise_pruefen on public.interne_hinweise;
create trigger interne_hinweise_pruefen before insert or update on public.interne_hinweise
  for each row execute function public.interne_hinweise_pruefen();

revoke all on public.interne_hinweise from anon;
grant select, insert, update, delete on public.interne_hinweise to authenticated;
