$ErrorActionPreference = 'Stop'
$recs    = Get-Content '.\data\positionen.json' -Raw -Encoding UTF8 | ConvertFrom-Json
$markets = Get-Content '.\data\markets.json'    -Raw -Encoding UTF8 | ConvertFrom-Json
$coords  = Get-Content '.\data\coords_by_address.json' -Raw -Encoding UTF8 | ConvertFrom-Json

function NormStreet($s) {
  $t = $s.ToLower()
  $t = $t -replace 'straße','str' -replace 'strasse','str'
  $t = $t -replace '[^a-z0-9äöüß]',''
  $t = $t -replace 'str','st'
  return $t
}
function AddrKey($r) {
  if ($r.plz) { return $r.plz + '|' + (NormStreet ($r.adresse -replace ('^\s*' + $r.plz), '')) }
  return 'x|' + (NormStreet $r.adresse)
}
# nur reine Monats-Trennzeilen verwerfen; alles andere bleibt erhalten und wird ggf. als "unklar" markiert
$junk = @('märz')

# Schreibweisen von Technikernamen vereinheitlichen (Schluessel klein geschrieben).
# Mehrere Namen in einem Feld ("Manfred,Tobias") werden einzeln behandelt.
$NAMEN_EINHEITLICH = @{
  'darko' = 'Darko'
  'datko' = 'Darko'     # Tippfehler in der Liste
}
function TechnikerName($wert) {
  $teile = ([string]$wert) -split ',' | ForEach-Object {
    $n = $_.Trim()
    if ($NAMEN_EINHEITLICH.ContainsKey($n.ToLower())) { $NAMEN_EINHEITLICH[$n.ToLower()] } else { $n }
  }
  return (($teile | Where-Object { $_ -ne '' }) -join ',')
}

$prec = @{}
foreach ($t in @('house','supermarket','retail','apartments','commercial','mall','building','yes','fuel','police','stationery','clothes','fitness_centre','car_repair','parking')) { $prec[$t] = 'adresse' }
foreach ($t in @('primary','secondary','tertiary','residential','living_street','unclassified','service','track')) { $prec[$t] = 'strasse' }
foreach ($t in @('administrative','postal_code','stop','city','town','village')) { $prec[$t] = 'ort' }

$standorte = New-Object System.Collections.ArrayList
$keyToId = @{}
for ($i = 0; $i -lt $markets.Count; $i++) {
  $m = $markets[$i]
  # Koordinaten haengen an der Adresse, nicht an der Zeilennummer –
  # sonst verschiebt sich alles, sobald sich die Liste aendert
  $c = $null
  if ($coords.PSObject.Properties[$m.adresse]) { $c = $coords.($m.adresse) }
  $lat = $null; $lon = $null; $g = 'keine'
  if ($c) { $lat = $c[0]; $lon = $c[1]; $g = if ($prec.ContainsKey($c[2])) { $prec[$c[2]] } else { 'strasse' } }
  $id = 'S' + $i
  $keyToId[$m.key] = $id
  $name = if ($m.filiale -ne '') { 'Filiale ' + $m.filiale } else { $m.adresse }
  [void]$standorte.Add([ordered]@{
    id = $id; filiale = $m.filiale; name = $name
    adresse = $m.adresse; plz = $m.plz; ort = $m.ort; region = $m.region
    lat = $lat; lon = $lon; genauigkeit = $g
  })
}

$positionen = New-Object System.Collections.ArrayList
foreach ($r in $recs) {
  if ($junk -contains (NormStreet $r.adresse)) { continue }
  $k = if ($r.filiale -ne '') { 'F' + $r.filiale } else { 'A' + (AddrKey $r) }
  if (-not $keyToId.ContainsKey($k)) {
    $id = 'S' + $standorte.Count
    $keyToId[$k] = $id
    [void]$standorte.Add([ordered]@{
      id = $id; filiale = $r.filiale; name = $r.adresse.Trim()
      adresse = $r.adresse.Trim(); plz = $r.plz; ort = $r.ort; region = $r.region
      lat = $null; lon = $null; genauigkeit = 'keine'
    })
  }
  # Jahresspalten der Quelle sind teilweise falsch beschriftet -> Jahr aus dem Datum ableiten
  $dates = New-Object System.Collections.ArrayList
  $techByCol = @{}
  foreach ($p in $r.techniker.PSObject.Properties) { $techByCol[$p.Name] = (TechnikerName $p.Value) }
  $t = @{}
  foreach ($p in $r.wartungen.PSObject.Properties) {
    $dt = $p.Value
    if ($dt -and $dates -notcontains $dt) { [void]$dates.Add($dt) }
    if ($dt -and $techByCol.ContainsKey($p.Name)) { $t[$dt.Substring(0,4)] = $techByCol[$p.Name] }
  }
  $w = @($dates | Sort-Object)
  $wr = @{}
  foreach ($p in $r.wartungenRaw.PSObject.Properties) { $wr[$p.Name] = $p.Value }
  [void]$positionen.Add([ordered]@{
    id = $r.id; standortId = $keyToId[$k]
    monat = $r.monat; monatName = $r.monatName
    intervallCode = $r.intervallCode
    anlagentyp = $r.anlagentyp
    rueckkuehler = $r.rueckkuehler
    kaeltemittelText = $r.kaeltemittelText
    kaeltemittelKg = $r.kaeltemittelKg
    ueber30kg = [bool]$r.ueber30kg
    inbetriebnahme = $r.inbetriebnahme
    baujahr = $r.baujahr
    plan2026 = $r.plan2026
    historie = $w
    wartungenRaw = $wr
    techniker = $t
  })
}

# ---- Standort-Aggregate ----
foreach ($s in $standorte) {
  $ps = @($positionen | Where-Object { $_.standortId -eq $s.id })
  $s['anzahlPositionen'] = $ps.Count
  $bj = @($ps | Where-Object { $_.baujahr } | ForEach-Object { $_.baujahr })
  $s['baujahrVon'] = if ($bj) { ($bj | Measure-Object -Minimum).Minimum } else { $null }
  $s['baujahrBis'] = if ($bj) { ($bj | Measure-Object -Maximum).Maximum } else { $null }
  $s['ueber30kg']  = [bool]($ps | Where-Object { $_.ueber30kg })
  $s['typen'] = @($ps | Where-Object { $_.anlagentyp -ne '' } | ForEach-Object { $_.anlagentyp } | Sort-Object -Unique)
  $s['unklar'] = (-not $s.lat)
  $s['adresseUnvollstaendig'] = (-not $s.plz)
}

$standorte = @($standorte | Where-Object { $_.anzahlPositionen -gt 0 })

$db = [ordered]@{
  meta = [ordered]@{
    quelle = 'Wartungen_Lidl.xlsx (Blätter 2026 / Aktuell / Bis 2022)'
    erstellt = (Get-Date).ToString('yyyy-MM-dd')
    firma = 'Kammerlander Umwelt- und Klimatechnik GmbH'
    standorte = $standorte.Count
    positionen = $positionen.Count
  }
  standorte = $standorte
  positionen = $positionen
}
$json = $db | ConvertTo-Json -Depth 8 -Compress
[System.IO.File]::WriteAllText('.\app\daten.js', 'window.LIDL_DB = ' + $json + ';', [System.Text.UTF8Encoding]::new($false))
Write-Host "Standorte: $($standorte.Count), Positionen: $($positionen.Count)"
Write-Host "ohne Koordinaten: $(($standorte | Where-Object { -not $_.lat }).Count)"
Write-Host "Groesse: $([math]::Round((Get-Item '.\app\daten.js').Length/1KB,1)) KB"
