# Bygger och deployar Läsäventyret till servern (lasaventyret.elf98.com).
#   .\deploy.ps1            bygg + kopiera dist/
#   .\deploy.ps1 -SkipBuild bara kopiera
param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$server = 'erik@159.89.22.162'
$remote = '/var/www/lasaventyret'
Set-Location $PSScriptRoot

if (-not $SkipBuild) {
    # Dropbox kan låsa filer i dist/ ett ögonblick (EPERM); försök en gång till.
    npm run build
    if ($LASTEXITCODE -ne 0) { Start-Sleep -Seconds 3; npm run build }
    if ($LASTEXITCODE -ne 0) { throw 'Bygget misslyckades' }
}
if (-not (Test-Path 'dist/index.html')) { throw 'dist/ saknas' }

# tar över ssh: en anslutning, behåller mappstruktur, inga glob-problem på Windows.
# Röret går via cmd.exe: PowerShell 5.1 gör om binär pipe-data till text och arkivet
# kommer fram trasigt ("This does not look like a tar archive").
ssh $server "mkdir -p $remote"
cmd /c "tar -C dist -cf - . | ssh $server ""tar -C $remote -xf - && find $remote -type f -exec chmod 644 {} + && find $remote -type d -exec chmod 755 {} +"" "
if ($LASTEXITCODE -ne 0) { throw 'Kopieringen misslyckades' }
Write-Host "Deployat till https://lasaventyret.elf98.com" -ForegroundColor Green
