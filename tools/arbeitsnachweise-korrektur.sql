-- Arbeitsnachweise: Korrektur mit Grund ging in der Datenbank nie beim ERSTEN Mal (Inhaber 06.10.2026:
-- „Darko gibt einen Grund an, trotzdem kommt die Meldung“). Die Prüfung verglich den ersten Eintrag der
-- Korrekturliste mit dem alten – den gibt es bei der ersten Korrektur noch nicht. Jetzt: die bisherigen Korrekturen
-- müssen genau stehen bleiben, eine neue mit Grund kommt dazu. Sonst unverändert (eigener Name, Unterschrift nur
-- vom Monteur, unterschrieben = fest). Gefahrlos mehrmals ausführbar.

create or replace function public.arbeitsnachweise_pruefen() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n_alt int; n_neu int;
begin
  if tg_op = 'INSERT' then
    new.erstellt_von := auth.uid();
    new.monteur := public.an_konto_name();
    new.erstellt := now();
    new.korrekturen := '[]'::jsonb;
    new.unterschrieben := case when new.unterschrift is not null then now() else null end;
  else
    new.erstellt_von := old.erstellt_von;
    new.monteur := old.monteur;
    new.projekt_id := old.projekt_id;
    new.nummer := old.nummer;
    new.erstellt := old.erstellt;
    if old.unterschrieben is not null then
      new.unterschrift := old.unterschrift;
      new.unterschrieben := old.unterschrieben;
      n_alt := jsonb_array_length(coalesce(old.korrekturen,'[]'::jsonb));
      n_neu := jsonb_array_length(coalesce(new.korrekturen,'[]'::jsonb));
      -- die bisherigen Korrekturen bleiben genau stehen (vorher: Vergleich nur des ersten Eintrags – bei der ERSTEN Korrektur
      -- fehlte der alte und jede erste Korrektur wurde abgelehnt; Inhaber 06.10.2026)
      if n_neu < n_alt or (n_alt > 0 and (select coalesce(jsonb_agg(t.e order by t.i), '[]'::jsonb)
            from jsonb_array_elements(coalesce(new.korrekturen,'[]'::jsonb)) with ordinality t(e, i) where t.i <= n_alt)
          is distinct from coalesce(old.korrekturen,'[]'::jsonb)) then
        raise exception 'Arbeitsnachweis: Korrekturen bleiben stehen';
      end if;
      if (new.daten is distinct from old.daten or new.datum is distinct from old.datum)
         and not (n_neu > n_alt and length(btrim(coalesce(new.korrekturen -> (n_neu - 1) ->> 'grund',''))) > 0) then
        raise exception 'Arbeitsnachweis ist unterschrieben – ändern nur als Korrektur mit Grund';
      end if;
    else
      new.korrekturen := old.korrekturen;
      if new.unterschrift is not null then
        if auth.uid() is distinct from old.erstellt_von then
          raise exception 'Arbeitsnachweis: unterschreiben darf nur der Monteur selbst';
        end if;
        new.unterschrieben := now();
      else
        new.unterschrieben := null;
      end if;
    end if;
  end if;
  new.geaendert := now();
  return new;
end $$;


-- Kontrolle
select 'arbeitsnachweise_pruefen neu' as was, case when position('with ordinality' in prosrc) > 0 then 'ja' else 'NEIN' end as ok
  from pg_proc where proname = 'arbeitsnachweise_pruefen';
