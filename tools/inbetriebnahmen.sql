-- -----------------------------------------------------------------------------------------------------
-- Inbetriebnahmeprotokolle für Kälteanlagen (Inhaber 12.10.2026)
-- -----------------------------------------------------------------------------------------------------
-- WAS:   Neue Tabelle public.inbetriebnahmen – je Projekt und Anlage ein Inbetriebnahmeprotokoll nach dem
--        Muster „Inbetriebnahmeprotokoll Kälteanlage“ (Anlage/Betreiber/Ausführung, Kältemittel und CO₂-Äquivalent,
--        Messwerte, Checkliste, Übergabe, Mängel/Abnahme, Unterschrift des Monteurs). KEINE Preise.
--        Gleiche Regeln wie die Arbeitsnachweise (tools/arbeitsnachweise.sql): der Monteur erstellt und
--        unterschreibt unter seinem eigenen Konto, unterschrieben = fest (Korrektur nur mit Grund), löschen nur Inhaber.
-- WARUM: Inhaber 12.10.2026: „Inbetriebnahmeprotokoll muss erstellt werden … soll man natürlich in dem Projekt
--        erstellen können“ (zuerst für Saalfelden).
-- WIE:   Im Supabase-SQL-Editor einmal ausführen (Projekt crvqnsmepwmqdplrenqm). Braucht public.darf_schreiben(),
--        public.ist_inhaber() und public.an_konto_name() (aus tools/arbeitsnachweise.sql).
-- -----------------------------------------------------------------------------------------------------

create table if not exists public.inbetriebnahmen (
  id             uuid primary key default gen_random_uuid(),
  projekt_id     uuid not null references public.projekte(id) on delete cascade,
  nummer         integer not null check (nummer between 1 and 9999),     -- laufend je Projekt (vergibt die App)
  anlage_id      text,                                                    -- Anlage am Markt (Kennung der ersten Zeile), freiwillig
  datum          date not null default current_date,                      -- Datum der Inbetriebnahme
  monteur        text,                                                    -- Monteur (setzt der Trigger)
  daten          jsonb not null default '{}'::jsonb,                      -- Kopf, Kältemittel, Messwerte, Checkliste, Übergabe – keine Preise
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
create index if not exists inbetriebnahmen_projekt_idx on public.inbetriebnahmen (projekt_id);
alter table public.inbetriebnahmen enable row level security;

drop policy if exists "inbetriebnahmen lesen"    on public.inbetriebnahmen;
drop policy if exists "inbetriebnahmen anlegen"  on public.inbetriebnahmen;
drop policy if exists "inbetriebnahmen aendern"  on public.inbetriebnahmen;
drop policy if exists "inbetriebnahmen loeschen" on public.inbetriebnahmen;
create policy "inbetriebnahmen lesen"    on public.inbetriebnahmen for select to authenticated using (public.darf_schreiben());
create policy "inbetriebnahmen anlegen"  on public.inbetriebnahmen for insert to authenticated
  with check (public.darf_schreiben() and erstellt_von = auth.uid());
create policy "inbetriebnahmen aendern"  on public.inbetriebnahmen for update to authenticated
  using (public.darf_schreiben() and (erstellt_von = auth.uid() or public.ist_inhaber()))
  with check (public.darf_schreiben() and (erstellt_von = auth.uid() or public.ist_inhaber()));
create policy "inbetriebnahmen loeschen" on public.inbetriebnahmen for delete to authenticated using (public.ist_inhaber());
revoke all on public.inbetriebnahmen from anon;
grant select, insert, update, delete on public.inbetriebnahmen to authenticated;

-- Prüfregeln wie arbeitsnachweise_pruefen: eigenes Konto und eigener Name, Unterschrift nur vom Monteur selbst,
-- unterschrieben = fest (Korrektur nur mit Grund). Ohne angemeldetes Konto (SQL-Editor des Inhabers, der einen Entwurf
-- für einen Monteur anlegt) bleiben die mitgegebenen erstellt_von/monteur stehen – ein angemeldeter Benutzer kann das
-- nicht ausnutzen, für ihn ist auth.uid() nie leer.
create or replace function public.inbetriebnahmen_pruefen() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n_alt int; n_neu int;
begin
  if tg_op = 'INSERT' then
    new.erstellt_von := coalesce(auth.uid(), new.erstellt_von);
    new.monteur := coalesce(public.an_konto_name(), new.monteur);
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
      if n_neu < n_alt or (n_alt > 0 and (select coalesce(jsonb_agg(t.e order by t.i), '[]'::jsonb)
            from jsonb_array_elements(coalesce(new.korrekturen,'[]'::jsonb)) with ordinality t(e, i) where t.i <= n_alt)
          is distinct from coalesce(old.korrekturen,'[]'::jsonb)) then
        raise exception 'Inbetriebnahmeprotokoll: Korrekturen bleiben stehen';
      end if;
      if (new.daten is distinct from old.daten or new.datum is distinct from old.datum or new.anlage_id is distinct from old.anlage_id)
         and not (n_neu > n_alt and length(btrim(coalesce(new.korrekturen -> (n_neu - 1) ->> 'grund',''))) > 0) then
        raise exception 'Inbetriebnahmeprotokoll ist unterschrieben – ändern nur als Korrektur mit Grund';
      end if;
    else
      new.korrekturen := old.korrekturen;
      if new.unterschrift is not null then
        if auth.uid() is distinct from old.erstellt_von then
          raise exception 'Inbetriebnahmeprotokoll: unterschreiben darf nur der Monteur selbst';
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
drop trigger if exists inbetriebnahmen_pruefen on public.inbetriebnahmen;
create trigger inbetriebnahmen_pruefen before insert or update on public.inbetriebnahmen
  for each row execute function public.inbetriebnahmen_pruefen();

-- Kontrolle: muss eine Zeile mit „angelegt = ja“ zeigen
select 'inbetriebnahmen' as tabelle, (to_regclass('public.inbetriebnahmen') is not null) as angelegt;
