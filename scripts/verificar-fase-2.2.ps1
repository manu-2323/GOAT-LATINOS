<#
  Verificación estática LOCAL de la FASE 2.2.
  NO conecta con Supabase, NO aplica SQL, NO despliega nada.
  Comprueba el contrato de la migración correctiva, las garantías del frontend
  y la presencia de los 14 escenarios de prueba.
#>
param(
  [string]$Raiz = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'
$failures = New-Object System.Collections.Generic.List[string]
$cache = @{}

function Texto([string]$rel) {
  if (-not $cache.ContainsKey($rel)) {
    $ruta = Join-Path $Raiz $rel
    if (-not (Test-Path -LiteralPath $ruta)) {
      $failures.Add("MISSING FILE: $rel")
      $cache[$rel] = ''
    } else {
      $cache[$rel] = Get-Content -Raw -Encoding UTF8 -LiteralPath $ruta
    }
  }
  return $cache[$rel]
}
function Tiene([string]$rel, [string]$needle) {
  if (-not (Texto $rel).Contains($needle)) { $failures.Add("MISSING: $rel -> $needle") }
}
function NoTiene([string]$rel, [string]$needle) {
  if ((Texto $rel).Contains($needle)) { $failures.Add("FORBIDDEN: $rel -> $needle") }
}
function RegexExiste([string]$rel, [string]$pattern) {
  if (-not [regex]::IsMatch((Texto $rel), $pattern, 'Singleline')) {
    $failures.Add("MISSING REGEX: $rel -> $pattern")
  }
}
function ColumnasGrant([string]$sqlTexto, [string]$rol, [string]$operacion) {
  $patron = 'grant\s+' + $operacion + '\s*\(([^)]*)\)\s*on\s+([\w.]+)\s+to\s+' + $rol + '\s*;'
  return @([regex]::Matches($sqlTexto, $patron, 'IgnoreCase') | ForEach-Object {
    [pscustomobject]@{
      Tabla    = $_.Groups[2].Value
      Columnas = @($_.Groups[1].Value.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Sort-Object)
    }
  })
}
function Assert-ColumnasIguales([string]$nombre, [string[]]$actuales, [string[]]$esperadas) {
  $a = @($actuales | Sort-Object)
  $e = @($esperadas | Sort-Object)
  if (($a -join '|') -ne ($e -join '|')) {
    $failures.Add("$nombre -> esperadas: $($e -join ','); actuales: $($a -join ',')")
  }
}

$sql = Texto 'supabase/migration-telefonos-2.2.sql'

# --- Migración separada y orden de aplicación ---------------------------------
Tiene 'supabase/migration-telefonos-2.2.sql' 'begin;'
Tiene 'supabase/migration-telefonos-2.2.sql' 'commit;'
Tiene 'supabase/migration-telefonos-2.2.sql' 'supabase/migration-telefonos-1.2.1.sql'
Tiene 'supabase/migration-telefonos-2.2.sql' 'ESTA MIGRACIÓN'
NoTiene 'supabase/migration-telefonos-1.2.1.sql' 'jugadores_user_id_uniq'

# --- Normalización histórica: exige auditoría del mismo E.164 ------------------
RegexExiste 'supabase/migration-telefonos-2.2.sql' 'update public\.jugadores j\s+set telefono_verificado = false'
Tiene 'supabase/migration-telefonos-2.2.sql' "a.accion = 'confirmacion_e164_y_titularidad'"
Tiene 'supabase/migration-telefonos-2.2.sql' 'not exists'
RegexExiste 'supabase/migration-telefonos-2.2.sql' 'a\.jugador_id = j\.id'
Tiene 'supabase/migration-telefonos-2.2.sql' 'a.valor_nuevo = j.telefono_e164'
Tiene 'supabase/migration-telefonos-2.2.sql' "nullif(pg_catalog.btrim(pg_catalog.coalesce(a.evidencia, '')), '') is not null"
Tiene 'supabase/migration-telefonos-2.2.sql' 'select pg_catalog.max(a2.id)'

# --- Titularidad ligada al número y autorizada por auditoría en la tx ----------
Tiene 'supabase/migration-telefonos-2.2.sql' 'add column if not exists txid bigint'
Tiene 'supabase/migration-telefonos-2.2.sql' 'auditoria.gl_tiene_confirmacion_tx'
Tiene 'supabase/migration-telefonos-2.2.sql' 'a.txid = pg_catalog.txid_current()'
Tiene 'supabase/migration-telefonos-2.2.sql' 'pg_catalog.txid_current()'
Tiene 'supabase/migration-telefonos-2.2.sql' 'v_nuevo is distinct from v_anterior'
Tiene 'supabase/migration-telefonos-2.2.sql' 'before insert or update of'
Tiene 'supabase/migration-telefonos-2.2.sql' 'telefono, telefono_nacional, pais_telefono, telefono_verificado'
NoTiene 'supabase/migration-telefonos-2.2.sql' 'app.gl_confirmacion_autorizada'

# --- Unicidad de user_id y preflight ------------------------------------------
Tiene 'supabase/migration-telefonos-2.2.sql' 'create unique index if not exists jugadores_user_id_uniq'
Tiene 'supabase/migration-telefonos-2.2.sql' 'having pg_catalog.count(*) > 1'

# --- Privilegios efectivos (conjuntos exactos) ---------------------------------
$updAuth = @(ColumnasGrant $sql 'authenticated' 'update')
if ($updAuth.Count -ne 1 -or $updAuth[0].Tabla -ne 'public.jugadores') {
  $failures.Add('GRANT UPDATE authenticated: se esperaba una sola sentencia sobre public.jugadores')
} else {
  Assert-ColumnasIguales 'GRANT UPDATE authenticated' $updAuth[0].Columnas @(
    'nombre_usuario','pais','zona_horaria','avatar_url','activo','suspendido',
    'rol','torneo_id','numero','telefono','telefono_e164','telefono_nacional',
    'pais_telefono','telefono_valido_plan'
  )
}

$insAuth = @(ColumnasGrant $sql 'authenticated' 'insert')
if ($insAuth.Count -ne 1) {
  $failures.Add('GRANT INSERT authenticated: se esperaba una sola sentencia')
} elseif ($insAuth[0].Columnas -contains 'telefono_verificado') {
  $failures.Add('GRANT INSERT authenticated: telefono_verificado NO debe concederse')
} elseif (-not ($insAuth[0].Columnas -contains 'user_id')) {
  $failures.Add('GRANT INSERT authenticated: falta user_id')
}

foreach ($rol in @('public','anon','authenticated')) {
  $upd = @(ColumnasGrant $sql $rol 'update')
  foreach ($g in $upd) {
    if ($g.Columnas -contains 'telefono_verificado') {
      $failures.Add("GRANT UPDATE ${rol}: telefono_verificado NO debe concederse")
    }
  }
}

# --- RPC: firma, autorización y sin GUC cliente --------------------------------
RegexExiste 'supabase/migration-telefonos-2.2.sql' 'public\.gl_confirmar_e164\(\s*p_jugador_id uuid,\s*p_e164 text,\s*p_motivo text,\s*p_confirmar_titularidad boolean default false,\s*p_evidencia text default null\s*\)'
Tiene 'supabase/migration-telefonos-2.2.sql' 'v_admin := auth.uid()'
Tiene 'supabase/migration-telefonos-2.2.sql' 'not public.gl_es_admin()'
Tiene 'supabase/migration-telefonos-2.2.sql' "'validacion_plan', 'pendiente_js'"
Tiene 'supabase/migration-telefonos-2.2.sql' "'recalculo_requerido', true"

# --- Frontend: coherencia de estados y recuperación ----------------------------
Tiene 'js/core/supabase.js' '_perfilEnCurso'
Tiene 'js/core/supabase.js' 'perfilPendienteTelefono'
Tiene 'js/core/supabase.js' '_mensajeErrorPerfil(error)'
Tiene 'js/core/supabase.js' '_esConflictoUserId(error)'
Tiene 'js/core/supabase.js' 'recuperarPerfilConTelefono(valor, codigoPais)'
Tiene 'js/core/supabase.js' 'confirmarYRecalcular(args)'
Tiene 'js/core/supabase.js' 'reintentarRecalculo(jugadorId, e164)'
NoTiene 'js/core/supabase.js' 'if (error) console.warn(''Perfil jugador:'''
NoTiene 'js/core/supabase.js' 'telefono_verificado: !!'

Tiene 'js/modulos/admin.js' 'Auth.confirmarYRecalcular('
Tiene 'js/modulos/admin.js' 'Auth.reintentarRecalculo('
Tiene 'js/modulos/admin.js' 'Reintentar validación del plan'
Tiene 'js/modulos/perfil.js' 'data-recuperar-telefono'
Tiene 'js/modulos/perfil.js' 'Auth.recuperarPerfilConTelefono('

# --- Pruebas de los 14 escenarios ---------------------------------------------
Tiene 'tests/fase-2.2.test.js' "describe('FASE 2.2 — 14 escenarios'"
foreach ($n in 1..14) {
  RegexExiste 'tests/fase-2.2.test.js' ("it\('" + $n + "\. ")
}
Tiene 'tests/telefonia-1.2.1.test.js' '2.2: un error de SELECT nunca desencadena una inserción'
Tiene 'tests/migracion-telefonia-1.2.1.test.js' "describe('Migración correctiva 2.2"

# --- Resultado -----------------------------------------------------------------
if ($failures.Count -gt 0) {
  Write-Host "FASE 2.2 STATIC VERIFICATION FAILED: $($failures.Count) problem(s)" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  exit 1
}
Write-Host 'FASE 2.2 STATIC VERIFICATION OK' -ForegroundColor Green
Write-Host '  - historical normalization requires human audit for the same E.164' -ForegroundColor Green
Write-Host '  - ownership invalidated on number change/deletion, audit-bound authorization' -ForegroundColor Green
Write-Host '  - authenticated keeps legitimate column privileges without telefono_verificado' -ForegroundColor Green
Write-Host '  - profile single-flight, safe recovery and partial RPC state present' -ForegroundColor Green
Write-Host '  - 14 scenarios declared in tests/fase-2.2.test.js' -ForegroundColor Green
exit 0
