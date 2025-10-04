$nodeDir = Join-Path $env:USERPROFILE 'node-v22.12.0'

if (-not (Test-Path (Join-Path $nodeDir 'node.exe'))) {
  Write-Error "Expected node.exe at $nodeDir. Re-run the setup script."
  exit 1
}

if ($env:PATH -notlike "$nodeDir;*") {
  $env:PATH = "$nodeDir;" + $env:PATH
}

Write-Host "Node 22 environment loaded for this session." -ForegroundColor Cyan
& (Join-Path $nodeDir 'node.exe') --version