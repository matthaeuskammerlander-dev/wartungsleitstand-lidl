-- Projekt-Schritt „Einreichung“ zwischen Konzept und Angebot (Büro 02.10.2026).
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.
alter table public.projekte drop constraint if exists projekte_status_check;
alter table public.projekte add constraint projekte_status_check
  check (status in ('anfrage','begehung','konzept','einreichung','angebot','auftrag','vorbereitung','baustelle',
                    'inbetriebnahme','abgeschlossen','abgerechnet','verloren'));
