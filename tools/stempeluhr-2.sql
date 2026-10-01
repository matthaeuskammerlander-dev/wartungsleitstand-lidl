-- Stempeluhr, Teil 2 (Büro 01.10.2026): Tätigkeitsbereich, Umstempeln und
-- Überschneidungen mit Stunden, die von Hand eingetragen sind.
-- Nach stempeluhr.sql einmal im Supabase SQL Editor ausführen. Mehrfach
-- ausführen schadet nicht.
--
-- * Bereich (fahrt, baustelle, wartung, stoerung, werkstatt, buero, sonstiges)
--   an Stempel und Stunden – etwa um Fahrtzeit getrennt auszuweisen.
-- * Umstempeln (art „wechsel“): während man eingestempelt ist, Bereich, Markt
--   oder Projekt wechseln. Beim Ausstempeln entsteht je Abschnitt ein Eintrag.
-- * p_ersetzen: Einträge von Hand, die sich mit der gestempelten Zeit
--   überschneiden und durch sie ersetzt werden sollen – nur eigene, nur „hand“,
--   nur nicht bestätigte; im selben Schritt wie das Ausstempeln.

alter table public.stempel drop constraint if exists stempel_art_check;
alter table public.stempel add constraint stempel_art_check check (art in ('ein','pause','weiter','wechsel','aus'));
alter table public.stempel add column if not exists bereich text;
alter table public.stempel drop constraint if exists stempel_bereich_check;
alter table public.stempel add constraint stempel_bereich_check
  check (bereich is null or bereich in ('fahrt','baustelle','wartung','stoerung','werkstatt','buero','sonstiges'));
alter table public.arbeitszeiten add column if not exists bereich text;
alter table public.arbeitszeiten drop constraint if exists arbeitszeiten_bereich_check;
alter table public.arbeitszeiten add constraint arbeitszeiten_bereich_check
  check (bereich is null or bereich in ('fahrt','baustelle','wartung','stoerung','werkstatt','buero','sonstiges'));

