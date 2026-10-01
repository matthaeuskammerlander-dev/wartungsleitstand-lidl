-- Projektdateien: weitere Dateitypen (Büro 01.10.2026) – E-Mails (.eml, .msg),
-- CAD-Pläne (.dwg) und Dateien ohne erkannten Typ (Browser melden .dwg/.msg
-- oft gar keinen Typ). Bis 20 MB je Datei bleibt.
-- Einmal im Supabase SQL Editor ausführen. Mehrfach ausführbar.
update storage.buckets set allowed_mime_types = array[
  'application/pdf','image/jpeg','image/png','image/heic','image/heif','image/webp','text/plain','text/csv',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'message/rfc822','application/vnd.ms-outlook',
  'image/vnd.dwg','application/acad','application/x-acad','application/autocad_dwg','application/dwg','application/x-dwg','application/x-autocad',
  'application/octet-stream']
where id = 'projektdateien';

select id, array_length(allowed_mime_types, 1) as typen from storage.buckets where id = 'projektdateien';
