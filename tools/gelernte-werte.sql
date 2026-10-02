-- Gemeinsam gelernte Eingaben (Büro 02.10.2026: „should be shared“): was jemand selbst eintippt
-- (Material, Foto-Beschriftung, eigene Werte in Auswahllisten, Firmennamen, Tätigkeitsbereiche),
-- steht danach bei allen als Vorschlag – nicht mehr nur auf dem eigenen Handy.
-- Keine Zugangsdaten (die App schickt geheime Felder nie hierher).
-- Lesen und Eintragen: wer mitarbeitet (nicht Kunde, nicht Präsentation). Entfernen: Admins/Inhaber.
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.

create table if not exists public.gelernte_werte (
  schluessel text not null check (length(schluessel) between 1 and 60),
  wert       text not null check (length(wert) between 1 and 200),
  erstellt   timestamptz not null default now(),
  von        text,
  primary key (schluessel, wert)
);
alter table public.gelernte_werte enable row level security;

drop policy if exists "gelernt lesen"    on public.gelernte_werte;
drop policy if exists "gelernt anlegen"  on public.gelernte_werte;
drop policy if exists "gelernt loeschen" on public.gelernte_werte;
create policy "gelernt lesen"    on public.gelernte_werte for select to authenticated using (public.darf_schreiben());
create policy "gelernt anlegen"  on public.gelernte_werte for insert to authenticated with check (public.darf_schreiben());
create policy "gelernt loeschen" on public.gelernte_werte for delete to authenticated using (public.ist_admin() or public.ist_inhaber());

do $$
declare a text;
begin
  if exists (select 1 from pg_proc where proname = 'ist_archiv') then
    foreach a in array array['insert','delete'] loop
      execute format('drop policy if exists %I on public.gelernte_werte', 'archiv schreibt nie ' || a);
      if a = 'insert' then
        execute format('create policy %I on public.gelernte_werte as restrictive for insert to authenticated with check (not public.ist_archiv())', 'archiv schreibt nie ' || a);
      else
        execute format('create policy %I on public.gelernte_werte as restrictive for delete to authenticated using (not public.ist_archiv())', 'archiv schreibt nie ' || a);
      end if;
    end loop;
  end if;
end $$;

grant select, insert, delete on public.gelernte_werte to authenticated;
