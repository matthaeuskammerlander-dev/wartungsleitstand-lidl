-- Posteingang: auch weitergeleitete Mails zu Projekten (Büro 02.10.2026) –
-- dieselben Dateiarten wie bei den Projektdateien (Word, Excel, Pläne/DWG,
-- Mails .eml/.msg) und bis 20 MB je Datei. Einmal im Supabase SQL Editor
-- ausführen. Mehrfach ausführbar.
update storage.buckets set file_size_limit = 20971520, allowed_mime_types = array[
  'application/pdf','image/jpeg','image/png','image/heic','image/heif','image/webp','text/plain','text/csv',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'message/rfc822','application/vnd.ms-outlook',
  'image/vnd.dwg','application/acad','application/x-acad','application/autocad_dwg','application/dwg','application/x-dwg','application/x-autocad',
  'application/octet-stream']
where id = 'posteingang';

select id, file_size_limit, array_length(allowed_mime_types, 1) as typen from storage.buckets where id = 'posteingang';
