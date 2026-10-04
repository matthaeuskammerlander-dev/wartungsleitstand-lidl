-- Stempeluhr ↔ Kalender: Abgleich (Büro 04.10.2026): „Die Stempeluhr hat die oberste Priorität bei der
-- Arbeitszeiterfassung. Am Ende soll die Arbeitszeit aus der Zeiterfassung mit dem Kalender abgeglichen werden.“
-- Techniker stempeln am Morgen ein und am Abend aus; Umstempeln wird vergessen, nicht jeder Termin wird gemacht.
-- stempel_abgleich(Tag, Teile) teilt die GESTEMPELTE Zeit eines Tages nach den Terminen auf (Bereich, Markt,
-- Projekt, Termin). Die Zeit selbst ändert sich nicht: die Teile müssen jeden zusammenhängenden gestempelten
-- Block lückenlos und genau ausfüllen; Pause und angerechnete Minuten des Blocks bleiben in Summe gleich
-- (die Pause kommt zum längsten Teil). Quelle „stempel_abgeglichen“ – zählt weiter als gestempelt.
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.

alter table public.arbeitszeiten drop constraint if exists arbeitszeiten_quelle_check;
alter table public.arbeitszeiten add constraint arbeitszeiten_quelle_check
  check (quelle in ('hand','stempel','stempel_geaendert','stempel_nachgetragen','stempel_abgeglichen','kalender'));

-- nachträglich geänderte Zeiten: auch abgeglichene gelten dann als „geändert“
create or replace function public.arbeitszeit_stempel_merken() returns trigger
language plpgsql as $$
declare zeit_geaendert boolean := new.datum is distinct from old.datum or new.beginn is distinct from old.beginn
          or new.ende is distinct from old.ende or new.pause_min is distinct from old.pause_min or new.minuten is distinct from old.minuten;
begin
  if coalesce(current_setting('ukt.kalender_sync', true), '') = '1' then return new; end if;
  if old.quelle = 'kalender' and (zeit_geaendert or new.art is distinct from old.art) then
    new.quelle := 'hand';
  elsif old.quelle in ('stempel','stempel_nachgetragen','stempel_abgeglichen') and zeit_geaendert then
    new.quelle := 'stempel_geaendert';
  elsif new.quelle is distinct from old.quelle and not public.ist_inhaber() then
    new.quelle := old.quelle;
  end if;
  return new;
end $$;

create or replace function public.hhmm_min(t text) returns integer
language sql immutable as $$
  select case when t ~ '^\d\d:\d\d$' then split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int end
$$;

