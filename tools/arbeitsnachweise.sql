-- -----------------------------------------------------------------------------------------------------
-- Arbeitsnachweise für Baustellen (Inhaber 06.10.2026)
-- -----------------------------------------------------------------------------------------------------
-- WAS:   Neue Tabelle public.arbeitsnachweise (je Projekt, wie das Papierformular „Arbeitsnachweis“:
--        Auftraggeber, Objekt, Zeilen Datum/Monteure/von/bis/Pause/Stunden, Montage/Wartung/Reparatur/Garantie,
--        Arbeiten beendet, Ausgeführte Arbeiten, Materialaufwand, Güte- und Funktionsprüfungen, Besondere
--        Vorkommnisse, Unterschrift des verantwortlichen Monteurs). KEINE Preise.
--        Dazu die Funktion public.projekt_stunden(p_projekt): die auf EIN Projekt gebuchten Arbeitszeiten aller
--        Personen – nur für den Vorschlag im Arbeitsnachweis.
-- WARUM: Inhaber 06.10.2026: „Man soll bei Baustellen die Möglichkeit haben, Arbeitsnachweise zu erstellen. Das ist
--        zum Rechnungschreiben wichtig.“ – „Der Techniker sollte für den Arbeitsnachweis auch die Stunden der anderen
--        sehen können.“
-- WER DARF WAS (danach):
--   * lesen: alle, die mitarbeiten (darf_schreiben – nicht Kunde, nicht Präsentation),
--   * anlegen: alle, die mitarbeiten – immer unter dem EIGENEN Konto und Namen (der Trigger setzt erstellt_von und
--     monteur selbst; „Protokolle nur unter eigenem Namen“ gilt hier genauso),
--   * ändern: wer ihn angelegt hat, und der Inhaber. Unterschreiben nur, wer ihn angelegt hat (der Monteur selbst).
--     Unterschrieben ist er fest: Inhalt ändern nur als Korrektur mit Grund (Eintrag in korrekturen), Unterschrift,
--     Monteur, Projekt und Nummer bleiben,
--   * löschen: nur der Inhaber.
--   * projekt_stunden(): alle, die mitarbeiten – nur Datum, Name, von, bis, Pause, Minuten, Bereich, Tätigkeit der
--     Arbeitszeiten (art „arbeit“) mit projekt_id = genau diesem Projekt. Keine Abwesenheiten, keine Notizen, kein Ort,
--     keine Entfernung, keine anderen Projekte. Die Leseregel der Tabelle arbeitszeiten bleibt UNVERÄNDERT
--     (Techniker sehen in „Meine Arbeitszeit“ weiter nur ihre eigenen).
-- Mehrfach ausführbar.

create table if not exists public.arbeitsnachweise (
  id             uuid primary key default gen_random_uuid(),
  projekt_id     uuid not null references public.projekte(id) on delete cascade,
  nummer         integer not null check (nummer between 1 and 9999),     -- laufend je Projekt (vergibt die App)
  datum          date not null default current_date,
  monteur        text,                                                    -- verantwortlicher Monteur (setzt der Trigger)
  daten          jsonb not null default '{}'::jsonb,                      -- Kopf, Zeilen, Ankreuzfelder, Textblöcke – keine Preise
  unterschrift   text check (unterschrift is null or length(unterschrift) <= 400000),
  unterschrieben timestamptz,
  korrekturen    jsonb not null default '[]'::jsonb,                      -- [{zeit, von, grund}]
  pdf_pfad       text,
  erstellt       timestamptz not null default now(),
  erstellt_von   uuid default auth.uid(),
  geaendert      timestamptz not null default now(),
  geaendert_von  text,
  unique (projekt_id, nummer)
);
create index if not exists arbeitsnachweise_projekt_idx on public.arbeitsnachweise (projekt_id);
alter table public.arbeitsnachweise enable row level security;

drop policy if exists "arbeitsnachweise lesen"    on public.arbeitsnachweise;
drop policy if exists "arbeitsnachweise anlegen"  on public.arbeitsnachweise;
drop policy if exists "arbeitsnachweise aendern"  on public.arbeitsnachweise;
drop policy if exists "arbeitsnachweise loeschen" on public.arbeitsnachweise;
create policy "arbeitsnachweise lesen"    on public.arbeitsnachweise for select to authenticated using (public.darf_schreiben());
create policy "arbeitsnachweise anlegen"  on public.arbeitsnachweise for insert to authenticated
  with check (public.darf_schreiben() and erstellt_von = auth.uid());
create policy "arbeitsnachweise aendern"  on public.arbeitsnachweise for update to authenticated
  using (public.darf_schreiben() and (erstellt_von = auth.uid() or public.ist_inhaber()))
  with check (public.darf_schreiben() and (erstellt_von = auth.uid() or public.ist_inhaber()));
create policy "arbeitsnachweise loeschen" on public.arbeitsnachweise for delete to authenticated using (public.ist_inhaber());
revoke all on public.arbeitsnachweise from anon;
grant select, insert, update, delete on public.arbeitsnachweise to authenticated;

-- Name des angemeldeten Kontos – wie team_liste() (chat-direkt.sql)
create or replace function public.an_konto_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(r.name,''), nullif(u.raw_user_meta_data->'einstellungen'->>'name',''), split_part(u.email,'@',1))
    from auth.users u left join public.rollen r on r.user_id = u.id
   where u.id = auth.uid();
$$;
revoke all on function public.an_konto_name() from public, anon;
grant execute on function public.an_konto_name() to authenticated;

-- Prüfregeln: eigener Name, Unterschrift nur vom Monteur selbst, unterschrieben = fest (Korrektur nur mit Grund)
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
      if n_neu < n_alt or coalesce(new.korrekturen,'[]'::jsonb) -> 0 is distinct from coalesce(old.korrekturen,'[]'::jsonb) -> 0 then
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
drop trigger if exists arbeitsnachweise_pruefen on public.arbeitsnachweise;
create trigger arbeitsnachweise_pruefen before insert or update on public.arbeitsnachweise
  for each row execute function public.arbeitsnachweise_pruefen();

-- Stunden eines Projekts für den Arbeitsnachweis (Inhaber 06.10.2026: „auch die Stunden der anderen“) –
-- eng begrenzt: nur dieses Projekt, nur Arbeit, nur diese Spalten
create or replace function public.projekt_stunden(p_projekt uuid)
returns table (id uuid, name text, datum date, beginn text, ende text, pause_min integer, minuten integer, bereich text, taetigkeit text)
language sql stable security definer set search_path = public as $$
  select a.id, a.name, a.datum, a.beginn, a.ende, a.pause_min, a.minuten, a.bereich, a.taetigkeit
    from public.arbeitszeiten a
   where public.darf_schreiben()
     and p_projekt is not null
     and a.projekt_id = p_projekt
     and a.art = 'arbeit'
   order by a.datum, a.beginn;
$$;
revoke all on function public.projekt_stunden(uuid) from public, anon;
grant execute on function public.projekt_stunden(uuid) to authenticated;

-- Kontrolle: muss je Zeile „angelegt = ja“ zeigen
select 'Tabelle arbeitsnachweise' as was, case when to_regclass('public.arbeitsnachweise') is not null then 'ja' else 'NEIN' end as angelegt
union all
select 'Trigger arbeitsnachweise_pruefen', case when exists (select 1 from pg_trigger where tgname = 'arbeitsnachweise_pruefen') then 'ja' else 'NEIN' end
union all
select 'Funktion projekt_stunden', case when exists (select 1 from pg_proc where proname = 'projekt_stunden') then 'ja' else 'NEIN' end;
