-- Angebote, Rechnungen und Preise (Projektdateien unter buero/…) sehen NUR
-- Inhaber, keine Admins (Büro 01.10.2026). Einmal im Supabase SQL Editor
-- ausführen; dieselbe Regel steht auch in kunden-projekte-stunden.sql.

drop policy if exists "projektdateien ansehen"   on storage.objects;
drop policy if exists "projektdateien hochladen" on storage.objects;
drop policy if exists "projektdateien loeschen"  on storage.objects;
-- (Büro 01.10.2026: nur die Inhaber, auch keine Admins)
create policy "projektdateien ansehen" on storage.objects for select to authenticated
  using (bucket_id = 'projektdateien' and public.darf_schreiben()
         and (name not like 'buero/%' or public.ist_inhaber()));
create policy "projektdateien hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'projektdateien' and public.darf_schreiben()
              and (name not like 'buero/%' or public.ist_inhaber()));
create policy "projektdateien loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'projektdateien'
         and (case when name like 'buero/%' then public.ist_inhaber()
                   else (owner = auth.uid() or public.ist_admin()) end));

-- Kontrolle
select policyname, qual, with_check from pg_policies where tablename = 'objects' and policyname like 'projektdateien%';