create or replace function public.stempel_abgleich(p_datum date, p_teile jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.arbeitszeiten; bl public.arbeitszeiten[] := '{}'; bloecke jsonb := '[]'; erg jsonb := '[]'; weg uuid[] := '{}';
  t jsonb; teile jsonb; n int; i int; cur int; b0 int; e0 int; lang int; li int; summe_min int; summe_pause int; summe_auto int;
  andere int; nid uuid; erster_id uuid; ort0 jsonb; q text; blk_ende int := -1; k int;
begin
  if auth.uid() is null or not public.darf_schreiben() then raise exception 'Mit diesem Konto nicht möglich'; end if;
  if jsonb_typeof(p_teile) <> 'array' or jsonb_array_length(p_teile) = 0 or jsonb_array_length(p_teile) > 60 then raise exception 'Keine Abschnitte'; end if;
  -- alle Teile sauber?
  for t in select * from jsonb_array_elements(p_teile) loop
    if public.hhmm_min(t->>'beginn') is null or public.hhmm_min(t->>'ende') is null then raise exception 'Zeit bitte als HH:MM'; end if;
    if public.hhmm_min(t->>'ende') <= public.hhmm_min(t->>'beginn') then raise exception 'Ein Abschnitt hat keine Dauer (% – %)', t->>'beginn', t->>'ende'; end if;
    if length(coalesce(t->>'bereich','')) > 40 or length(coalesce(t->>'taetigkeit','')) > 300 then raise exception 'Text zu lang'; end if;
  end loop;
  -- die gestempelten Einträge des Tages in zusammenhängenden Blöcken (Ende = nächster Beginn)
  for a in select * from public.arbeitszeiten
            where user_id = auth.uid() and datum = p_datum and art = 'arbeit' and quelle like 'stempel%'
              and bestaetigt is null and beginn is not null and ende is not null
              and public.hhmm_min(ende) > public.hhmm_min(beginn)
            order by beginn loop
    if array_length(bl,1) is not null and public.hhmm_min(a.beginn) <> blk_ende then
      bloecke := bloecke || jsonb_build_array(to_jsonb(bl)); bl := '{}';
    end if;
    bl := bl || a; blk_ende := public.hhmm_min(a.ende);
  end loop;
  if array_length(bl,1) is not null then bloecke := bloecke || jsonb_build_array(to_jsonb(bl)); end if;
  if jsonb_array_length(bloecke) = 0 then raise exception 'An diesem Tag gibt es keine gestempelte Zeit, die sich aufteilen lässt'; end if;

  for k in 0 .. jsonb_array_length(bloecke) - 1 loop
    b0 := public.hhmm_min(bloecke->k->0->>'beginn');
    e0 := public.hhmm_min(bloecke->k->(jsonb_array_length(bloecke->k)-1)->>'ende');
    select coalesce(jsonb_agg(x order by public.hhmm_min(x->>'beginn')), '[]') into teile
      from jsonb_array_elements(p_teile) x where public.hhmm_min(x->>'beginn') >= b0 and public.hhmm_min(x->>'ende') <= e0;
    n := jsonb_array_length(teile);
    if n = 0 then continue; end if;   -- diesen Block nicht anfassen
    -- lückenlos und genau die gestempelte Zeit
    cur := b0; lang := -1; li := 0;
    for i in 0 .. n - 1 loop
      t := teile->i;
      if public.hhmm_min(t->>'beginn') <> cur then raise exception 'Die Abschnitte müssen lückenlos sein (bei %)', t->>'beginn'; end if;
      if public.hhmm_min(t->>'ende') - cur > lang then lang := public.hhmm_min(t->>'ende') - cur; li := i; end if;
      cur := public.hhmm_min(t->>'ende');
    end loop;
    if cur <> e0 then raise exception 'Die Abschnitte müssen genau die gestempelte Zeit ergeben (bis %)', bloecke->k->(jsonb_array_length(bloecke->k)-1)->>'ende'; end if;
    select coalesce(sum((x->>'minuten')::int),0), coalesce(sum((x->>'pause_min')::int),0), coalesce(sum((x->>'pause_auto')::int),0)
      into summe_min, summe_pause, summe_auto from jsonb_array_elements(bloecke->k) x;
    andere := 0;
    for i in 0 .. n - 1 loop if i <> li then andere := andere + public.hhmm_min(teile->i->>'ende') - public.hhmm_min(teile->i->>'beginn'); end if; end loop;
    if summe_min - andere < 0 then raise exception 'Die Pause passt in keinen Abschnitt – bitte einen Abschnitt länger machen'; end if;
    -- Quelle: nachgetragen/geändert bleibt sichtbar, sonst „abgeglichen“
    q := case when exists (select 1 from jsonb_array_elements(bloecke->k) x where x->>'quelle' in ('stempel_geaendert','stempel_nachgetragen'))
              then 'stempel_geaendert' else 'stempel_abgeglichen' end;
    ort0 := bloecke->k->0->'ort';
    erster_id := null;
    for i in 0 .. n - 1 loop
      t := teile->i;
      insert into public.arbeitszeiten (user_id, name, datum, beginn, ende, pause_min, pause_auto, minuten, art, taetigkeit,
                                        standort_id, projekt_id, planung_id, quelle, ort, bereich)
      values (auth.uid(), bloecke->k->0->>'name', p_datum, t->>'beginn', t->>'ende',
              case when i = li then least(600, summe_pause) else 0 end, case when i = li then least(600, summe_auto) else 0 end,
              case when i = li then summe_min - andere else public.hhmm_min(t->>'ende') - public.hhmm_min(t->>'beginn') end,
              'arbeit', nullif(t->>'taetigkeit',''), nullif(t->>'standort_id',''), nullif(t->>'projekt_id','')::uuid,
              nullif(t->>'planung_id','')::uuid, q, case when i = 0 then ort0 end, nullif(t->>'bereich',''))
      returning id into nid;
      if erster_id is null then erster_id := nid; end if;
      erg := erg || jsonb_build_array((select to_jsonb(z) from public.arbeitszeiten z where z.id = nid));
    end loop;
    -- die alten Einträge des Blocks ersetzen; Stempel zeigen auf den ersten neuen
    for i in 0 .. jsonb_array_length(bloecke->k) - 1 loop
      weg := weg || (bloecke->k->i->>'id')::uuid;
    end loop;
    update public.stempel set eintrag_id = erster_id where eintrag_id = any(weg);
    delete from public.arbeitszeiten where id = any(weg) and user_id = auth.uid() and bestaetigt is null;
  end loop;
  return jsonb_build_object('eintraege', erg, 'ersetzt', to_jsonb(weg));
end $$;
revoke all on function public.stempel_abgleich(date, jsonb) from public, anon;
grant execute on function public.stempel_abgleich(date, jsonb) to authenticated;
