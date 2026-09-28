-- Team-Chat – im Supabase SQL Editor einmal ausführen (mehrfach schadet nicht).
-- Voraussetzung: tools/rollen.sql (darf_schreiben, ist_admin) und tools/push.sql.
--
-- Ein gemeinsamer Verlauf für Büro und Techniker; jede Nachricht kann sich
-- auf einen Markt, eine Anlage, eine Störung oder ein Protokoll beziehen
-- (bezug_art/bezug_id) und steht dann in der App auch dort. Fotos liegen im
-- Bucket protokollfotos unter chat/… (die Regel „fotos hochladen“ erlaubt das).
-- Kunde und Präsentation sehen nichts davon.
create table if not exists public.chat (
  id         text primary key,                  -- von der App vergeben (Warteschlange ohne Netz: nie doppelt)
  erstellt   timestamptz not null default now(),
  von        uuid default auth.uid() references auth.users(id) on delete set null,
  von_name   text,
  text       text not null check (length(text) between 1 and 4000),
  bezug_art  text check (bezug_art in ('markt','anlage','stoerung','protokoll')),
  bezug_id   text,
  bezug_text text,
  fotos      jsonb not null default '[]'::jsonb
);
create index if not exists chat_erstellt_idx on public.chat (erstellt desc);
create index if not exists chat_bezug_idx on public.chat (bezug_art, bezug_id);
alter table public.chat enable row level security;
drop policy if exists "chat lesen" on public.chat;
create policy "chat lesen" on public.chat for select to authenticated using (public.darf_schreiben());
drop policy if exists "chat schreiben" on public.chat;
create policy "chat schreiben" on public.chat for insert to authenticated
  with check (public.darf_schreiben() and von = auth.uid());
drop policy if exists "chat eigene loeschen" on public.chat;
create policy "chat eigene loeschen" on public.chat for delete to authenticated
  using (von = auth.uid() or public.ist_admin());
grant select, insert, delete on public.chat to authenticated;

-- Fotos einer gelöschten Nachricht aus dem Speicher nehmen: nur unter chat/…,
-- nur die selbst hochgeladenen (Admins: alle). Protokollfotos bleiben unberührt.
drop policy if exists "chatfotos loeschen" on storage.objects;
create policy "chatfotos loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'protokollfotos' and name like 'chat/%'
         and public.darf_schreiben() and (owner = auth.uid() or public.ist_admin()));

-- neue Nachricht → Push an alle anderen (Absender und Bezug im Titel)
create or replace function public.push_aus_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.push_ereignisse (art, titel, text, ziel, von_user)
  values ('chat',
          left(coalesce(nullif(new.von_name,''),'Jemand') || case when coalesce(new.bezug_text,'') <> '' then ' · ' || new.bezug_text else '' end, 120),
          left(new.text, 240) || case when jsonb_array_length(new.fotos) > 0 then ' 📷' else '' end,
          'chat:' || new.id, new.von);
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists push_aus_chat on public.chat;
create trigger push_aus_chat after insert on public.chat
  for each row execute function public.push_aus_chat();

-- der Chat gehört zu den Benachrichtigungen, die man wählen kann
alter table public.push_abos alter column arten
  set default '["stoerung","protokoll","korrektur","stammdaten","wunsch","posteingang","chat"]'::jsonb;
