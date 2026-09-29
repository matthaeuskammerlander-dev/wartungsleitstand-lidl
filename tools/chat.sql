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
-- Persönliche Nachrichten („An: Person“, siehe tools/chat-direkt.sql): die
-- Spalten und die enge Leseregel stehen auch hier – sonst setzte ein erneutes
-- Ausführen dieser Datei die Leseregel zurück, und persönliche Nachrichten
-- wären für das ganze Team lesbar.
alter table public.chat add column if not exists an uuid references auth.users(id) on delete set null;
alter table public.chat add column if not exists an_name text;
create index if not exists chat_an_idx on public.chat (an);
alter table public.push_ereignisse add column if not exists nur_user uuid;
alter table public.chat enable row level security;
-- an = null und an_name = null: an alle im Team. Sonst sehen nur Absender und
-- Empfänger die Nachricht (wird das Konto des Empfängers gelöscht: nur noch der Absender).
drop policy if exists "chat lesen" on public.chat;
create policy "chat lesen" on public.chat for select to authenticated
  using (public.darf_schreiben()
         and ((an is null and an_name is null) or an = auth.uid() or von = auth.uid()));
drop policy if exists "chat schreiben" on public.chat;
create policy "chat schreiben" on public.chat for insert to authenticated
  with check (public.darf_schreiben() and von = auth.uid());
drop policy if exists "chat eigene loeschen" on public.chat;
create policy "chat eigene loeschen" on public.chat for delete to authenticated
  using (von = auth.uid() or public.ist_admin());
grant select, insert, delete on public.chat to authenticated;

-- Fotos des Team-Chats (chat/…) sieht nur, wer mitarbeitet – Kunde und
-- Präsentation nicht. Die Regel „fotos ansehen“ aus supabase-setup.sql galt für
-- den ganzen Bucket; Protokollfotos und Auftrags-PDFs bleiben für alle
-- Angemeldeten lesbar wie bisher. (Wird supabase-setup.sql später nochmals
-- ausgeführt, danach diese Datei erneut ausführen.)
drop policy if exists "fotos ansehen" on storage.objects;
create policy "fotos ansehen" on storage.objects for select to authenticated
  -- Bilder zu Änderungswünschen (wunsch/…): nur Absender und Inhaber – dieselbe
  -- Fassung wie in tools/wunsch-fotos.sql
  using (bucket_id = 'protokollfotos'
         and case when name like 'wunsch/%' then (owner = auth.uid() or public.ist_inhaber())
                  when name like 'chat/%'   then public.darf_schreiben()
                  else true end);

-- Fotos einer gelöschten Nachricht aus dem Speicher nehmen: nur unter chat/…,
-- nur die selbst hochgeladenen (Admins: alle). Protokollfotos bleiben unberührt.
drop policy if exists "chatfotos loeschen" on storage.objects;
create policy "chatfotos loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'protokollfotos' and name like 'chat/%'
         and public.darf_schreiben() and (owner = auth.uid() or public.ist_admin()));

-- neue Nachricht → Push an alle anderen (Absender und Bezug im Titel); eine
-- persönliche Nachricht nur an den Empfänger (nur_user – dieselbe Fassung wie
-- in tools/chat-direkt.sql, damit ein erneutes Ausführen nichts zurücksetzt)
create or replace function public.push_aus_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.push_ereignisse (art, titel, text, ziel, von_user, nur_user)
  values ('chat',
          left(coalesce(nullif(new.von_name,''),'Jemand')
               || case when new.an is not null then ' · persönlich' else '' end
               || case when coalesce(new.bezug_text,'') <> '' then ' · ' || new.bezug_text else '' end, 120),
          left(new.text, 240) || case when jsonb_array_length(new.fotos) > 0 then ' 📷' else '' end,
          'chat:' || new.id, new.von, new.an);
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
