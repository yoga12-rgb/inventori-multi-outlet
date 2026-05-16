param(
  [string]$ContainerName = "kiro-pg-test",
  [string]$Image         = "postgres:16-alpine",
  [int]$HostPort         = 55432,
  [string]$DbName        = "appdb",
  [string]$DbUser        = "postgres",
  [string]$DbPass        = "postgres"
)

$ErrorActionPreference = "Stop"

function Invoke-Sql([string]$file) {
  Write-Host "==> Running $file"
  Get-Content -Raw -Encoding UTF8 $file |
    docker exec -i -e PGPASSWORD=$DbPass $ContainerName `
      psql -v ON_ERROR_STOP=1 -U $DbUser -d $DbName -X -q
  if ($LASTEXITCODE -ne 0) { throw "psql failed on $file" }
}

# Cleanup any previous container (ignore errors if it doesn't exist)
$existing = (& docker ps -aq --filter "name=^/$ContainerName$") 2>$null
if ($existing) { & docker rm -f $ContainerName | Out-Null }
$global:LASTEXITCODE = 0

Write-Host "==> Starting Postgres container ($Image) on port $HostPort"
docker run -d --name $ContainerName `
  -e POSTGRES_PASSWORD=$DbPass `
  -e POSTGRES_DB=$DbName `
  -p "${HostPort}:5432" `
  $Image | Out-Null

# Wait for ready (psql canary — pg_isready kadang return 0 sebelum init script selesai)
$ready = $false
for ($i=0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 1
  try {
    $null = & docker exec -e PGPASSWORD=$DbPass $ContainerName `
              psql -U $DbUser -d $DbName -tA -c "select 1" 2>&1
  } catch {
    $global:LASTEXITCODE = 1
  }
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
}
$global:LASTEXITCODE = 0
if (-not $ready) { throw "Postgres did not become ready" }
Write-Host "==> Postgres ready"

$root = Resolve-Path "$PSScriptRoot\..\.."
$mig  = Join-Path $root "supabase\migrations"
$tst  = Join-Path $root "supabase\tests"

# Order matters
Invoke-Sql (Join-Path $tst "00_bootstrap_test.sql")
Invoke-Sql (Join-Path $mig "01_schema.sql")
Invoke-Sql (Join-Path $mig "02_rls_policies.sql")
Invoke-Sql (Join-Path $mig "03_functions_fifo.sql")
Invoke-Sql (Join-Path $mig "04_functions_transfer.sql")
Invoke-Sql (Join-Path $mig "05_functions_dashboard.sql")
Invoke-Sql (Join-Path $mig "06_seed_data.sql")
Invoke-Sql (Join-Path $mig "07_auth_user_provisioning.sql")
Invoke-Sql (Join-Path $mig "08_transaction_categories.sql")
Invoke-Sql (Join-Path $mig "09_inventory_pivot_dynamic.sql")
Invoke-Sql (Join-Path $mig "10_indexes_optimization.sql")
Invoke-Sql (Join-Path $tst "99_seed_test_user.sql")
Invoke-Sql (Join-Path $tst "test_fifo.sql")
Invoke-Sql (Join-Path $tst "test_manual_override.sql")
Invoke-Sql (Join-Path $tst "test_dashboard_agg.sql")
Invoke-Sql (Join-Path $tst "test_rls_per_location.sql")

# Concurrency test berjalan via Node (butuh dua koneksi paralel),
# bukan psql. Skip kalau Node atau modul pg tidak tersedia.
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$concurrencyScript = Join-Path $root "web\scripts\test-concurrency.mjs"
if ($nodeCmd -and (Test-Path $concurrencyScript)) {
  Write-Host "==> Running test-concurrency.mjs (Node)"
  $env:TEST_DATABASE_URL = "postgresql://${DbUser}:${DbPass}@127.0.0.1:${HostPort}/${DbName}"
  & node $concurrencyScript
  if ($LASTEXITCODE -ne 0) { throw "concurrency test failed" }
} else {
  Write-Host "==> SKIP concurrency test (node/script tidak tersedia)"
}
Invoke-Sql (Join-Path $tst "test_provisioning.sql")

Write-Host "==> All scripts executed"
