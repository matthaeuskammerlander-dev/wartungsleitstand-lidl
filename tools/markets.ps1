$ErrorActionPreference = 'Stop'
$recs = Get-Content '.\data\positionen.json' -Raw -Encoding UTF8 | ConvertFrom-Json

function NormStreet($s) {
  $t = $s.ToLower()
  $t = $t -replace 'straße', 'str' -replace 'strasse', 'str' -replace 'straãe', 'str'
  $t = $t -replace '[^a-z0-9äöüß]', ''
  $t = $t -replace 'str', 'st'
  return $t
}
function AddrKey($r) {
  if ($r.plz) { return $r.plz + '|' + (NormStreet ($r.adresse -replace ('^\s*' + $r.plz), '')) }
  return 'x|' + (NormStreet $r.adresse)
}

# skip leftover month separator rows and non-location tasks
$junk = @('märz','jahreswartungluftung','undjahreswartungluftung','wartunggaswarnanlage')
$clean = $recs | Where-Object { $junk -notcontains (NormStreet $_.adresse) }
Write-Host "Positionen nach Bereinigung: $($clean.Count) (vorher $($recs.Count))"

$byFil = @{}
foreach ($r in $clean) {
  $k = if ($r.filiale -ne '') { 'F' + $r.filiale } else { 'A' + (AddrKey $r) }
  if (-not $byFil.ContainsKey($k)) { $byFil[$k] = New-Object System.Collections.ArrayList }
  [void]$byFil[$k].Add($r)
}
Write-Host "Standorte: $($byFil.Count)"

# check for conflicting addresses under the same Filiale
$conf = 0
foreach ($k in $byFil.Keys) {
  $keys = $byFil[$k] | ForEach-Object { AddrKey $_ } | Sort-Object -Unique
  if ($keys.Count -gt 1) {
    $conf++
    if ($conf -le 12) { Write-Host "  KONFLIKT $k : $($keys -join ' ; ')" }
  }
}
Write-Host "Standorte mit abweichenden Adressvarianten: $conf"

# build market list, choosing the longest (most complete) address variant
$markets = New-Object System.Collections.ArrayList
foreach ($k in ($byFil.Keys | Sort-Object)) {
  $rows = $byFil[$k]
  $best = $rows | Sort-Object { $_.adresse.Length } -Descending | Select-Object -First 1
  $regions = @($rows | Where-Object { $_.region -ne '' } | ForEach-Object { $_.region } | Sort-Object -Unique)
  [void]$markets.Add([ordered]@{
    key      = $k
    filiale  = $best.filiale
    adresse  = $best.adresse.Trim()
    plz      = $best.plz
    ort      = $best.ort
    region   = if ($regions) { $regions[0] } else { '' }
    anzahlPositionen = $rows.Count
    geocodeQuery = if ($best.plz) { $best.adresse.Trim() + ', Österreich' } else { $best.adresse.Trim() + ', Österreich' }
  })
}
[System.IO.File]::WriteAllText('.\data\markets.json', ($markets | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
$q = $markets | ForEach-Object { $_.geocodeQuery }
[System.IO.File]::WriteAllText('.\data\geoqueries.json', (($q | ConvertTo-Json -Compress)), [System.Text.UTF8Encoding]::new($false))
Write-Host "-> data\markets.json ($($markets.Count)), data\geoqueries.json"
Write-Host "ohne PLZ: $(($markets | Where-Object { -not $_.plz }).Count)"
