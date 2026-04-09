param(
  [string]$GrpcPort = $env:GRPC_PORT,
  [string]$Token = $env:GRPC_JWT
)

$ErrorActionPreference = "Stop"
if (-not $GrpcPort) { $GrpcPort = "7070" }

$jwtFile = Join-Path $PSScriptRoot ".jwt"
if (-not $Token -and (Test-Path $jwtFile)) {
  $Token = (Get-Content -Path $jwtFile -Raw).Trim()
}
if (-not $Token) {
  Write-Error "Sin token. Ejecuta primero: .\login.ps1 -Username ... -Password ...`nO define `$env:GRPC_JWT"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$importPath = Join-Path $repoRoot "src\main\proto"
$bodyFile = Join-Path $PSScriptRoot "body-listar.json"
if (-not (Test-Path $bodyFile)) { Write-Error "No existe $bodyFile" }

Get-Content -LiteralPath $bodyFile -Raw -Encoding UTF8 | & grpcurl `
  -plaintext `
  -import-path $importPath `
  -proto encuesta.proto `
  -H "authorization: Bearer $Token" `
  -d '@' `
  "localhost:$GrpcPort" `
  "proyecto2.encuesta.EncuestaService/ListarFormularios"

if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
