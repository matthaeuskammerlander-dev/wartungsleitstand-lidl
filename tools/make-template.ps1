<#
  Erzeugt "Wartungen_Lidl_Vorlage.xlsx": die bestehenden Daten in der
  Struktur, die sich sauber einlesen laesst. Drei Blaetter plus Anleitung.
#>
$ErrorActionPreference = 'Stop'

$db = (Get-Content '.\app\daten.js' -Raw -Encoding UTF8) -replace '^window\.LIDL_DB = ','' -replace ';$','' | ConvertFrom-Json
$MON = @('','Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember')

function SerialVon($iso){
  if (-not $iso) { return $null }
  return [int]([datetime]::ParseExact($iso,'yyyy-MM-dd',$null) - [datetime]'1899-12-30').Days
}
function SpalteName([int]$n){
  $s=''
  while ($n -gt 0) { $r=($n-1)%26; $s=[char](65+$r)+$s; $n=[math]::Floor(($n-1)/26) }
  return $s
}
function XmlEsc($t){
  return ([string]$t).Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;')
}

# ---------------------------------------------------------------- Blattdaten
$anleitung = @(
 @('Wartungsliste Lidl – Aufbau der Datei',''),
 @('',''),
 @('Diese Datei ersetzt die bisherige Liste. Sie ist bereits mit dem aktuellen Stand gefuellt.',''),
 @('Bitte nur korrigieren und ergaenzen, die Spaltenkoepfe und die Blattnamen unveraendert lassen.',''),
 @('',''),
 @('Blatt "Standorte"','ein Markt bzw. Objekt je Zeile, eindeutig ueber die Filialnummer'),
 @('Blatt "Anlagen"','eine Anlage je Zeile, ueber die Filialnummer mit dem Standort verbunden'),
 @('Blatt "Wartungen"','eine durchgefuehrte Wartung je Zeile, ueber die AnlagenID verbunden'),
 @('',''),
 @('Wichtigste Aenderung gegenueber bisher:',''),
 @('Wartungen stehen nicht mehr als Spalte je Jahr, sondern als eigene Zeile.',''),
 @('Damit entfallen die verrutschten Jahresueberschriften und es lassen sich',''),
 @('beliebig viele Wartungen je Anlage erfassen, auch mehrere im selben Jahr.',''),
 @('',''),
 @('Spalte "Bitte_pruefen" zeigt, wo beim Einlesen etwas unklar war.',''),
 @('Ist der Punkt erledigt, die Zelle einfach leeren.','')
)

$standorte = New-Object System.Collections.ArrayList
[void]$standorte.Add(@('FilialNr','Bezeichnung','PLZ','Ort','Strasse','Hausnummer','FM_Region',
                       'Breitengrad','Laengengrad','Adresse_original','Bitte_pruefen'))
foreach ($s in $db.standorte) {
  $plz=''; $ort=''; $strasse=''; $hnr=''; $pruef=@()
  $a = [string]$s.adresse
  if ($a -match '^\s*(\d{4})\s+(.+)$') {
    $plz=$Matches[1]; $rest=$Matches[2]
    if ($rest -match '^([^,]+),\s*(.+)$') { $ort=$Matches[1].Trim(); $rest=$Matches[2].Trim() }
    else { $pruef += 'Ort und Strasse nicht trennbar' }
    if ($rest -match '^(.*?)[\s,]*(\d+\s*[a-zA-Z]?(?:\s*[-/]\s*\d+\s*[a-zA-Z]?)?)\s*$') {
      $strasse=$Matches[1].Trim(' ,.'); $hnr=$Matches[2] -replace '\s',''
    } else { $strasse=$rest; $pruef += 'keine Hausnummer erkennbar' }
  } else {
    $strasse=$a; $pruef += 'keine PLZ in der Adresse'
  }
  if (-not $s.filiale) { $pruef += 'Filialnummer fehlt' }
  if (-not $s.region)  { $pruef += 'FM-Region fehlt' }
  if ($s.genauigkeit -eq 'ort')  { $pruef += 'nur ortsgenau verortet' }
  if ($s.genauigkeit -eq 'keine'){ $pruef += 'nicht verortbar' }

  [void]$standorte.Add(@(
    $s.filiale, $s.name, $plz, $ort, $strasse, $hnr, $s.region,
    $s.lat, $s.lon, $s.adresse, ($pruef -join '; ')
  ))
}

