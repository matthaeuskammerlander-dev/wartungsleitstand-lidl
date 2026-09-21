$ErrorActionPreference = 'Stop'

function LoadT($p) {
  [System.IO.File]::ReadAllLines($p, [System.Text.Encoding]::UTF8) | ForEach-Object { ,($_ -split "`t") }
}

function Cell($r, $i) { if ($r.Count -gt $i) { return $r[$i].Trim() } else { return '' } }

function SerialToIso($v) {
  if ($v -match '^\d+(\.\d+)?$') {
    $n = [double]$v
    if ($n -gt 20000 -and $n -lt 60000) {
      return ([datetime]'1899-12-30').AddDays([math]::Floor($n)).ToString('yyyy-MM-dd')
    }
  }
  return $null
}

$monthMap = @{
  'jän'=1;'jann'=1;'jänn'=1;'jänner'=1;'janner'=1;'jan'=1
  'feb'=2;'febr'=2;'februar'=2
  'mär'=3;'maer'=3;'märz'=3;'maerz'=3;'mar'=3;'marz'=3
  'apr'=4;'april'=4
  'mai'=5
  'jun'=6;'juni'=6
  'jul'=7;'juli'=7
  'aug'=8;'august'=8
  'sep'=9;'sept'=9;'september'=9
  'okt'=10;'oktober'=10
  'nov'=11;'november'=11
  'dez'=12;'dezember'=12
}
function MonthNr($s) {
  $k = $s.Trim().TrimEnd('.').ToLower()
  if ($monthMap.ContainsKey($k)) { return $monthMap[$k] }
  return 0
}
$monthNames = @('', 'Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember')

$regionMap = @{ 'wien'='Wien'; 'laa'='Laakirchen'; 'wund'='Wundschuh'; 'ht'='' }
function RegionNorm($s) {
  $k = $s.Trim().ToLower()
  if ($regionMap.ContainsKey($k)) { return $regionMap[$k] }
  return $s.Trim()
}

# refrigerant amount
function KgParse($s) {
  $t = $s.Trim()
  if ($t -eq '') { return $null }
  if ($t -match '^>\s*30') { return 30.0 }
  $t2 = $t -replace ',', '.'
  if ($t2 -match '(\d+(\.\d+)?)') { return [double]$Matches[1] }
  return $null
}

function KeyOf($r) {
  $f = (Cell $r 4); $a = (Cell $r 5) -replace '[^A-Za-z0-9äöüÄÖÜß]', ''
  $i = (Cell $r 10) -replace '\s', ''
  $ib = (Cell $r 9)
  return ($f + '|' + $a.ToLower() + '|' + $i.ToLower() + '|' + $ib)
}

$s1 = LoadT '.\data\1_2026.tsv'
$s3 = LoadT '.\data\3_Bis_2022.tsv'

# index of sheet3 rows by key (list, to allow duplicates)
$hist = @{}
foreach ($r in ($s3 | Select-Object -Skip 2)) {
  if ((Cell $r 5) -eq '') { continue }
  $k = KeyOf $r
  if (-not $hist.ContainsKey($k)) { $hist[$k] = New-Object System.Collections.ArrayList }
  [void]$hist[$k].Add($r)
}

$recs = New-Object System.Collections.ArrayList
$currentMonthSection = 0
$skipped = 0

