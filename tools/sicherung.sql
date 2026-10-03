-- Wöchentliche Sicherung (Büro 03.10.2026): privater Speicherbereich „sicherungen“, nur für den Inhaber.
-- Die App legt dort einmal pro Woche den ganzen Datenbestand ab (datenbank/JJJJ-MM-TT.json.gz) und am PC
-- auf Wunsch eine Kopie der Dateien (dateien/<Bereich>/<Pfad>). Zusätzlich lädt der Inhaber die Sicherung
-- als Datei herunter (Erinnerung in der App). Einmal im SQL-Editor von Supabase ausführen (wiederholbar).

insert into storage.buckets (id, name, public)
values ('sicherungen', 'sicherungen', false)
on conflict (id) do update set public = false;

drop policy if exists "sicherungen lesen"     on storage.objects;
drop policy if exists "sicherungen ablegen"   on storage.objects;
drop policy if exists "sicherungen ersetzen"  on storage.objects;
drop policy if exists "sicherungen entfernen" on storage.objects;
create policy "sicherungen lesen"     on storage.objects for select to authenticated
  using (bucket_id = 'sicherungen' and public.ist_inhaber());
create policy "sicherungen ablegen"   on storage.objects for insert to authenticated
  with check (bucket_id = 'sicherungen' and public.ist_inhaber());
create policy "sicherungen ersetzen"  on storage.objects for update to authenticated
  using (bucket_id = 'sicherungen' and public.ist_inhaber()) with check (bucket_id = 'sicherungen' and public.ist_inhaber());
create policy "sicherungen entfernen" on storage.objects for delete to authenticated
  using (bucket_id = 'sicherungen' and public.ist_inhaber());
