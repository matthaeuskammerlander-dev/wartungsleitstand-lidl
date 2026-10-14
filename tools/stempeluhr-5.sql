-- Stempeluhr, Teil 5: Position beim Stempeln „wie bei Crewmeister“ (Inhaber 14.10.2026, Wunsch des Seniorchefs)
-- ---------------------------------------------------------------------------
-- WAS:  Beim Ein-, Um- und Ausstempeln darf die App die Position (Koordinaten, Genauigkeit) im Stempel speichern –
--       aber NUR, wenn beides gilt: der Inhaber hat „Position speichern“ eingeschaltet (einstellungen stempel_standort:
--       an + position) UND die Person hat in der App zugestimmt (Tabelle stempel_zustimmung, Widerruf jederzeit).
--       Sonst bleibt es wie bisher: nur die Entfernung zum Markt bzw. Betrieb.
--       Die Position steht nur im Stempel (sichtbar: die Person selbst und der Inhaber). In den Arbeitszeiten
--       (Lohnauswertung, Listen, CSV) bleibt weiterhin nur die Entfernung – ort_ohne_position().
--       Positionen werden nach „tage“ Tagen (Vorgabe 90) bei jedem Stempeln automatisch entfernt
--       (stempel_position_bereinigen). Keine Verfolgung – nur der eine Moment des Stempelns.
-- WARUM: Seniorchef: „beim Einstempeln eine Standorterfassung wie bei Crewmeister“ (Inhaber 14.10.2026).
--       Rechtlich (Österreich): Zustimmung jeder Person (§ 10 AVRAG, ohne Betriebsrat), Information nach Art. 13 DSGVO,
--       begrenzter Zweck (Nachweis des Einsatzorts beim Stempeln), kurze Speicherfrist – deshalb Zustimmung in der App
--       und automatisches Löschen.
-- WIE:  Einmal im Supabase-SQL-Editor ausführen (nach stempeluhr-4.sql). Mehrfach ausführbar.
-- ---------------------------------------------------------------------------

-- 1. Koordinaten im Stempel zulassen (bisher wies die Tabelle lat/lon zurück)
alter table public.stempel drop constraint if exists stempel_ort_check;

-- 2. Zustimmung je Person
create table if not exists public.stempel_zustimmung (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name    text,
  zeit    timestamptz not null default now(),
  fassung text not null default '2026-10-14'          -- Fassung des Informationstexts, der zugestimmt wurde
);
alter table public.stempel_zustimmung enable row level security;
drop policy if exists "zustimmung lesen" on public.stempel_zustimmung;
drop policy if exists "zustimmung geben" on public.stempel_zustimmung;
drop policy if exists "zustimmung widerrufen" on public.stempel_zustimmung;
create policy "zustimmung lesen" on public.stempel_zustimmung for select to authenticated
  using (user_id = auth.uid() or public.ist_inhaber());
create policy "zustimmung geben" on public.stempel_zustimmung for insert to authenticated
  with check (user_id = auth.uid() and public.darf_schreiben());
create policy "zustimmung widerrufen" on public.stempel_zustimmung for delete to authenticated
  using (user_id = auth.uid() or public.ist_inhaber());
revoke all on public.stempel_zustimmung from anon, authenticated;
grant select, insert, delete on public.stempel_zustimmung to authenticated;

-- 3. Einstellung: an (wie bisher), position (neu, Vorgabe aus), tage (Speicherfrist der Positionen, Vorgabe 90)
update public.einstellungen
   set wert = wert || jsonb_build_object('position', coalesce(wert->'position', 'false'::jsonb), 'tage', coalesce(wert->'tage', '90'::jsonb))
 where schluessel = 'stempel_standort';

-- 4. Helfer: Ort ohne Koordinaten (für die Arbeitszeiten und das Bereinigen)
create or replace function public.ort_ohne_position(o jsonb) returns jsonb
language sql immutable as $$
  select case when o is null then null else o - 'lat' - 'lon' - 'latitude' - 'longitude' end
$$;

