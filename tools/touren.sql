-- Touren, die das Büro an einen Techniker schickt – im Supabase SQL Editor
-- einmal ausführen. Mehrfach ausführen schadet nicht.
--
-- Je Zeile eine geplante Tour (Märkte in Reihenfolge, was dort zu tun ist,
-- Startpunkt) für genau eine Person. Sehen darf sie der Empfänger, wer sie
-- geschickt hat und das Büro; abhaken („erledigt“) darf der Empfänger.
create table if not exists public.touren (
  id        uuid primary key default gen_random_uuid(),
  erstellt  timestamptz not null default now(),
  von       uuid default auth.uid() references auth.users(id) on delete set null,
  von_name  text,
  an        uuid not null references auth.users(id) on delete cascade,
  an_name   text,
  titel     text check (titel is null or length(titel) <= 80),
  notiz     text check (notiz is null or length(notiz) <= 500),
  daten     jsonb not null,
  erledigt  timestamptz
);
create index if not exists touren_an_idx on public.touren (an, erstellt desc);
alter table public.touren enable row level security;

drop policy if exists "touren lesen" on public.touren;
create policy "touren lesen" on public.touren for select to authenticated
  using (an = auth.uid() or von = auth.uid() or public.ist_admin());
drop policy if exists "touren schicken" on public.touren;
create policy "touren schicken" on public.touren for insert to authenticated
  with check (public.ist_admin() and von = auth.uid());
drop policy if exists "touren abhaken" on public.touren;
create policy "touren abhaken" on public.touren for update to authenticated
  using (an = auth.uid() or public.ist_admin()) with check (an = auth.uid() or public.ist_admin());
drop policy if exists "touren loeschen" on public.touren;
create policy "touren loeschen" on public.touren for delete to authenticated
  using (public.ist_admin());

revoke all on public.touren from anon;
grant select, insert, update, delete on public.touren to authenticated;
