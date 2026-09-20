param([string]$Pdf, [string]$OutFile)

$bytes = [System.IO.File]::ReadAllBytes($Pdf)
$latin = [System.Text.Encoding]::GetEncoding(28591)
$s = $latin.GetString($bytes)

function A85Decode([string]$txt) {
  $res = New-Object System.Collections.Generic.List[byte]
  $tuple = [uint32]0
  $cnt = 0
  foreach ($ch in $txt.ToCharArray()) {
    if ($ch -eq '~') { break }
    if ([char]::IsWhiteSpace($ch)) { continue }
    if ($ch -eq 'z' -and $cnt -eq 0) { 0..3 | ForEach-Object { $res.Add(0) }; continue }
    $tuple = $tuple * 85 + ([uint32]([int][char]$ch - 33))
    $cnt++
    if ($cnt -eq 5) {
      $res.Add([byte](($tuple -shr 24) -band 0xFF))
      $res.Add([byte](($tuple -shr 16) -band 0xFF))
      $res.Add([byte](($tuple -shr 8) -band 0xFF))
      $res.Add([byte]($tuple -band 0xFF))
      $tuple = [uint32]0; $cnt = 0
    }
  }
  if ($cnt -gt 0) {
    for ($i = $cnt; $i -lt 5; $i++) { $tuple = $tuple * 85 + 84 }
    $b = @([byte](($tuple -shr 24) -band 0xFF), [byte](($tuple -shr 16) -band 0xFF), [byte](($tuple -shr 8) -band 0xFF), [byte]($tuple -band 0xFF))
    for ($i = 0; $i -lt $cnt - 1; $i++) { $res.Add($b[$i]) }
  }
  return $res.ToArray()
}

$sb = New-Object System.Text.StringBuilder
$pos = 0
$n = 0
while ($true) {
  $i = $s.IndexOf("stream`n", $pos)
  if ($i -lt 0) { $i = $s.IndexOf("stream`r`n", $pos) }
  if ($i -lt 0) { break }
  $start = $s.IndexOf("`n", $i) + 1
  $end = $s.IndexOf('endstream', $start)
  if ($end -lt 0) { break }
  $chunk = $s.Substring($start, $end - $start)
  $n++
  $raw = A85Decode $chunk
  try {
    $ms = New-Object System.IO.MemoryStream(,$raw)
    if ($raw.Length -gt 2 -and $raw[0] -eq 0x78) { $ms.ReadByte() | Out-Null; $ms.ReadByte() | Out-Null }
    $ds = New-Object System.IO.Compression.DeflateStream($ms, [System.IO.Compression.CompressionMode]::Decompress)
    $o = New-Object System.IO.MemoryStream
    $ds.CopyTo($o)
    [void]$sb.AppendLine("=== STREAM $n ===")
    [void]$sb.AppendLine($latin.GetString($o.ToArray()))
  } catch {
    [void]$sb.AppendLine("=== STREAM $n FAILED: $($_.Exception.Message) ===")
  }
  $pos = $end + 9
}
[System.IO.File]::WriteAllText($OutFile, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
Write-Host "streams=$n"
