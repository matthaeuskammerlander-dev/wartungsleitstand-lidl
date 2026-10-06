-- Projektdateien bis 50 MB je Datei (Inhaber 06.10.2026: Ordner mit großen Plänen ließen sich nicht hochladen).
-- 50 MB ist die höchste Grenze im Supabase-Tarif „Free“ (globale Grenze, nicht änderbar); mehr nur mit „Pro“.
-- Passt zu PROJEKT_DATEI_MAX in index.html. Rechte ändern sich nicht. Mehrfach ausführbar.
update storage.buckets set file_size_limit = 52428800 where id = 'projektdateien';

select id, file_size_limit, round(file_size_limit / 1048576.0) as mb from storage.buckets where id = 'projektdateien';
