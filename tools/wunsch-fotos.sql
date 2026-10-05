-- Änderungswünsche mit Foto oder Bildschirmfoto – im Supabase SQL Editor einmal
-- ausführen (nach tools/aenderungswuensche.sql und tools/chat.sql). Mehrfach
-- ausführen schadet nicht.
--
-- Die Bilder liegen im eigenen Speicher unter wunsch/<Konto>/… – sehen darf sie
-- nur, wer sie hochgeladen hat, und der Inhaber. An GitHub geht weiter nur Text.
alter table public.aenderungswuensche add column if not exists fotos jsonb not null default '[]'::jsonb;
alter table public.aenderungswuensche drop constraint if exists aenderungswuensche_fotos_check;
alter table public.aenderungswuensche add constraint aenderungswuensche_fotos_check
  check (jsonb_typeof(fotos) = 'array' and jsonb_array_length(fotos) <= 6);
grant insert (text, kontext, von_name, fotos) on public.aenderungswuensche to authenticated;

-- hochladen: nur in den eigenen Ordner; auch die Präsentation (sie darf Wünsche schicken)
drop policy if exists "wunschfotos hochladen" on storage.objects;
create policy "wunschfotos hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'protokollfotos'
              and name like 'wunsch/' || auth.uid()::text || '/%'
              and (public.darf_schreiben() or public.meine_rolle() = 'praesentation'));

-- ansehen: Protokollfotos alle Angemeldeten, ein Kunden-Konto aber nur zu
-- Protokollen, die es selbst lesen darf; Chat- und Anlagenfotos nur wer
-- mitarbeitet, Bilder zu Wünschen nur Absender und Inhaber (dieselbe Fassung
-- steht in tools/chat.sql und tools/anlagenfotos.sql, damit ein erneutes
-- Ausführen nichts zurücksetzt)
drop policy if exists "fotos ansehen" on storage.objects;
create policy "fotos ansehen" on storage.objects for select to authenticated
  using (bucket_id = 'protokollfotos'
         and case when name like 'wunsch/%'  then (owner = auth.uid() or public.ist_inhaber())
                  when name like 'chat/%'    then public.darf_schreiben()
                  when name like 'anlagen/%' then public.darf_schreiben()
                  else (public.meine_rolle() <> 'kunde'
                        or exists (select 1 from public.protokolle p
                                    where p.client_id = split_part(storage.objects.name, '/', 1)))
             end);
