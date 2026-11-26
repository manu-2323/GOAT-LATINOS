<#
  Static verification of supabase/migration-telefonos-1.2.1.sql.
  It does not run SQL against PostgreSQL. It reads the file and checks
  structure, country maps, security settings and RPC consistency.
#>
param(
  [string]$Migration = (Join-Path $PSScriptRoot '..\supabase\migration-telefonos-1.2.1.sql')
)

$ErrorActionPreference = 'Stop'
$sql = Get-Content -Raw -Encoding UTF8 -LiteralPath $Migration
$failures = New-Object System.Collections.Generic.List[string]

function Assert-Contains([string]$name, [string]$needle) {
  if ($sql -notlike "*$needle*") { $failures.Add("MISSING: $name -> $needle") }
}
function Assert-NotContains([string]$name, [string]$needle) {
  if ($sql -like "*$needle*") { $failures.Add("FORBIDDEN: $name -> $needle") }
}
function Assert-Regex([string]$name, [string]$pattern) {
  if (-not [regex]::IsMatch($sql, $pattern, 'Singleline')) {
    $failures.Add("MISSING REGEX: $name -> $pattern")
  }
}
function Assert-Count([string]$name, [string]$pattern, [int]$expected) {
  $n = [regex]::Matches($sql, $pattern, 'Singleline').Count
  if ($n -ne $expected) { $failures.Add("COUNT: $name expected $expected, got $n") }
}

# --- General structure ------------------------------------------------------
Assert-Contains 'transaction start' 'begin;'
Assert-Contains 'transaction end' 'commit;'
Assert-Contains 'design comment' 'Nunca se deriva de formato ni de isValid()'

# --- Preflight and role -----------------------------------------------------
Assert-Contains 'preflight gl_es_admin' "to_regprocedure('public.gl_es_admin()')"
Assert-Contains 'preflight auth.uid' "to_regprocedure('auth.uid()')"
Assert-Contains 'effective membership' "pg_has_role('gl_owner', 'authenticated', 'USAGE')"
Assert-Contains 'restrictive policy preflight' "permissive = 'RESTRICTIVE'"
Assert-Contains 'existing duplicates preflight' 'Existen E.164 can?nicos duplicados'
Assert-Contains 'role creation' 'create role gl_owner'
Assert-Regex 'role attributes' 'create role gl_owner\s+nologin nosuperuser nocreatedb nocreaterole\s+noinherit noreplication nobypassrls'
Assert-NotContains 'BYPASSRLS granted' 'grant bypassrls'
Assert-NotContains 'role as table owner' 'alter table public.jugadores owner to gl_owner'

# --- Audit ------------------------------------------------------------------
Assert-Contains 'private schema' 'create schema if not exists auditoria'
Assert-Contains 'audit table' 'create table if not exists auditoria.telefonos_confirmados'
Assert-Contains 'audit RLS' 'alter table auditoria.telefonos_confirmados enable row level security'
Assert-Contains 'evidence column' 'add column if not exists evidencia text'
Assert-NotContains 'table deletion' 'drop table'

# --- Columns ----------------------------------------------------------------
Assert-Contains 'E164 column' 'add column if not exists telefono_e164 text'
Assert-Contains 'national column' 'add column if not exists telefono_nacional text'
Assert-Contains 'phone country column' 'add column if not exists pais_telefono text'
Assert-Contains 'verified column' 'add column if not exists telefono_verificado boolean not null default false'
Assert-Contains 'plan validity column' 'add column if not exists telefono_valido_plan boolean'
Assert-Contains 'ownership comment' 'Confirmaci?n de titularidad hecha por una persona'
if ([regex]::IsMatch($sql, '(?m)^\s*check\s*\(', 'Singleline')) {
  $failures.Add('FORBIDDEN: column CHECK constraint')
}

# --- Legacy signature -------------------------------------------------------
Assert-Contains 'legacy rename' 'rename to gl_confirmar_e164_legacy'
Assert-NotContains 'legacy DROP' 'drop function'

# --- Normalization CTEs -----------------------------------------------------
foreach ($cte in @(
  'base as', 'pais_estado as', 'pais_resuelto as', 'preparado as',
  'e164_prefijo as', 'tel_prefijo as', 'con_pais as', 'con_historico as',
  'clasificado as', 'existentes_normalizados as', 'existentes_bloqueantes as',
  'existentes_no_estructurales as', 'conflictos as', 'conflictos_agrupados as',
  'con_duplicado as', 'nacional_evaluado as'
)) { Assert-Contains "CTE $cte" $cte }

Assert-Contains 'leading zero category' 'cero_inicial_revision'
Assert-Contains 'country conflict category' 'pais_conflictivo'
Assert-Contains 'historical contradiction category' 'e164_contradice_historico'
Assert-Contains 'no historical confirmation category' 'e164_sin_confirmacion_historica'
Assert-Contains 'duplicate category' 'duplicado_posible'
Assert-NotContains 'historical phone write' "`ntelefono = "
Assert-Contains 'idempotence guard' 'is distinct from'

# --- Indexes ----------------------------------------------------------------
Assert-Contains 'simple index' 'jugadores_telefono_e164_idx'
Assert-Contains 'canonical unique index' 'jugadores_e164_canonicalizado_uniq'
Assert-Contains 'partial unique index' 'create unique index if not exists jugadores_e164_canonicalizado_uniq'

