-- Angebote und Rechnungen voll ausgebaut (Büro 01.10.2026). Nur Inhaber.
--   * Rechnungen auch für Wartungs- und Störungseinsätze (protokoll_id) –
--     an deren PDF hängt der Rapportbericht von Lidl
--   * Status mit Datum: versendet, fällig, bezahlt
--   * Nummernkreise ohne Doppelvergabe (Funktion beleg_nummer): TEST-Nummern,
--     solange KPlus führt; echte Nummern erst, wenn der Inhaber umstellt
-- Briefkopf und Texte stehen in einstellungen (Schlüssel „belege“) – nie im
-- Repository. Einmal im Supabase SQL Editor ausführen (nach projekte-ablauf.sql).
-- Mehrfach ausführbar.

alter table public.belege add column if not exists protokoll_id text;   -- Wartungs-/Störungsprotokoll (client_id)
alter table public.belege add column if not exists kunde_id text;
alter table public.belege add column if not exists standort_id text;
alter table public.belege add column if not exists versendet date;
alter table public.belege add column if not exists faellig date;
alter table public.belege add column if not exists bezahlt date;
create index if not exists belege_protokoll_idx on public.belege (protokoll_id);

-- Nummernkreise: je Schlüssel (test_angebot, test_rechnung, angebot, rechnung) und Jahr
create table if not exists public.belegnummern (
  kreis    text not null,
  jahr     integer not null,
  letzte   integer not null default 0,
  primary key (kreis, jahr)
);
alter table public.belegnummern enable row level security;
drop policy if exists "belegnummern inhaber" on public.belegnummern;
create policy "belegnummern inhaber" on public.belegnummern for all to authenticated
  using (public.ist_inhaber()) with check (public.ist_inhaber());

-- nächste Nummer – atomar (zwei Geräte gleichzeitig bekommen nie dieselbe)
-- test: T-A-2026-001 / T-R-2026-001; echt: fortlaufend ohne Jahr (wie KPlus, z. B. 420001)
create or replace function public.beleg_nummer(p_art text, p_test boolean)
returns text language plpgsql security definer set search_path = public as $$
declare k text; j integer := extract(year from now())::integer; n integer;
begin
  if not public.ist_inhaber() then raise exception 'Belegnummern vergibt nur der Inhaber'; end if;
  if p_art not in ('angebot','rechnung') then raise exception 'unbekannte Belegart'; end if;
  k := case when p_test then 'test_' else '' end || p_art;
  if not p_test then j := 0; end if;            -- echte Nummern laufen über die Jahre weiter
  insert into public.belegnummern (kreis, jahr, letzte) values (k, j, 1)
    on conflict (kreis, jahr) do update set letzte = public.belegnummern.letzte + 1
    returning letzte into n;
  if p_test then
    return 'T-' || case when p_art = 'rechnung' then 'R' else 'A' end || '-' || j || '-' || lpad(n::text, 3, '0');
  end if;
  return n::text;
end $$;
revoke all on function public.beleg_nummer(text, boolean) from public, anon;
grant execute on function public.beleg_nummer(text, boolean) to authenticated;

-- schon vorhandene Test-Nummern berücksichtigen (sonst käme T-R-2026-001 doppelt)
insert into public.belegnummern (kreis, jahr, letzte)
  select 'test_' || art, extract(year from datum)::integer, max(split_part(nummer, '-', 4)::integer)
  from public.belege where test and nummer ~ '^T-[AR]-\d{4}-\d+$'
  group by art, extract(year from datum)
on conflict (kreis, jahr) do update set letzte = greatest(public.belegnummern.letzte, excluded.letzte);

-- Kontrolle
select kreis, jahr, letzte from public.belegnummern order by kreis, jahr;
