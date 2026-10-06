-- ================================================================
-- Tagesrückblick: „Tag geprüft“ je Person und Tag (Inhaber 06.10.2026)
-- Was: Nach dem Ausstempeln fragt die App „Was hast du heute wann und wo gemacht?“. Wer „✓ Passt so“ tippt,
--      ohne etwas zu ändern, schreibt keine Stunden – der Tag soll aber auf ALLEN Geräten als geprüft gelten
--      (sonst steht am PC weiter „⇆ Tag prüfen“). Gemerkt wird je Person und Tag der „Stand“ der gestempelten
--      Einträge (Kennungen und Zeiten); ändert sich daran etwas, gilt der Tag in der App wieder als offen.
-- Warum: Antwort des Inhabers vom 06.10.2026 („Geprüft in der Datenbank merken, damit es auf allen Geräten gilt“).
-- Wer darf danach was:
--   lesen:     die Person ihre eigenen Zeilen, der Inhaber alle (keine Admins – Stunden gehören dem Inhaber);
--   schreiben: nur die eigene Zeile (anlegen und ändern), nur wer mitarbeitet (darf_schreiben – nicht Kunde,
--              nicht Präsentation); auch der Inhaber nicht für andere;
--   löschen:   niemand (keine Regel) – es ist nur ein Merker, kein Stundeneintrag.
-- Die Zeit (geprueft_am) und die Person setzt der Server (Trigger).
-- Ohne diese Tabelle merkt sich die App „geprüft“ wie bisher nur auf dem Gerät.
-- Mehrfach ausführbar.
-- ================================================================

create table if not exists public.tag_geprueft (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datum       date not null,
  stand       text not null check (length(stand) <= 8000),
  geprueft_am timestamptz not null default now(),
  primary key (user_id, datum)
);

alter table public.tag_geprueft enable row level security;
revoke all on public.tag_geprueft from anon;
grant select, insert, update on public.tag_geprueft to authenticated;

drop policy if exists "tag geprueft lesen eigene oder inhaber" on public.tag_geprueft;
create policy "tag geprueft lesen eigene oder inhaber" on public.tag_geprueft
  for select to authenticated
  using (user_id = auth.uid() or public.ist_inhaber());

drop policy if exists "tag geprueft anlegen nur eigene" on public.tag_geprueft;
create policy "tag geprueft anlegen nur eigene" on public.tag_geprueft
  for insert to authenticated
  with check (user_id = auth.uid() and public.darf_schreiben());

drop policy if exists "tag geprueft aendern nur eigene" on public.tag_geprueft;
create policy "tag geprueft aendern nur eigene" on public.tag_geprueft
  for update to authenticated
  using (user_id = auth.uid() and public.darf_schreiben())
  with check (user_id = auth.uid() and public.darf_schreiben());

-- Zeit und Person setzt der Server – nie das Gerät
create or replace function public.tag_geprueft_server() returns trigger
language plpgsql as $$
begin
  new.geprueft_am := now();
  if tg_op = 'UPDATE' then new.user_id := old.user_id; new.datum := old.datum; end if;
  return new;
end $$;
drop trigger if exists tag_geprueft_server on public.tag_geprueft;
create trigger tag_geprueft_server before insert or update on public.tag_geprueft
  for each row execute function public.tag_geprueft_server();

-- Kontrollabfrage: drei Regeln (lesen, anlegen, ändern), RLS an, Trigger vorhanden
select
  (select relrowsecurity from pg_class where oid = 'public.tag_geprueft'::regclass) as rls_an,
  (select string_agg(policyname || ' (' || cmd || ')', ', ' order by policyname) from pg_policies
     where schemaname = 'public' and tablename = 'tag_geprueft') as regeln,
  (select count(*) from pg_trigger where tgrelid = 'public.tag_geprueft'::regclass and tgname = 'tag_geprueft_server') as trigger_da;
