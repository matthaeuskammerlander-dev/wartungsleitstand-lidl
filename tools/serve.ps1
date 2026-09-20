param([int]$Port = 8099, [string]$Root = ".\app")
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path $Root).Path
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "serving $Root on http://localhost:$Port/"
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8' }
while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $ns = $client.GetStream()
    $buf = New-Object byte[] 8192
    $n = $ns.Read($buf, 0, $buf.Length)
    $req = [System.Text.Encoding]::ASCII.GetString($buf, 0, $n)
    $line = ($req -split "`r`n")[0]
    $path = ($line -split ' ')[1]
    if (-not $path) { $path = '/' }
    $path = $path.Split('?')[0]
    if ($path -eq '/') { $path = '/index.html' }
    $file = Join-Path $Root ($path.TrimStart('/') -replace '/', '\')
    if ((Test-Path $file -PathType Leaf) -and $file.StartsWith($Root)) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $ct = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      $head = "HTTP/1.1 200 OK`r`nContent-Type: $ct`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    } else {
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("not found: $path")
      $head = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
    }
    $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
    $ns.Write($hb, 0, $hb.Length)
    $ns.Write($bytes, 0, $bytes.Length)
    $ns.Flush()
  } catch { }
  finally { $client.Close() }
}