foreach ($r in ($s1 | Select-Object -Skip 2)) {
  $adr = Cell $r 5
  $fil = Cell $r 4
  $mon = Cell $r 1
  if ($adr -eq '' -and $fil -eq '') { continue }

  # month section separator row: only an address cell that is a month name
  if ($fil -eq '' -and (MonthNr $adr) -gt 0 -and (Cell $r 10) -eq '' -and (Cell $r 12) -eq '') {
    $currentMonthSection = MonthNr $adr
    continue
  }
  if ($mon -eq 'Stand:') { continue }

  $mnr = MonthNr $mon
  if ($mnr -eq 0) { $mnr = $currentMonthSection } else { $currentMonthSection = $mnr }

  $plan = SerialToIso (Cell $r 12)
  $planRaw = Cell $r 12
  $ib = SerialToIso (Cell $r 9)
  if (-not $ib) { $ib = SerialToIso (Cell $r 8) }

  $plz = $null; $ort = $null
  if ($adr -match '^\s*(\d{4})\s+(.+)$') {
    $plz = $Matches[1]
    $rest = $Matches[2]
    if ($rest -match '^([^,]+),\s*(.*)$') { $ort = $Matches[1].Trim() }
    else {
      # ohne Komma: erstes Wort; mehrteilige Ortsnamen zusammenhalten
      # ("Deutsch Wagram Dr.L.Figl Gasse 5", "Bruck/ Leitha. Altstadt 125")
      $w = @($rest -split '\s+')
      $ort = $w[0]
      if ($w.Count -gt 1 -and ($ort -match '/$' -or $ort -match '^(Deutsch|Bad|Sankt|St\.|Maria|Groß|Klein|Neu|Markt|Hall)$')) {
        $ort = ($ort + ' ' + $w[1]) -replace '/\s+', '/' -replace '[.,]$', ''
      }
    }
  }

  $k = KeyOf $r
  $h3 = $null
  if ($hist.ContainsKey($k) -and $hist[$k].Count -gt 0) {
    $h3 = $hist[$k][0]
    $hist[$k].RemoveAt(0)
  }

  $wartungen = @{}
  $raw = @{}
  foreach ($pair in @(@(14,'2023'), @(15,'2024'), @(17,'2025'), @(12,'2026'))) {
    $idx = $pair[0]; $yr = $pair[1]
    $v = Cell $r $idx
    if ($v -ne '') {
      $iso = SerialToIso $v
      if ($iso) { $wartungen[$yr] = $iso } else { $raw[$yr] = $v }
    }
  }
  if ($h3) {
    foreach ($pair in @(@(12,'2020'), @(13,'2021'), @(14,'2022'), @(15,'2023'))) {
      $idx = $pair[0]; $yr = $pair[1]
      $v = Cell $h3 $idx
      if ($v -ne '' -and -not $wartungen.ContainsKey($yr)) {
        $iso = SerialToIso $v
        if ($iso) { $wartungen[$yr] = $iso } elseif (-not $raw.ContainsKey($yr)) { $raw[$yr] = $v }
      }
    }
  }

  $tech = @{}
  $t24 = Cell $r 16; if ($t24 -ne '') { $tech['2024'] = $t24 }
  $t25 = Cell $r 18; if ($t25 -ne '') { $tech['2025'] = $t25 }
  $t26 = Cell $r 13; if ($t26 -ne '') { $tech['2026'] = $t26 }

  $kmText = Cell $r 6
  $code = (Cell $r 7)

  $rec = [ordered]@{
    id          = 'P' + (Cell $r 0)
    zeile       = [int](Cell $r 0)
    monat       = $mnr
    monatName   = if ($mnr -gt 0) { $monthNames[$mnr] } else { '' }
    monatRaw    = $mon
    region      = RegionNorm (Cell $r 2)
    tour        = Cell $r 3
    filiale     = $fil
    adresse     = $adr
    plz         = $plz
    ort         = $ort
    kaeltemittelText = $kmText
    kaeltemittelKg   = KgParse $kmText
    ueber30kg   = ($kmText -match '^>\s*30' -or ((KgParse $kmText) -ne $null -and (KgParse $kmText) -ge 30))
    intervallCode = $code
    inbetriebnahme = $ib
    baujahr     = if ($ib) { [int]$ib.Substring(0,4) } else { $null }
    anlagentyp  = Cell $r 10
    rueckkuehler = Cell $r 11
    plan2026    = $plan
    plan2026Raw = if ($plan) { $null } else { if ($planRaw -ne '') { $planRaw } else { $null } }
    wartungen   = $wartungen
    wartungenRaw = $raw
    techniker   = $tech
    hatHistorie = ($h3 -ne $null)
  }
  [void]$recs.Add($rec)
}

Write-Host "Positionen: $($recs.Count)"
Write-Host "mit 2020-22 Historie: $(($recs | Where-Object { $_.hatHistorie }).Count)"
Write-Host "mit Plandatum 2026: $(($recs | Where-Object { $_.plan2026 }).Count)"
Write-Host "mit Inbetriebnahme: $(($recs | Where-Object { $_.inbetriebnahme }).Count)"
Write-Host "distinct Filiale: $(($recs | Where-Object { $_.filiale -ne '' } | ForEach-Object { $_.filiale } | Sort-Object -Unique).Count)"
Write-Host "distinct Adresse: $(($recs | ForEach-Object { $_.adresse } | Sort-Object -Unique).Count)"

$json = $recs | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText('.\data\positionen.json', $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "-> data\positionen.json"