$standNach=@{}; foreach ($s in $db.standorte) { $standNach[$s.id]=$s }

$anlagen = New-Object System.Collections.ArrayList
[void]$anlagen.Add(@('AnlagenID','FilialNr','Standort','Anlagentyp','Hersteller','Modell','Seriennummer',
                     'Kaeltemittelart','Kaeltemittel_kg','Inbetriebnahme','Rueckkuehler','Regelung',
                     'Intervall_Kuerzel','Wartungen_pro_Jahr','Soll_Monat','Bitte_pruefen'))
foreach ($p in $db.positionen) {
  $s=$standNach[$p.standortId]
  $pruef=@()
  if (-not $p.anlagentyp)    { $pruef += 'Anlagentyp fehlt' }
  if (-not $p.monat)         { $pruef += 'Soll-Monat fehlt' }
  if (-not $p.inbetriebnahme){ $pruef += 'Inbetriebnahme fehlt' }
  if (-not $p.kaeltemittelText) { $pruef += 'Kaeltemittelmenge fehlt' }
  elseif ($p.kaeltemittelText -match '^>') { $pruef += 'Menge war nur ">30 KG", bitte genauen Wert eintragen' }
  if (-not $p.intervallCode) { $pruef += 'Intervall-Kuerzel fehlt' }
  if (-not $p.historie -or $p.historie.Count -eq 0) { $pruef += 'keine Wartung erfasst' }

  [void]$anlagen.Add(@(
    $p.id, $s.filiale, $s.name, $p.anlagentyp, '', '', '',
    '', $p.kaeltemittelKg, (SerialVon $p.inbetriebnahme), $p.rueckkuehler, '',
    $p.intervallCode, '', $(if ($p.monat) { $MON[$p.monat] } else { '' }), ($pruef -join '; ')
  ))
}

$wartungen = New-Object System.Collections.ArrayList
[void]$wartungen.Add(@('AnlagenID','FilialNr','Datum','Techniker','Art','Bemerkung'))
foreach ($p in $db.positionen) {
  $s=$standNach[$p.standortId]
  foreach ($d in $p.historie) {
    $jahr=$d.Substring(0,4)
    $tech=''
    if ($p.techniker -and $p.techniker.PSObject.Properties[$jahr]) { $tech=$p.techniker.$jahr }
    [void]$wartungen.Add(@($p.id, $s.filiale, (SerialVon $d), $tech, 'planmäßig', ''))
  }
}

$blaetter = @(
  @{ name='Anleitung';  zeilen=$anleitung;  datumSpalten=@() },
  @{ name='Standorte';  zeilen=$standorte;  datumSpalten=@() },
  @{ name='Anlagen';    zeilen=$anlagen;    datumSpalten=@(10) },
  @{ name='Wartungen';  zeilen=$wartungen;  datumSpalten=@(3) }
)