-- 5. Positionen älter als „tage“ Tage entfernen (Entfernung und Status bleiben) – läuft bei jedem Stempeln
create or replace function public.stempel_position_bereinigen() returns integer
language plpgsql security definer set search_path = public as $$
declare tage integer; n integer;
begin
  select coalesce((wert->>'tage')::integer, 90) into tage from public.einstellungen where schluessel = 'stempel_standort';
  tage := greatest(1, coalesce(tage, 90));
  update public.stempel set ort = public.ort_ohne_position(ort)
   where ort ? 'lat' and zeit < now() - make_interval(days => tage);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.stempel_position_bereinigen() from public, anon;
grant execute on function public.stempel_position_bereinigen() to authenticated;

-- 6. stempeln(): wie stempeluhr-4.sql, nur die Position – gespeichert nur mit Schalter UND Zustimmung, sonst entfernt;
--    in den Arbeitszeiten nie Koordinaten; vorher die alten Positionen bereinigen
drop function if exists public.stempeln(text, text, uuid, text, jsonb, text, text);
drop function if exists public.stempeln(text, text, uuid, text, jsonb, text, text, text, uuid[]);
create or replace function public.stempeln(p_art text, p_standort text default null, p_projekt uuid default null,
  p_taetigkeit text default null, p_ort jsonb default null, p_name text default null, p_ende_hand text default null,
  p_bereich text default null, p_ersetzen uuid[] default null, p_erledigt text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tz constant text := 'Europe/Vienna';
  letzt public.stempel; ein public.stempel; s public.stempel; seg public.stempel; vor_aus public.stempel;
  segs public.stempel[]; n integer; i integer; k integer;
  pause_ab timestamptz; pause_sek numeric; ende timestamptz := now(); seg_ende timestamptz;
  v_quelle text := 'stempel'; neu_id uuid; ids uuid[] := '{}'; t text; letzter boolean; ort_ende jsonb;
  seg_min integer[] := '{}'; seg_pause integer[] := '{}'; seg_auto integer[] := '{}';
  auto_an boolean; tag date; tag_arbeit integer; tag_pause integer; luecke integer := 0; fehlt integer;
  einst jsonb; position_ok boolean := false;
begin
  if auth.uid() is null or not public.darf_schreiben() then raise exception 'Stempeln ist mit diesem Konto nicht möglich'; end if;
  if p_art not in ('ein','pause','weiter','wechsel','aus') then raise exception 'unbekannte Stempelart'; end if;
  if p_bereich is not null and length(btrim(p_bereich)) not between 1 and 40 then
    raise exception 'unbekannter Bereich';
  end if;
  -- Position nur mit Schalter des Inhabers UND Zustimmung der Person – sonst bleibt nur die Entfernung
  select wert into einst from public.einstellungen where schluessel = 'stempel_standort';
  position_ok := coalesce((einst->>'an')::boolean, false) and coalesce((einst->>'position')::boolean, false)
                 and exists (select 1 from public.stempel_zustimmung z where z.user_id = auth.uid());
  if p_ort is not null and not position_ok then p_ort := public.ort_ohne_position(p_ort); end if;
  perform public.stempel_position_bereinigen();

  select * into letzt from public.stempel where user_id = auth.uid() order by zeit desc limit 1;
  if p_art = 'ein' and letzt.id is not null and letzt.art <> 'aus' then raise exception 'Du bist schon eingestempelt'; end if;
  if p_art in ('pause','wechsel') and (letzt.id is null or letzt.art not in ('ein','weiter','wechsel')) then
    raise exception '% geht nur, wenn du eingestempelt bist (nicht in der Pause)', case p_art when 'pause' then 'Pause' else 'Umstempeln' end;
  end if;
  if p_art = 'weiter' and (letzt.id is null or letzt.art <> 'pause') then raise exception 'Weiter geht nur nach einer Pause'; end if;
  if p_art = 'aus' and (letzt.id is null or letzt.art = 'aus') then raise exception 'Du bist nicht eingestempelt'; end if;

  if p_art <> 'aus' then
    insert into public.stempel (user_id, name, art, standort_id, projekt_id, taetigkeit, ort, bereich, erledigt)
    values (auth.uid(), p_name, p_art,
            case when p_art in ('pause','weiter') then coalesce(p_standort, letzt.standort_id) else p_standort end,
            case when p_art in ('pause','weiter') then coalesce(p_projekt,  letzt.projekt_id)  else p_projekt end,
            case when p_art in ('pause','weiter') then coalesce(p_taetigkeit, letzt.taetigkeit) else p_taetigkeit end,
            p_ort,
            case when p_art in ('pause','weiter') then coalesce(p_bereich, letzt.bereich) else p_bereich end,
            case when p_art = 'wechsel' then left(nullif(trim(p_erledigt), ''), 300) end)
    returning * into s;
    return jsonb_build_object('stempel', to_jsonb(s));
  end if;

  -- Ausstempeln
  select * into ein from public.stempel where user_id = auth.uid() and art = 'ein' order by zeit desc limit 1;
  if p_ende_hand is not null then
    if p_ende_hand !~ '^\d\d:\d\d$' then raise exception 'Ende bitte als HH:MM'; end if;
    ende := ((ein.zeit at time zone tz)::date + p_ende_hand::time) at time zone tz;
    if ende <= ein.zeit then ende := ende + interval '1 day'; end if;
    if ende > now() then raise exception 'Das Ende liegt in der Zukunft'; end if;
    v_quelle := 'stempel_nachgetragen';
  end if;
  if extract(epoch from ende - ein.zeit) > 86400 then
    raise exception 'Länger als 24 Stunden eingestempelt – bitte das tatsächliche Ende angeben';
  end if;
  if p_ersetzen is not null then
    delete from public.arbeitszeiten
     where arbeitszeiten.id = any(p_ersetzen) and arbeitszeiten.user_id = auth.uid()
       and arbeitszeiten.quelle = 'hand' and arbeitszeiten.bestaetigt is null;
  end if;
  select array_agg(x order by x.zeit) into segs from public.stempel x
   where x.user_id = auth.uid() and x.zeit >= ein.zeit and x.zeit < ende and x.art in ('ein','wechsel');
  n := coalesce(array_length(segs, 1), 0);

  -- 1. Durchgang: Minuten und Pausen je Abschnitt
  for i in 1..n loop
    seg := segs[i];
    seg_ende := case when i = n then ende else segs[i+1].zeit end;
    pause_sek := 0; pause_ab := null;
    for s in select * from public.stempel where user_id = auth.uid() and zeit >= seg.zeit and zeit < seg_ende
                and art in ('pause','weiter') order by zeit loop
      if s.art = 'pause' then pause_ab := s.zeit;
      elsif pause_ab is not null then pause_sek := pause_sek + extract(epoch from s.zeit - pause_ab); pause_ab := null;
      end if;
    end loop;
    if pause_ab is not null then pause_sek := pause_sek + greatest(0, extract(epoch from seg_ende - pause_ab)); end if;
    seg_min := seg_min || greatest(0, floor((extract(epoch from seg_ende - seg.zeit) - pause_sek) / 60))::integer;
    seg_pause := seg_pause || round(pause_sek / 60)::integer;
    seg_auto := seg_auto || 0;
  end loop;

  -- 2. gesetzliche Ruhepause (§ 11 AZG): über 6 Stunden Tagesarbeitszeit mindestens 30 Minuten
  select coalesce((wert->>'autoPause')::boolean, true) into auto_an from public.einstellungen where schluessel = 'arbeitszeit';
  auto_an := coalesce(auto_an, true);
  if auto_an and n > 0 then
    tag := (ein.zeit at time zone tz)::date;
    select coalesce(sum(minuten), 0), coalesce(sum(pause_min), 0) into tag_arbeit, tag_pause
      from public.arbeitszeiten a where a.user_id = auth.uid() and a.datum = tag and a.art = 'arbeit' and a.quelle like 'stempel%';
    -- Lücke seit dem letzten Ausstempeln am selben Tag zählt als Pause
    select * into vor_aus from public.stempel where user_id = auth.uid() and art = 'aus' and zeit < ein.zeit order by zeit desc limit 1;
    if vor_aus.id is not null and (vor_aus.zeit at time zone tz)::date = tag then
      luecke := floor(extract(epoch from ein.zeit - vor_aus.zeit) / 60);
    end if;
    tag_arbeit := tag_arbeit + (select sum(x) from unnest(seg_min) x);
    tag_pause := tag_pause + (select sum(x) from unnest(seg_pause) x) + luecke;
    if tag_arbeit > 360 and tag_pause < 30 then
      fehlt := 30 - tag_pause;
      -- vom längsten Abschnitt abziehen (dort wird meist auch Pause gemacht)
      k := 1;
      for i in 2..n loop if seg_min[i] > seg_min[k] then k := i; end if; end loop;
      fehlt := least(fehlt, seg_min[k]);
      seg_min[k] := seg_min[k] - fehlt; seg_pause[k] := seg_pause[k] + fehlt; seg_auto[k] := fehlt;
    end if;
  end if;

  -- 3. Durchgang: je Abschnitt ein Eintrag – in den Arbeitszeiten nur die Entfernung, nie die Koordinaten
  for i in 1..n loop
    seg := segs[i];
    letzter := (i = n);
    seg_ende := case when letzter then ende else segs[i+1].zeit end;
    ort_ende := case when letzter then p_ort else segs[i+1].ort end;
    if seg_min[i] = 0 and seg_auto[i] = 0 and not (letzter and array_length(ids, 1) is null) then continue; end if;
    t := seg.taetigkeit;
    if not letzter and segs[i+1].erledigt is not null then t := left(concat_ws('; ', nullif(t, ''), segs[i+1].erledigt), 300); end if;
    if letzter and p_taetigkeit is not null then t := left(concat_ws('; ', nullif(t, ''), p_taetigkeit), 300); end if;
    insert into public.arbeitszeiten (user_id, name, datum, beginn, ende, pause_min, pause_auto, minuten, art, taetigkeit,
                                      standort_id, projekt_id, quelle, ort, bereich)
    values (auth.uid(), coalesce(p_name, seg.name, ein.name), (seg.zeit at time zone tz)::date,
            to_char(seg.zeit at time zone tz, 'HH24:MI'), to_char(seg_ende at time zone tz, 'HH24:MI'),
            least(600, seg_pause[i]), seg_auto[i], seg_min[i], 'arbeit', t,
            coalesce(seg.standort_id, case when letzter then p_standort end),
            coalesce(seg.projekt_id,  case when letzter then p_projekt end), v_quelle,
            case when seg.ort is null and ort_ende is null then null
                 else jsonb_build_object('ein', public.ort_ohne_position(seg.ort), 'aus', public.ort_ohne_position(ort_ende)) end,
            seg.bereich)
    returning id into neu_id;
    ids := ids || neu_id;
  end loop;
  insert into public.stempel (user_id, name, art, standort_id, projekt_id, taetigkeit, ort, bereich, eintrag_id)
  values (auth.uid(), p_name, 'aus', coalesce(segs[n].standort_id, p_standort), coalesce(segs[n].projekt_id, p_projekt),
          segs[n].taetigkeit, p_ort, segs[n].bereich, ids[array_length(ids, 1)])
  returning * into s;
  return jsonb_build_object('stempel', to_jsonb(s),
    'eintraege', coalesce((select jsonb_agg(to_jsonb(a) order by a.beginn) from public.arbeitszeiten a where a.id = any(ids)), '[]'::jsonb),
    'ersetzt', coalesce(to_jsonb(p_ersetzen), '[]'::jsonb));
end $$;
revoke all on function public.stempeln(text, text, uuid, text, jsonb, text, text, text, uuid[], text) from public, anon;
grant execute on function public.stempeln(text, text, uuid, text, jsonb, text, text, text, uuid[], text) to authenticated;

-- Kontrolle: stempeln_fassungen 1, Einstellung mit position/tage, Zustimmungen 0 (noch keine)
select 'ok' as stempeluhr_teil_5,
       (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'stempeln') as stempeln_fassungen,
       (select wert from public.einstellungen where schluessel = 'stempel_standort') as einstellung,
       (select count(*) from public.stempel_zustimmung) as zustimmungen;
