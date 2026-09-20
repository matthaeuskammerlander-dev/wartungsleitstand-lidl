<#
  Verschluesselt den Anlagenstamm, damit er auf einer oeffentlichen Seite
  nicht im Klartext ausgeliefert wird.

  daten.js  ->  daten.enc.js   (AES-256-CBC, Schluessel aus PBKDF2-SHA256)

  Aufruf:
      .\encrypt-data.ps1 -Passwort "ukt2026"
#>
param(
  [Parameter(Mandatory=$true)][string]$Passwort,
  [string]$Quelle = "..\daten.js",
  [string]$Ziel   = "..\daten.enc.js",
  [int]$Iterationen = 300000
)
$ErrorActionPreference = 'Stop'

$roh = [System.IO.File]::ReadAllText((Resolve-Path $Quelle).Path, [System.Text.Encoding]::UTF8)

# Den JS-Mantel abstreifen, verschluesselt wird das reine JSON
$json = $roh -replace '^\s*window\.LIDL_DB\s*=\s*', '' -replace ';\s*$', ''
$json = $json.Trim()
if (-not $json.StartsWith('{')) { throw "Unerwartetes Format in $Quelle" }
$null = $json | ConvertFrom-Json   # Gegenprobe: ist es gueltiges JSON?

$salz = New-Object byte[] 16
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($salz)

$kdf = New-Object System.Security.Cryptography.Rfc2898DeriveBytes(
         $Passwort, $salz, $Iterationen,
         [System.Security.Cryptography.HashAlgorithmName]::SHA256)
$schluessel = $kdf.GetBytes(32)

$aes = [System.Security.Cryptography.Aes]::Create()
$aes.KeySize = 256
$aes.Key     = $schluessel
$aes.Mode    = [System.Security.Cryptography.CipherMode]::CBC
$aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
$aes.GenerateIV()

$klar    = [System.Text.Encoding]::UTF8.GetBytes($json)
$geheim  = $aes.CreateEncryptor().TransformFinalBlock($klar, 0, $klar.Length)

$inhalt = 'window.LIDL_ENC = ' + (@{
  v    = 1
  alg  = "AES-CBC"
  kdf  = "PBKDF2-SHA256"
  iter = $Iterationen
  salt = [Convert]::ToBase64String($salz)
  iv   = [Convert]::ToBase64String($aes.IV)
  data = [Convert]::ToBase64String($geheim)
} | ConvertTo-Json -Compress) + ';'

[System.IO.File]::WriteAllText((Join-Path (Get-Location) $Ziel), $inhalt, [System.Text.UTF8Encoding]::new($false))

Write-Host "Klartext : $([math]::Round($klar.Length/1KB,1)) KB"
Write-Host "Chiffrat : $([math]::Round($inhalt.Length/1KB,1)) KB -> $Ziel"
Write-Host "Iterationen: $Iterationen"
