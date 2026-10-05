-- Nach einem erneuten Lauf gelten zusätzlich die Sperren aus tools/rechte-2026-10-05.sql (eigene Namen, werden hier nicht entfernt).
-- Startpunkt je Person (Büro 02.10.2026): einstellungen „startpunkt:<Konto>“ – auch Admins und
-- Techniker dürfen ihn setzen (sonst nur der Inhaber). Gespeichert wird nur Ort/PLZ oder ein Markt.
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.
drop policy if exists "startpunkte anlegen" on public.einstellungen;
drop policy if exists "startpunkte aendern" on public.einstellungen;
create policy "startpunkte anlegen" on public.einstellungen for insert to authenticated
  with check (schluessel like 'startpunkt:%' and public.darf_schreiben());
create policy "startpunkte aendern" on public.einstellungen for update to authenticated
  using (schluessel like 'startpunkt:%' and public.darf_schreiben()) with check (schluessel like 'startpunkt:%' and public.darf_schreiben());
