$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Command failed: exit $LASTEXITCODE" } }
if (!(Test-Path '.env')) {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    (Get-Content '.env.example' -Raw).Replace('replace-with-your-own-secret-at-least-32-characters', $secret) | Set-Content '.env' -Encoding Ascii
} elseif ((Get-Content '.env' -Raw) -match 'replace-with-your-own-secret') {
    throw 'Replace JWT_SECRET placeholder in .env before continuing.'
}
docker compose up -d --build
Check-Exit
$ready = $false
for ($i=0; $i -lt 60; $i++) {
    try {
        $health = Invoke-RestMethod 'http://localhost:4000/api/v1/health' -TimeoutSec 3
        if ($health.ok) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if (!$ready) { throw 'API/MQTT not ready. Check docker compose logs.' }
docker compose exec -T api node seed-users.js
Check-Exit
docker compose exec -T api mkdir -p /app/scripts
Check-Exit
docker compose cp scripts/seed_dashboard.js api:/app/scripts/seed_dashboard.js
Check-Exit
docker compose exec -T api node scripts/seed_dashboard.js
Check-Exit
npm.cmd --prefix client ci
Check-Exit
Write-Host 'Open http://localhost:5173/ (demo credentials in README).'
npm.cmd --prefix client run dev
Check-Exit
