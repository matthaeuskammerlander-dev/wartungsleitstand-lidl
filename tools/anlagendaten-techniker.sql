-- Techniker duerfen Anlagendaten vor Ort ergaenzen
--
-- Einmal im Supabase SQL Editor ausfuehren (New query -> einfuegen -> Run).
-- Sicher wiederholbar. Dasselbe steht auch in supabase-setup.sql.
--
-- Vorher: nur Admins durften Maerkte und Anlagen aendern.
-- Nachher: Maerkte weiterhin nur Admins; Anlagen (Kaeltemittel, Kreislaeufe,
-- Pruefbuch, Rueckkuehler, Regelung, Fernzugriff ...) alle angemeldeten
-- Techniker. Jede Aenderung steht mit Name und Grund im Aenderungsverlauf;
-- ein Admin kann sie in der Verwaltung jederzeit zuruecksetzen.
-- Loeschen bleibt Admins vorbehalten.

drop policy if exists "stammdaten anlegen" on public.stammdaten;
drop policy if exists "stammdaten aendern" on public.stammdaten;

create policy "stammdaten anlegen" on public.stammdaten for insert to authenticated
  with check (public.ist_admin() or typ = 'position');
create policy "stammdaten aendern" on public.stammdaten for update to authenticated
  using (public.ist_admin() or typ = 'position') with check (public.ist_admin() or typ = 'position');
