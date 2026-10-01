-- Rolle „archiv“ für das Konto des Synology-Archivskripts (Büro 01.10.2026):
-- Die endgültige Ablage ist die Synology – dazu gehören auch Angebote,
-- Rechnungen und Pläne der Baustellen. Das Archivkonto
--   * liest alles, was ein Techniker liest,
--   * liest zusätzlich Angebote/Rechnungen (Tabelle belege) und die
--     Projektdateien unter buero/ – sonst nur Inhaber,
--   * schreibt NIRGENDS (restriktive Regeln auf allen Tabellen und Dateien).
-- Es ist ein Maschinenkonto: Passwort nur in ukt_archiv.json auf der Synology.
--
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.
-- Die Rolle bekommt das Konto erst mit dem Befehl ganz unten (E-Mail einsetzen).

-- 1. Rolle zulassen
alter table public.rollen drop constraint if exists rollen_rolle_check;
alter table public.rollen add constraint rollen_rolle_check
  check (rolle in ('inhaber','admin','techniker','kunde','praesentation','archiv'));

create or replace function public.ist_archiv() returns boolean
language sql stable security definer set search_path = public as $$
  select public.meine_rolle() = 'archiv';
$$;

-- 2. nie schreiben: restriktive Regel je Tabelle (gilt zusätzlich zu allen anderen)
do $$
declare t record; art text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and rowsecurity loop
    foreach art in array array['insert','update','delete'] loop
      execute format('drop policy if exists %I on public.%I', 'archiv schreibt nie ' || art, t.tablename);
      if art = 'insert' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (not public.ist_archiv())',
                       'archiv schreibt nie ' || art, t.tablename);
      else
        execute format('create policy %I on public.%I as restrictive for %s to authenticated using (not public.ist_archiv())',
                       'archiv schreibt nie ' || art, t.tablename, art);
      end if;
    end loop;
  end loop;
end $$;
drop policy if exists "archiv schreibt nie insert" on storage.objects;
drop policy if exists "archiv schreibt nie update" on storage.objects;
drop policy if exists "archiv schreibt nie delete" on storage.objects;
create policy "archiv schreibt nie insert" on storage.objects as restrictive for insert to authenticated with check (not public.ist_archiv());
create policy "archiv schreibt nie update" on storage.objects as restrictive for update to authenticated using (not public.ist_archiv());
create policy "archiv schreibt nie delete" on storage.objects as restrictive for delete to authenticated using (not public.ist_archiv());

-- 3. zusätzlich lesen: Angebote/Rechnungen und Büro-Dateien der Projekte
drop policy if exists "belege archiv lesen" on public.belege;
create policy "belege archiv lesen" on public.belege for select to authenticated using (public.ist_archiv());
drop policy if exists "projektdateien archiv lesen" on storage.objects;
create policy "projektdateien archiv lesen" on storage.objects for select to authenticated
  using (bucket_id = 'projektdateien' and public.ist_archiv());

-- 4. Konto zuordnen (E-Mail des Archivkontos einsetzen, dann diese Zeile ausführen):
-- insert into public.rollen (user_id, rolle, name)
--   select id, 'archiv', 'Archiv Synology' from auth.users where email = 'E-MAIL DES ARCHIVKONTOS'
--   on conflict (user_id) do update set rolle = 'archiv', name = 'Archiv Synology';

-- Kontrolle
select count(*) as regeln_archiv from pg_policies where policyname like 'archiv schreibt nie%';