# ---------------------------------------------------------------- xlsx bauen
function BlattXml($zeilen, $datumSpalten) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
  [void]$sb.Append('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">')
  [void]$sb.Append('<sheetData>')
  for ($r=0; $r -lt $zeilen.Count; $r++) {
    $zeile = $zeilen[$r]
    [void]$sb.Append('<row r="' + ($r+1) + '">')
    for ($c=0; $c -lt $zeile.Count; $c++) {
      $wert = $zeile[$c]
      if ($null -eq $wert -or $wert -eq '') { continue }
      $ref = (SpalteName ($c+1)) + ($r+1)
      $stil = 0
      if ($r -eq 0) { $stil = 1 }
      elseif ($datumSpalten -contains ($c+1)) { $stil = 2 }
      if ($wert -is [int] -or $wert -is [double] -or $wert -is [decimal]) {
        [void]$sb.Append('<c r="' + $ref + '" s="' + $stil + '"><v>' +
          ([string]$wert).Replace(',','.') + '</v></c>')
      } else {
        [void]$sb.Append('<c r="' + $ref + '" s="' + $stil + '" t="inlineStr"><is><t xml:space="preserve">' +
          (XmlEsc $wert) + '</t></is></c>')
      }
    }
    [void]$sb.Append('</row>')
  }
  [void]$sb.Append('</sheetData></worksheet>')
  return $sb.ToString()
}

$ct = New-Object System.Text.StringBuilder
[void]$ct.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
[void]$ct.Append('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">')
[void]$ct.Append('<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>')
[void]$ct.Append('<Default Extension="xml" ContentType="application/xml"/>')
[void]$ct.Append('<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>')
[void]$ct.Append('<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>')
for ($i=1; $i -le $blaetter.Count; $i++) {
  [void]$ct.Append('<Override PartName="/xl/worksheets/sheet' + $i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
}
[void]$ct.Append('</Types>')

$rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>'

$wb = New-Object System.Text.StringBuilder
[void]$wb.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
[void]$wb.Append('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>')
for ($i=1; $i -le $blaetter.Count; $i++) {
  [void]$wb.Append('<sheet name="' + (XmlEsc $blaetter[$i-1].name) + '" sheetId="' + $i + '" r:id="rId' + $i + '"/>')
}
[void]$wb.Append('</sheets></workbook>')

$wbRels = New-Object System.Text.StringBuilder
[void]$wbRels.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
[void]$wbRels.Append('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">')
for ($i=1; $i -le $blaetter.Count; $i++) {
  [void]$wbRels.Append('<Relationship Id="rId' + $i + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + $i + '.xml"/>')
}
[void]$wbRels.Append('<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>')
[void]$wbRels.Append('</Relationships>')

$styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
 '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
 '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
 '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
 '<borders count="1"><border/></borders>' +
 '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
 '<cellXfs count="3">' +
   '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
   '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
   '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
 '</cellXfs></styleSheet>'

$ziel = Join-Path (Get-Location) 'Wartungen_Lidl_Vorlage.xlsx'
if (Test-Path $ziel) { Remove-Item $ziel -Force }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$fs  = [System.IO.File]::Open($ziel, [System.IO.FileMode]::Create)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
function ZipDatei($zip, $pfad, $inhalt) {
  $e = $zip.CreateEntry($pfad, [System.IO.Compression.CompressionLevel]::Optimal)
  $w = New-Object System.IO.StreamWriter($e.Open(), (New-Object System.Text.UTF8Encoding($false)))
  $w.Write($inhalt); $w.Close()
}
ZipDatei $zip '[Content_Types].xml' $ct.ToString()
ZipDatei $zip '_rels/.rels' $rels
ZipDatei $zip 'xl/workbook.xml' $wb.ToString()
ZipDatei $zip 'xl/_rels/workbook.xml.rels' $wbRels.ToString()
ZipDatei $zip 'xl/styles.xml' $styles
for ($i=1; $i -le $blaetter.Count; $i++) {
  ZipDatei $zip ('xl/worksheets/sheet' + $i + '.xml') (BlattXml $blaetter[$i-1].zeilen $blaetter[$i-1].datumSpalten)
}
$zip.Dispose(); $fs.Close()

Write-Host "-> $ziel"
foreach ($b in $blaetter) { Write-Host ("   {0,-12} {1,5} Zeilen" -f $b.name, ($b.zeilen.Count-1)) }
Write-Host ("   Groesse: {0} KB" -f [math]::Round((Get-Item $ziel).Length/1KB,1))
