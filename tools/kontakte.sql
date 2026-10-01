-- Kontakte und Ansprechpartner (Büro 01.10.2026: „eine Möglichkeit, Kontakte und
-- Ansprechpartner zu pflegen. Sobald eine neue Person entdeckt wird, soll sie mit
-- ihren Daten hinzugefügt werden.“)
--   * ein Adressbuch für Planer, Bauaufsicht, Lidl, Marktleitung, Lieferanten,
--     Gewerke, Behörden … – sichtbar für alle, die mitarbeiten (nicht Kunde,
--     nicht Präsentation); löschen nur Admin/Inhaber
--   * neue Personen legt die App selbst an (Projekt-Beteiligte, Ansprechpartner
--     eines Kunden, Lidl-Kontakt im Störungsauftrag, Ansprechpartner der Anfrage);
--     schluessel verhindert Doppelte, auch wenn zwei Geräte gleichzeitig anlegen
--   * herkunft: wo die Person vorkommt [{art, id, titel, zeit}]
-- Keine echten Kontakte im Repository – nur hier in der Datenbank.
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.

create table if not exists public.kontakte (
  id            uuid primary key default gen_random_uuid(),
  name          text check (name is null or length(name) <= 200),
  firma         text check (firma is null or length(firma) <= 200),
  funktion      text check (funktion is null or length(funktion) <= 200),
  kategorie     text not null default 'Sonstige',
  telefon       text check (telefon is null or length(telefon) <= 80),
  mobil         text check (mobil is null or length(mobil) <= 80),
  mail          text check (mail is null or length(mail) <= 200),
  adresse       text check (adresse is null or length(adresse) <= 300),
  notiz         text check (notiz is null or length(notiz) <= 2000),
  kunde_id      text,
  schluessel    text not null unique,
  herkunft      jsonb not null default '[]',
  erstellt      timestamptz not null default now(),
  erstellt_von  text,
  geaendert     timestamptz not null default now(),
  geaendert_von text,
  check (coalesce(nullif(btrim(name),''), nullif(btrim(firma),'')) is not null)
);
create index if not exists kontakte_name_idx on public.kontakte (lower(name));

alter table public.kontakte enable row level security;
drop policy if exists "kontakte lesen"    on public.kontakte;
drop policy if exists "kontakte anlegen"  on public.kontakte;
drop policy if exists "kontakte aendern"  on public.kontakte;
drop policy if exists "kontakte loeschen" on public.kontakte;
create policy "kontakte lesen"    on public.kontakte for select to authenticated using (public.darf_schreiben());
create policy "kontakte anlegen"  on public.kontakte for insert to authenticated with check (public.darf_schreiben());
create policy "kontakte aendern"  on public.kontakte for update to authenticated using (public.darf_schreiben()) with check (public.darf_schreiben());
create policy "kontakte loeschen" on public.kontakte for delete to authenticated using (public.ist_admin() or public.ist_inhaber());
do $$
declare a text;
begin
  if exists (select 1 from pg_proc where proname = 'ist_archiv') then
    foreach a in array array['insert','update','delete'] loop
      execute format('drop policy if exists %I on public.kontakte', 'archiv schreibt nie ' || a);
      if a = 'insert' then
        execute format('create policy %I on public.kontakte as restrictive for insert to authenticated with check (not public.ist_archiv())', 'archiv schreibt nie ' || a);
      else
        execute format('create policy %I on public.kontakte as restrictive for %s to authenticated using (not public.ist_archiv())', 'archiv schreibt nie ' || a, a);
      end if;
    end loop;
  end if;
end $$;
revoke all on public.kontakte from anon;
grant select, insert, update, delete on public.kontakte to authenticated;

-- Kontrolle
select count(*) as kontakte from public.kontakte;
