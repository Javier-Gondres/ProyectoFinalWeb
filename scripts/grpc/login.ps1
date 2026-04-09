param(
  [Parameter(Mandatory = $true)][string]$Username,
  [Parameter(Mandatory = $true)][string]$Password,
  [string]$HttpPort = "7000"
)

$ErrorActionPreference = "Stop"
$base = "http://localhost:$HttpPort"
$body = @{ username = $Username; password = $Password } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body $body

$jwtPath = Join-Path $PSScriptRoot ".jwt"
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($jwtPath, [string]$r.token, $utf8)
Write-Host "OK: token guardado en scripts/grpc/.jwt"
Write-Host "Opcional en esta ventana: `$env:GRPC_JWT='$($r.token)'"
