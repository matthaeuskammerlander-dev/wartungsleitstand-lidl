-- Eine Lidl-Auftragsnummer gibt es nur EINMAL als Störung (Büro 01.10.2026).
-- Die Störungen kommen aus verschiedenen Quellen (Mail, PDF, Rückfragen-Liste,
-- von Hand, mehrere Geräte) – die Datenbank verhindert selbst, dass dieselbe
-- Auftragsnummer zweimal angelegt wird. Gelöschte zählen nicht, Störungen ohne
-- Auftragsnummer (Ausnahme „ohne Lidl-Auftrag“) auch nicht.
-- Einmal im Supabase SQL Editor ausführen; mehrfach schadet nicht. Gibt es
-- schon Doppel, bricht der Befehl mit „could not create unique index“ ab –
-- dann zuerst die Doppel bereinigen (Abfrage unten).

-- Doppel suchen (vor dem Anlegen):
-- select felder->>'auftragsnummer', count(*), string_agg(id, ', ')
--   from public.stammdaten
--  where typ = 'stoerung' and coalesce(trim(felder->>'auftragsnummer'), '') <> ''
--    and coalesce(felder->>'geloescht', '') in ('', 'false')
--  group by 1 having count(*) > 1;

create unique index if not exists stoerung_auftrag_einmal
  on public.stammdaten ((trim(felder->>'auftragsnummer')))
  where typ = 'stoerung'
    and coalesce(trim(felder->>'auftragsnummer'), '') <> ''
    and coalesce(felder->>'geloescht', '') in ('', 'false');

select 'ok' as stoerung_eindeutig;