drop function if exists public.stempeln(text, text, uuid, text, jsonb, text, text);
create or replace function public.stempeln(p_art text, p_standort text default null, p_projekt uuid default null,
  p_taetigkeit text default null, p_ort jsonb default null, p_name text default null, p_ende_hand text default null,
  p_bereich text default null, p_ersetzen uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tz constant text := 'Europe/Vienna';
  letzt public.stempel; ein public.stempel; s public.stempel; seg public.stempel;
  segs public.stempel[]; n integer; i integer;
  pause_ab timestamptz; pause_sek numeric; ende timestamptz := now(); seg_ende timestamptz;
  v_quelle text := 'stempel'; min integer; neu_id uuid; ids uuid[] := '{}'; t text; letzter boolean; ort_ende jsonb;
begin
  if auth.uid() is null or not public.darf_schreiben() then raise exception 'Stempeln ist mit diesem Konto nicht möglich'; end if;
  if p_art not in ('ein','pause','weiter','wechsel','aus') then raise exception 'unbekannte Stempelart'; end if;
  if p_bereich is not null and p_bereich not in ('fahrt','baustelle','wartung','stoerung','werkstatt','buero','sonstiges') then
    raise exception 'unbekannter Bereich';
  end if;
  if p_ort is not null and (p_ort ? 'lat' or p_ort ? 'lon' or p_ort ? 'latitude' or p_ort ? 'longitude') then
    raise exception 'Koordinaten werden nicht gespeichert';
  end if;
  select * into letzt from public.stempel where user_id = auth.uid() order by zeit desc limit 1;
  if p_art = 'ein' and letzt.id is not null and letzt.art <> 'aus' then raise exception 'Du bist schon eingestempelt'; end if;
  if p_art in ('pause','wechsel') and (letzt.id is null or letzt.art not in ('ein','weiter','wechsel')) then
    raise exception '% geht nur, wenn du eingestempelt bist (nicht in der Pause)', case p_art when 'pause' then 'Pause' else 'Umstempeln' end;
  end if;
  if p_art = 'weiter' and (letzt.id is null or letzt.art <> 'pause') then raise exception 'Weiter geht nur nach einer Pause'; end if;
  if p_art = 'aus' and (letzt.id is null or letzt.art = 'aus') then raise exception 'Du bist nicht eingestempelt'; end if;

  if p_art <> 'aus' then
    -- Pause/Weiter behalten, was gerade gilt; Ein und Umstempeln nehmen die neuen Angaben
    insert into public.stempel (user_id, name, art, standort_id, projekt_id, taetigkeit, ort, bereich)
    values (auth.uid(), p_name, p_art,
            case when p_art in ('pause','weiter') then coalesce(p_standort, letzt.standort_id) else p_standort end,
            case when p_art in ('pause','weiter') then coalesce(p_projekt,  letzt.projekt_id)  else p_projekt end,
            case when p_art in ('pause','weiter') then coalesce(p_taetigkeit, letzt.taetigkeit) else p_taetigkeit end,
            p_ort,
            case when p_art in ('pause','weiter') then coalesce(p_bereich, letzt.bereich) else p_bereich end)
    returning * into s;
    return jsonb_build_object('stempel', to_jsonb(s));
  end if;

  -- Ausstempeln: ab dem letzten „ein“, je Abschnitt (ein / Umstempeln) ein Eintrag
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
  -- von Hand eingetragene Zeit, die durch die gestempelte ersetzt wird
  if p_ersetzen is not null then
    delete from public.arbeitszeiten
     where arbeitszeiten.id = any(p_ersetzen) and arbeitszeiten.user_id = auth.uid() and arbeitszeiten.quelle = 'hand' and arbeitszeiten.bestaetigt is null;
  end if;
  select array_agg(x order by x.zeit) into segs from public.stempel x
   where x.user_id = auth.uid() and x.zeit >= ein.zeit and x.zeit < ende and x.art in ('ein','wechsel');
  n := coalesce(array_length(segs, 1), 0);
  for i in 1..n loop
    seg := segs[i];
    letzter := (i = n);
    seg_ende := case when letzter then ende else segs[i+1].zeit end;
    ort_ende := case when letzter then p_ort else segs[i+1].ort end;
    pause_sek := 0; pause_ab := null;
    for s in select * from public.stempel where user_id = auth.uid() and zeit >= seg.zeit and zeit < seg_ende
                and art in ('pause','weiter') order by zeit loop
      if s.art = 'pause' then pause_ab := s.zeit;
      elsif pause_ab is not null then pause_sek := pause_sek + extract(epoch from s.zeit - pause_ab); pause_ab := null;
      end if;
    end loop;
    if pause_ab is not null then pause_sek := pause_sek + greatest(0, extract(epoch from seg_ende - pause_ab)); end if;
    min := greatest(0, floor((extract(epoch from seg_ende - seg.zeit) - pause_sek) / 60));
    -- sofort wieder umgestempelt (unter einer Minute): kein eigener Eintrag
    if min = 0 and not (letzter and array_length(ids, 1) is null) then continue; end if;
    t := seg.taetigkeit;
    if letzter and p_taetigkeit is not null then t := left(concat_ws('; ', nullif(t, ''), p_taetigkeit), 300); end if;
    insert into public.arbeitszeiten (user_id, name, datum, beginn, ende, pause_min, minuten, art, taetigkeit,
                                      standort_id, projekt_id, quelle, ort, bereich)
    values (auth.uid(), coalesce(p_name, seg.name, ein.name), (seg.zeit at time zone tz)::date,
            to_char(seg.zeit at time zone tz, 'HH24:MI'), to_char(seg_ende at time zone tz, 'HH24:MI'),
            least(600, round(pause_sek / 60)), min, 'arbeit', t,
            coalesce(seg.standort_id, case when letzter then p_standort end),
            coalesce(seg.projekt_id,  case when letzter then p_projekt end), v_quelle,
            case when seg.ort is null and ort_ende is null then null else jsonb_build_object('ein', seg.ort, 'aus', ort_ende) end,
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
revoke all on function public.stempeln(text, text, uuid, text, jsonb, text, text, text, uuid[]) from public, anon;
grant execute on function public.stempeln(text, text, uuid, text, jsonb, text, text, text, uuid[]) to authenticated;

select 'ok' as stempeluhr_teil_2;
