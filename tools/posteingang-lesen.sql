-- Posteingang nur für Mitarbeiter lesbar (Tiefentest 05.10.2026):
-- Bisher durfte jedes angemeldete Konto Tabelle und Dateien des Posteingangs lesen –
-- auch das Kunden-Konto (Lidl) und die Präsentation. Dort liegen aber weitergeleitete
-- Mails anderer Kunden samt Anhängen. Regel: „Das Kunden-Konto sieht nie Daten anderer
-- Kunden“ – also Lesen nur mit public.darf_schreiben() (Inhaber, Admin, Techniker).
-- Für Inhaber, Admins und Techniker ändert sich nichts (auch das Konto der Synology
-- liest und schreibt weiter wie bisher – es braucht darf_schreiben() schon zum Anlegen).
-- Ob Techniker/Admins den Posteingang sehen sollen, ist eine offene Frage (F17).
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.

drop policy if exists "posteingang lesen" on public.posteingang;
create policy "posteingang lesen" on public.posteingang for select to authenticated
  using (public.darf_schreiben());

drop policy if exists "posteingang ansehen" on storage.objects;
create policy "posteingang ansehen" on storage.objects for select to authenticated
  using (bucket_id = 'posteingang' and public.darf_schreiben());

-- Kontrolle: beide Regeln mit darf_schreiben()
select tablename, policyname, qual from pg_policies
 where policyname in ('posteingang lesen', 'posteingang ansehen');
