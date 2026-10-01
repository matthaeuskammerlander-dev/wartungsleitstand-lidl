-- Der Name im Abschluss ist immer die Techniker/in oben (Büro 01.10.2026):
-- „Der (erste) Techniker ist mit dem Account verbunden und macht den Abschluss.
--  Er ist verantwortlich für die Arbeit und das Protokoll.“
-- Die App setzt Techniker/in aus dem angemeldeten Konto und sperrt das Feld;
-- die Datenbank sorgt zusätzlich dafür, dass name_techniker nie abweicht.
-- Wer sonst dabei war, steht in mitarbeiter (Weitere/r Techniker/in).
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.

create or replace function public.protokoll_abschluss_name() returns trigger
language plpgsql set search_path = public as $$
begin
  if nullif(btrim(coalesce(new.techniker,'')),'') is not null then
    new.name_techniker := new.techniker;
  end if;
  return new;
end $$;
drop trigger if exists protokoll_abschluss_name on public.protokolle;
create trigger protokoll_abschluss_name before insert or update on public.protokolle
  for each row execute function public.protokoll_abschluss_name();

-- Kontrolle: gespeicherte Protokolle, bei denen der Name im Abschluss abweicht
-- (werden NICHT automatisch geändert – berichtigt über „Korrigieren“ in der App)
select client_id, datum, techniker, name_techniker
  from public.protokolle
 where coalesce(btrim(techniker),'') <> '' and coalesce(name_techniker,'') <> techniker
 order by datum desc;
