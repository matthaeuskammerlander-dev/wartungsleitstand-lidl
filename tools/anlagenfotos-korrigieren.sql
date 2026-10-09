-- Anlagen-Fotos korrigieren (Inhaber 09.10.2026: „ein paar falsche Prüfbuchfotos dabei – nirgends die Möglichkeit,
-- sie zu löschen oder zu korrigieren“). Im Supabase SQL Editor einmal ausführen; mehrfach ausführen schadet nicht.
--
-- Löschen und ändern (andere Anlage am Markt, andere Art, Beschriftung) darf das Büro (ist_admin) bei allen Fotos,
-- sonst nur, wer das Foto selbst gespeichert hat. Kunde und Präsentation nie (darf_schreiben).
-- Geändert werden können nur Anlage, Markt, Art und Beschriftung – Pfad, Zeitpunkt und wer es gespeichert hat bleiben.

drop policy if exists "anlagenfotos loeschen" on public.anlagenfotos;
create policy "anlagenfotos loeschen" on public.anlagenfotos for delete to authenticated
  using (public.darf_schreiben() and (public.ist_admin() or von = auth.uid()));

drop policy if exists "anlagenfotos aendern" on public.anlagenfotos;
create policy "anlagenfotos aendern" on public.anlagenfotos for update to authenticated
  using (public.darf_schreiben() and (public.ist_admin() or von = auth.uid()))
  with check (public.darf_schreiben() and (public.ist_admin() or von = auth.uid()));

revoke update on public.anlagenfotos from authenticated;
grant update (anlage_id, standort_id, art, beschriftung) on public.anlagenfotos to authenticated;

-- die Bilddatei eines gelöschten Fotos aus dem Speicher nehmen: nur unter anlagen/…, gleiche Regel wie oben
-- (owner = wer hochgeladen hat). Protokollfotos und alles andere bleiben unberührt.
drop policy if exists "anlagenfotos datei loeschen" on storage.objects;
create policy "anlagenfotos datei loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'protokollfotos' and name like 'anlagen/%'
         and public.darf_schreiben() and (owner = auth.uid() or public.ist_admin()));
