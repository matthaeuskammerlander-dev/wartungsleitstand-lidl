-- -----------------------------------------------------------------------------------------------------
-- Konto „Fernzugriff“ – Rolle fernzugriff (Inhaber 15.10.2026)
-- -----------------------------------------------------------------------------------------------------
-- WAS:   Ein Konto (z. B. fernzugriff@ukt.at), das wie das Kundenkonto nur ansehen darf, aber noch weniger sieht:
--          · nur die Märkte mit Fernzugriff-Adresse (Sicht stammdaten_lesen: Name, Adresse, Kartenpunkt, Adresse des
--            Fernzugriffs, online/offline ohne Grund) und den Logo-Merker für die Karte – keine Anlagen, keine Störungen
--          · je Markt den Kunden-Zugang (Benutzer/Passwort des Eintrags mit der Bezeichnung aus den Standard-Zugängen,
--            z. B. „Lidl (FM-Admin)“) über die Sicht fernzugriff_zugang – nie die anderen Zugänge
--          · nichts sonst: darf_schreiben() ist für die Rolle falsch (sperrt alle Tabellen, die darüber lesen), und
--            restriktive Regeln sperren zusätzlich Protokolle, Fassungen, Berichte und den Dateispeicher.
-- WARUM: Inhaber 15.10.2026: „er soll auf dem Kundenaccount aufbauen, aber mit wesentlich weniger Informationen. Nur die
--        Märkte mit Fernzugriff, nicht online = in Wartung, beim Markt nur der Link und der Account FMLidl mit Passwort –
--        viel mehr muss dieser Account nicht sehen. Die Karte mit den Lidl-Logos als Punkte soll er auch sehen.“
-- WIE:   1. Das Konto im Supabase-Dashboard anlegen (Authentication › Users › Add user, E-Mail fernzugriff@ukt.at,
--           Passwort vergibt der Inhaber – nie hier eintragen).
--        2. Dieses Skript im SQL-Editor ausführen (nach tools/einrichtung.sql und tools/fern-pruefung.sql). Mehrfach ausführbar.
-- -----------------------------------------------------------------------------------------------------

-- 1. Rolle zulassen
alter table public.rollen drop constraint if exists rollen_rolle_check;
alter table public.rollen add constraint rollen_rolle_check
  check (rolle in ('inhaber','admin','techniker','kunde','praesentation','archiv','fernzugriff'));

-- 2. Rolle dem Konto geben (sobald es angelegt ist)
insert into public.rollen (user_id, rolle, name)
select id, 'fernzugriff', 'Fernzugriff' from auth.users where email = 'fernzugriff@ukt.at'
on conflict (user_id) do update set rolle = 'fernzugriff', name = 'Fernzugriff';

-- 3. Nur ansehen: wie Kunde und Präsentation
create or replace function public.darf_schreiben() returns boolean
language sql stable security definer set search_path = public as $$
  select public.meine_rolle() not in ('kunde','praesentation','fernzugriff');
$$;

-- 4. Sicht stammdaten_lesen: für die Rolle fernzugriff nur Märkte mit Fernzugriff, Felder aufs Nötigste gekürzt,
--    dazu der Logo-Merker; Kunde wie bisher (tools/einrichtung.sql), Präsentation alles ohne Zugangsdaten
create or replace view public.stammdaten_lesen as
  select id, typ, ziel,
         case when public.meine_rolle() = 'fernzugriff' and typ = 'standort'
              then jsonb_strip_nulls(jsonb_build_object(
                     'name', felder->'name', 'adresse', felder->'adresse', 'plz', felder->'plz', 'ort', felder->'ort',
                     'filiale', felder->'filiale', 'lat', felder->'lat', 'lon', felder->'lon', 'aktiv', felder->'aktiv',
                     'kundeId', felder->'kundeId', 'fernLink', felder->'fernLink',
                     'fernOffline', case when felder ? 'fernOffline' and felder->'fernOffline' <> 'null'::jsonb then '{"seit":""}'::jsonb else null end))
              else felder - 'zugangLink' - 'zugangBenutzer' - 'zugangPasswort' - 'zugangWeitere'
                          - 'fernBenutzer' - 'fernPasswort' - 'fernWeitere' - 'fernVorOrt' end as felder,
         neu, geaendert, von, grund
    from public.stammdaten
   where auth.uid() is not null
     and case public.meine_rolle()
           when 'fernzugriff' then (typ = 'standort' and coalesce(felder->>'fernLink', '') <> '') or (typ = 'merker' and ziel = 'kundenlogo')
           when 'kunde' then case typ when 'kunde'    then ziel = public.mein_kunde()
                                      when 'standort' then public.kunde_sieht(ziel)
                                      when 'stoerung' then public.kunde_sieht(ziel)
                                      when 'position' then public.kunde_sieht(felder->>'standortId')
                                      else true end
           else true end;
revoke all on public.stammdaten_lesen from public, anon, authenticated;
grant select on public.stammdaten_lesen to authenticated;

-- 5. Sicht fernzugriff_zugang: je Markt mit Fernzugriff der Kunden-Zugang und online ja/nein – nur Rolle fernzugriff, Admins, Inhaber
create or replace view public.fernzugriff_zugang as
  select s.ziel as standort_id,
         kk.z->>'benutzer' as benutzer,
         kk.z->>'passwort' as passwort,
         (not (s.felder ? 'fernOffline') or s.felder->'fernOffline' = 'null'::jsonb) as online
    from public.stammdaten s
    left join lateral (
      select z from jsonb_array_elements(coalesce(s.felder->'fernWeitere', '[]'::jsonb)) z
       where z->>'bez' = coalesce((select wert->'standard'->>'kundeBez' from public.einstellungen where schluessel = 'einrichtung'), 'Lidl (FM-Admin)')
       limit 1) kk on true
   where s.typ = 'standort'
     and coalesce(s.felder->>'fernLink', '') <> ''
     and coalesce(s.felder->>'aktiv', 'true') <> 'false'
     and public.meine_rolle() in ('fernzugriff', 'admin', 'inhaber');
revoke all on public.fernzugriff_zugang from public, anon;
grant select on public.fernzugriff_zugang to authenticated;

-- 6. Restriktive Regeln: was für alle Angemeldeten lesbar ist, bleibt der Rolle fernzugriff verschlossen
drop policy if exists "fernzugriff sieht nichts" on public.protokolle;
create policy "fernzugriff sieht nichts" on public.protokolle as restrictive for select to authenticated using (public.meine_rolle() <> 'fernzugriff');
drop policy if exists "fernzugriff sieht nichts" on public.protokoll_fassungen;
create policy "fernzugriff sieht nichts" on public.protokoll_fassungen as restrictive for select to authenticated using (public.meine_rolle() <> 'fernzugriff');
drop policy if exists "fernzugriff sieht nichts" on public.berichte;
create policy "fernzugriff sieht nichts" on public.berichte as restrictive for select to authenticated using (public.meine_rolle() <> 'fernzugriff');
drop policy if exists "fernzugriff sieht keine dateien" on storage.objects;
create policy "fernzugriff sieht keine dateien" on storage.objects as restrictive for select to authenticated using (public.meine_rolle() <> 'fernzugriff');

-- Kontrolle: Rolle vergeben?, Sichten da, vier restriktive Regeln
select (select count(*) from public.rollen where rolle = 'fernzugriff') as konten_mit_rolle,
       (select count(*) from pg_views where viewname in ('stammdaten_lesen','fernzugriff_zugang')) as sichten,
       (select count(*) from pg_policies where policyname like 'fernzugriff sieht%') as regeln;
