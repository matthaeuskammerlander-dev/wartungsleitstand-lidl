-- Wochenübersicht: Montag früh eine Push-Nachricht an Inhaber und Admins.
-- Im Supabase SQL Editor einmal ausführen (nach tools/push.sql).
--
-- Die Termine rechnet nur die App. Darum schreibt sie ihren Stand (überfällig,
-- diese Woche fällig, offene Störungen, wiederkehrende Störungen, Leck-Verdacht)
-- in die Tabelle kennzahlen, sobald ein Admin die App benutzt (höchstens
-- stündlich). Der Zeitplan hier legt daraus Montag um 05:00 UTC (07:00 Sommer-
-- bzw. 06:00 Winterzeit) ein Push-Ereignis an – die Funktion „push“ verschickt es.
create extension if not exists pg_cron;

create table if not exists public.kennzahlen (
  id    int primary key default 1 check (id = 1),
  stand timestamptz not null default now(),
  werte jsonb not null default '{}'::jsonb
);
alter table public.kennzahlen enable row level security;
drop policy if exists "kennzahlen lesen" on public.kennzahlen;
create policy "kennzahlen lesen" on public.kennzahlen for select to authenticated using (public.darf_schreiben());
drop policy if exists "kennzahlen schreiben" on public.kennzahlen;
create policy "kennzahlen schreiben" on public.kennzahlen for insert to authenticated with check (public.ist_admin());
drop policy if exists "kennzahlen aendern" on public.kennzahlen;
create policy "kennzahlen aendern" on public.kennzahlen for update to authenticated using (public.ist_admin()) with check (public.ist_admin());
grant select, insert, update on public.kennzahlen to authenticated;

-- Montag 05:00 UTC: Ereignis für Inhaber und Admins (nur_rolle mit Komma)
create or replace function public.wochenuebersicht_anstossen() returns void
language plpgsql security definer set search_path = public as $$
declare k record;
begin
  select * into k from public.kennzahlen where id = 1;
  insert into public.push_ereignisse (art, titel, text, ziel, nur_rolle)
  values ('wochen', 'Wochenübersicht',
          coalesce(k.werte->>'text', 'Was diese Woche ansteht – in der App unter Fällig.')
            || case when k.stand is not null and k.stand < now() - interval '3 days'
                    then ' (Stand ' || to_char(k.stand at time zone 'Europe/Vienna', 'DD.MM.') || ')' else '' end,
          'wochen', 'inhaber,admin');
end $$;
select cron.unschedule(jobid) from cron.job where jobname = 'wochenuebersicht';
select cron.schedule('wochenuebersicht', '0 5 * * 1', $$select public.wochenuebersicht_anstossen();$$);
