param([string]$Xlsx, [string]$OutDir)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($Xlsx)

function Read-Entry([string]$name) {
  $e = $zip.Entries | Where-Object { $_.FullName -eq $name }
  if (-not $e) { return $null }
  $sr = New-Object System.IO.StreamReader($e.Open(), [System.Text.Encoding]::UTF8)
  $t = $sr.ReadToEnd(); $sr.Close(); return $t
}

# shared strings
$shared = @()
$ssXml = Read-Entry 'xl/sharedStrings.xml'
if ($ssXml) {
  $doc = New-Object System.Xml.XmlDocument
  $doc.LoadXml($ssXml)
  foreach ($si in $doc.DocumentElement.ChildNodes) {
    $shared += ($si.InnerText)
  }
}

# workbook sheet names
$wb = Read-Entry 'xl/workbook.xml'
$wbDoc = New-Object System.Xml.XmlDocument
$wbDoc.LoadXml($wb)
$ns = New-Object System.Xml.XmlNamespaceManager($wbDoc.NameTable)
$ns.AddNamespace('m','http://schemas.openxmlformats.org/spreadsheetml/2006/main')
$ns.AddNamespace('r','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
$sheetNodes = $wbDoc.SelectNodes('//m:sheets/m:sheet', $ns)

# rels map rId -> target
$rels = Read-Entry 'xl/_rels/workbook.xml.rels'
$rDoc = New-Object System.Xml.XmlDocument
$rDoc.LoadXml($rels)
$relMap = @{}
foreach ($rel in $rDoc.DocumentElement.ChildNodes) { $relMap[$rel.Id] = $rel.Target }

function ColToIndex([string]$ref) {
  $letters = ($ref -replace '[0-9]', '')
  $n = 0
  foreach ($ch in $letters.ToCharArray()) { $n = $n * 26 + ([int][char]$ch - 64) }
  return $n
}

New-Item -ItemType Directory -Force $OutDir | Out-Null

$idx = 0
foreach ($s in $sheetNodes) {
  $idx++
  $name = $s.GetAttribute('name')
  $rid = $s.GetAttribute('id','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
  $target = $relMap[$rid]
  if ($target -notlike 'xl/*') { $target = 'xl/' + $target }
  $sx = Read-Entry $target
  if (-not $sx) { Write-Host "MISSING $target"; continue }
  $sDoc = New-Object System.Xml.XmlDocument
  $sDoc.LoadXml($sx)
  $rows = $sDoc.SelectNodes('//m:sheetData/m:row', $ns)
  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($row in $rows) {
    $cells = @{}
    $max = 0
    foreach ($c in $row.SelectNodes('m:c', $ns)) {
      $ref = $c.GetAttribute('r')
      $ci = ColToIndex $ref
      if ($ci -gt $max) { $max = $ci }
      $t = $c.GetAttribute('t')
      $v = ''
      if ($t -eq 'inlineStr') {
        $isNode = $c.SelectSingleNode('m:is', $ns)
        if ($isNode) { $v = $isNode.InnerText }
      } else {
        $vNode = $c.SelectSingleNode('m:v', $ns)
        if ($vNode) {
          $v = $vNode.InnerText
          if ($t -eq 's') { $v = $shared[[int]$v] }
        }
      }
      $cells[$ci] = ($v -replace "`t",' ' -replace "`r`n",' | ' -replace "`n",' | ')
    }
    $arr = @()
    for ($i = 1; $i -le $max; $i++) { if ($cells.ContainsKey($i)) { $arr += $cells[$i] } else { $arr += '' } }
    $lines.Add(($row.GetAttribute('r') + "`t" + ($arr -join "`t")))
  }
  $safe = ($name -replace '[^A-Za-z0-9_-]','_')
  $out = Join-Path $OutDir ("{0}_{1}.tsv" -f $idx, $safe)
  [System.IO.File]::WriteAllLines($out, $lines, [System.Text.UTF8Encoding]::new($false))
  Write-Host "SHEET $idx '$name' -> $out rows=$($lines.Count)"
}
$zip.Dispose()
