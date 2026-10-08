-- Stammdaten leicht laden (Inhaber 08.10.2026: Supabase meldete „Egress Exceeded“ – 7,6 GB im Monat bei 49 MB Datenbank).
-- Ursache: Störungen tragen das Lidl-Auftrags-PDF (felder.pdfDaten) und Seitenbilder (felder.seiten) direkt in den
-- Stammdaten; die App lud bei jedem Start und Nachladen ALLE Stammdaten samt dieser Felder (rund 11 MB).
--
-- 1. Sicht stammdaten_leicht: wie stammdaten, aber ohne pdfDaten/seiten – stattdessen felder._schwer = true.
--    security_invoker: es gelten die Leseregeln der Tabelle stammdaten für die angemeldete Person (nichts wird lockerer).
-- 2. Trigger stammdaten_schwer_behalten: speichert die App eine Störung, die sie ohne PDF geladen hat, bleiben
--    pdfDaten/pdfName/seiten der Datenbank erhalten (nur mit felder._pdfWeg / _seitenWeg bewusst entfernbar).
--    Hilfsfelder mit „_“ (_schwer, _pdfWeg, _seitenWeg) werden nie gespeichert.
-- Mehrfach ausführbar.

-- Spaltenliste wie stammdaten (felder ersetzt), daher dynamisch
do $$
declare spalten text;
begin
  select string_agg(case when column_name = 'felder'
           then $f$case when s.felder ? 'pdfDaten' or s.felder ? 'seiten'
                   then (s.felder - 'pdfDaten' - 'seiten') || jsonb_build_object('_schwer', true)
                   else s.felder end as felder$f$
           else 's.' || quote_ident(column_name) end, ', ' order by ordinal_position)
    into spalten
    from information_schema.columns
   where table_schema = 'public' and table_name = 'stammdaten';
  execute 'drop view if exists public.stammdaten_leicht';
  execute 'create view public.stammdaten_leicht with (security_invoker = true) as select ' || spalten || ' from public.stammdaten s';
end $$;

grant select on public.stammdaten_leicht to authenticated;

create or replace function public.stammdaten_schwer_behalten() returns trigger
language plpgsql as $$
begin
  if new.felder is null then return new; end if;
  if tg_op = 'UPDATE' and old.felder is not null then
    if coalesce(old.felder->>'pdfDaten', '') <> '' and coalesce(new.felder->>'pdfDaten', '') = ''
       and not coalesce((new.felder->>'_pdfWeg')::boolean, false) then
      new.felder := new.felder || jsonb_build_object('pdfDaten', old.felder->'pdfDaten');
      if coalesce(new.felder->>'pdfName', '') = '' and old.felder ? 'pdfName' then
        new.felder := new.felder || jsonb_build_object('pdfName', old.felder->'pdfName');
      end if;
    end if;
    if (case when jsonb_typeof(old.felder->'seiten') = 'array' then jsonb_array_length(old.felder->'seiten') else 0 end) > 0
       and (case when jsonb_typeof(new.felder->'seiten') = 'array' then jsonb_array_length(new.felder->'seiten') else 0 end) = 0
       and not coalesce((new.felder->>'_seitenWeg')::boolean, false) then
      new.felder := new.felder || jsonb_build_object('seiten', old.felder->'seiten');
    end if;
  end if;
  new.felder := new.felder - '_schwer' - '_pdfWeg' - '_seitenWeg';
  return new;
end $$;

drop trigger if exists stammdaten_schwer_behalten on public.stammdaten;
create trigger stammdaten_schwer_behalten before insert or update on public.stammdaten
  for each row execute function public.stammdaten_schwer_behalten();

-- Kontrolle: wie viel lädt die App jetzt beim Start (vorher ~11 MB)?
select pg_size_pretty(sum(octet_length(x::text))::bigint) as stammdaten_leicht from public.stammdaten_leicht x;
