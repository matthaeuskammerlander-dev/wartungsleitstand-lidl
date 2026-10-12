-- Katalog: Hinweis je Position (Inhaber 12.10.2026, Rahmenvertrag FB035): was eine Pauschale enthält und wie
-- Mehrmengen zu rechnen sind – z. B. „KM-Leitung bis 15 m enthalten, Mehrlänge nach Pos. 29–36 je lfm“ oder
-- „je 100 mm Kabeltasse mit 1 Leitung; 200 mm mit 2 Leitungen zählt doppelt, 300 mm dreifach“.
-- Im Supabase SQL Editor einmal ausführen; mehrfach ausführen schadet nicht. Keine Rechte-Änderung (Katalog bleibt nur Inhaber).
alter table public.katalog add column if not exists hinweis text;
