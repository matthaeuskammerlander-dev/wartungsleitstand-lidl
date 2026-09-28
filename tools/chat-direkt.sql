-- Team-Chat: persönliche Nachrichten („An: Person“) – im Supabase SQL Editor
-- einmal ausführen, nach tools/chat.sql. Mehrfach ausführen schadet nicht.
--
-- an = null: an alle im Team. an = Konto: nur Absender und Empfänger sehen
-- die Nachricht, die Push-Nachricht geht nur an den Empfänger.
alter table public.chat add column if not exists an uuid references auth.users(id) on delete set null;
alter table public.chat add column if not exists an_name text;
create index if not exists chat_an_idx on public.chat (an);

-- „An alle“ ist nur, was nie einen Empfänger hatte (an und an_name leer). Wird
-- das Konto eines Empfängers gelöscht, wird an = null – der Empfängername
-- bleibt stehen, und die Nachricht bleibt persönlich: nur der Absender sieht
-- sie noch (sonst wäre sie plötzlich für das ganze Team lesbar).
drop policy if exists "chat lesen" on public.chat;
create policy "chat lesen" on public.chat for select to authenticated
  using (public.darf_schreiben()
         and ((an is null and an_name is null) or an = auth.uid() or von = auth.uid()));

-- Ereignis nur für eine Person (Push-Funktion filtert nach nur_user)
alter table public.push_ereignisse add column if not exists nur_user uuid;

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

-- Wer im Team ist (Büro und Techniker) – für die Empfängerauswahl. Nur für
-- Konten, die schreiben dürfen; Kunde und Präsentation bekommen nichts.
create or replace function public.team_liste()
returns table (user_id uuid, name text, rolle text)
language sql stable security definer set search_path = public as $$
  select u.id,
         coalesce(nullif(r.name,''), nullif(u.raw_user_meta_data->'einstellungen'->>'name',''), split_part(u.email,'@',1)),
         coalesce(r.rolle,'techniker')
    from auth.users u
    left join public.rollen r on r.user_id = u.id
   where public.darf_schreiben()
     and coalesce(r.rolle,'techniker') in ('inhaber','admin','techniker');
$$;
revoke all on function public.team_liste() from public, anon;
grant execute on function public.team_liste() to authenticated;
