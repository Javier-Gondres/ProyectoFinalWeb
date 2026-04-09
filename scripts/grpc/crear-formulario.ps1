param(
  [string]$GrpcPort = $env:GRPC_PORT,
  [string]$Token = $env:GRPC_JWT,
  [string]$BodyJson = ""
)

$ErrorActionPreference = "Stop"
if (-not $GrpcPort) { $GrpcPort = "7070" }
if (-not $BodyJson) { $BodyJson = Join-Path $PSScriptRoot "body-crear-ejemplo.json" }

$jwtFile = Join-Path $PSScriptRoot ".jwt"
if (-not $Token -and (Test-Path $jwtFile)) {
  $Token = (Get-Content -Path $jwtFile -Raw).Trim()
}
if (-not $Token) {
  Write-Error "Sin token. Ejecuta .\login.ps1 primero o define `$env:GRPC_JWT"
}
if (-not (Test-Path $BodyJson)) { Write-Error "No existe el JSON: $BodyJson" }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$importPath = Join-Path $repoRoot "src\main\proto"

Get-Content -LiteralPath $BodyJson -Raw -Encoding UTF8 | & grpcurl `
  -plaintext `
  -import-path $importPath `
  -proto encuesta.proto `
  -H "authorization: Bearer $Token" `
  -d '@' `
  "localhost:$GrpcPort" `
  "proyecto2.encuesta.EncuestaService/CrearFormulario"

if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
