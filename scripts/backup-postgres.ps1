$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path (Get-Location) "backups"
$backupFile = Join-Path $backupDir "pronunciation_db-$timestamp.sql"

if (!(Test-Path $backupDir)) {
  New-Item -ItemType Directory -Path $backupDir | Out-Null
}

docker exec pronunciation-postgres pg_dump -U postgres pronunciation_db | Out-File -FilePath $backupFile -Encoding utf8

Write-Host "Backup created: $backupFile"