# --- RPC --------------------------------------------------------------------
Assert-Contains 'final signature' 'p_jugador_id uuid,'
Assert-Contains 'reason parameter' 'p_motivo text,'
Assert-Contains 'ownership parameter' 'p_confirmar_titularidad boolean default false'
Assert-Contains 'evidence parameter' 'p_evidencia text default null'
Assert-Contains 'security definer' 'security definer'
Assert-Contains 'empty search path' "set search_path = ''"
Assert-Contains 'v_admin source' 'v_admin := auth.uid()'
Assert-Contains 'admin validation' 'if not public.gl_es_admin() then'
Assert-Contains 'mandatory reason' 'El motivo es obligatorio'
Assert-Contains 'canonical regex' "p_e164 !~ '"
Assert-Contains 'no leading zero in RPC' "pg_catalog.left(p_e164, 1) <> '+'"
Assert-Contains 'advisory lock' 'pg_advisory_xact_lock'
Assert-Contains 'stacked diagnostics' 'get stacked diagnostics'
Assert-Contains 'constraint identification' "v_restriccion = 'jugadores_e164_canonicalizado_uniq'"
Assert-Contains 'non phone unique error' 'Violaci?n de unicidad no telef?nica'
Assert-Contains 'plan invalidation' 'telefono_valido_plan = null'
Assert-NotContains 'automatic verified marking' 'telefono_verificado = true'

# --- Policies and grants ----------------------------------------------------
Assert-Count 'restrictive policies' 'as restrictive' 5
Assert-Contains 'select policy' 'gl_rpc_select_jugadores'
Assert-Contains 'update policy' 'gl_rpc_update_jugadores'
Assert-Contains 'insert block policy' 'gl_rpc_block_insert_jugadores'
Assert-Contains 'delete block policy' 'gl_rpc_block_delete_jugadores'
Assert-Contains 'audit insert policy' 'gl_rpc_insert_auditoria'
Assert-Contains 'player GUC' "current_setting('app.gl_jugador_id', true)"
Assert-Contains 'admin GUC' "current_setting('app.gl_admin_id', true)"
Assert-Contains 'column select grant' 'grant select (id, telefono_e164, telefono_verificado)'
Assert-Contains 'column update grant' 'grant update (telefono_e164, telefono_valido_plan, telefono_verificado)'
Assert-Contains 'column insert grant' 'grant insert ('
Assert-NotContains 'broad audit insert grant' 'grant insert on auditoria.telefonos_confirmados'
Assert-Contains 'authenticated execute' 'grant execute on function public.gl_confirmar_e164(uuid, text, text, boolean, text)'

# --- Duplicate country maps -------------------------------------------------
$mapPattern = '(?sm)^[ \t]*with\s+map\(pais,\s*prefijo,\s*longitudes\)\s+as\s*\(\s*^[ \t]*values\s*$(.*?)^[ \t]*\),\s*$'
$tuplePattern = "\('([A-Z]{2})'\s*,\s*'(\d+)'\s*,\s*array\[([\d,\s]+)\]\)"
$blocks = [regex]::Matches($sql, $mapPattern, 'Singleline')

function Convert-Map([System.Text.RegularExpressions.Match]$block) {
  $tuples = [regex]::Matches($block.Groups[1].Value, $tuplePattern)
  return @($tuples | ForEach-Object {
    '{0}|{1}|{2}' -f $_.Groups[1].Value, $_.Groups[2].Value, ($_.Groups[3].Value -replace '\s','')
  } | Sort-Object)
}

if ($blocks.Count -ne 2) {
  $failures.Add("MAP: expected 2 map blocks, got $($blocks.Count)")
}

$mapMigration = @()
$mapRpc = @()
if ($blocks.Count -ge 1) { $mapMigration = @(Convert-Map $blocks[0]) }
if ($blocks.Count -ge 2) { $mapRpc = @(Convert-Map $blocks[1]) }

if ($mapMigration.Count -ne 16) {
  $failures.Add("MAP: migration has $($mapMigration.Count) countries, expected 16")
}
if ($mapRpc.Count -ne 16) {
  $failures.Add("MAP: RPC has $($mapRpc.Count) countries, expected 16")
}
if (($mapMigration -join ';') -ne ($mapRpc -join ';')) {
  $failures.Add('MAP: migration and RPC maps differ')
}

# --- Result -----------------------------------------------------------------
if ($failures.Count -gt 0) {
  Write-Host "STATIC VERIFICATION FAILED: $($failures.Count) problem(s)" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  exit 1
}

Write-Host 'STATIC VERIFICATION OK' -ForegroundColor Green
Write-Host '  - begin/commit and catalog preflight' -ForegroundColor Green
Write-Host '  - gl_owner without login/superuser/inherit/bypassrls' -ForegroundColor Green
Write-Host '  - 16 countries with identical maps in migration and RPC' -ForegroundColor Green
Write-Host '  - unique index, advisory lock and specific unique_violation' -ForegroundColor Green
Write-Host '  - permissive plus restrictive RLS and column grants' -ForegroundColor Green
exit 0
