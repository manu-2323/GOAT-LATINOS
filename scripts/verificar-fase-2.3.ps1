<#
  Verificación estática LOCAL de la FASE 2.3.
  NO conecta con Supabase, NO aplica SQL, NO despliega nada.
  Comprueba el contrato corregido, la migración autoritativa, el frontend y
  la presencia de los 20 escenarios. Las pruebas SQL reales siguen pendientes.
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
function NoExisteRegex([string]$rel, [string]$pattern) {
  if ([regex]::IsMatch((Texto $rel), $pattern, 'Singleline')) {
    $failures.Add("FORBIDDEN REGEX: $rel -> $pattern")
  }
}

$m23 = 'supabase/migration-seguridad-2.3.sql'
$m22 = 'supabase/migration-telefonos-2.2.sql'
$sqlTests = 'supabase/tests/fase-2.3.sql'
$testsJs = 'tests/fase-2.3.test.js'

# --- Archivos y versionado ---------------------------------------------------
RegexExiste $m23 'DEFINICI.N AUTORITATIVA'
Tiene $m23 'begin;'
Tiene $m23 'commit;'
Tiene $m23 'notify pgrst'
Tiene $m22 '5) supabase/migration-seguridad-2.3.sql'
RegexExiste $m22 'No ejecutar 2\.2 sin aplicar 2\.3'
NoExisteRegex $m23 'Always la invalidaci.n'

# --- Una sola definición de gl_proteger_rol() -------------------------------
NoExisteRegex 'supabase/configuracion-completa.sql' 'create\s+or\s+replace\s+function\s+public\.gl_proteger_rol'
NoExisteRegex 'supabase/migration-mejoras-1-9.sql' 'create\s+or\s+replace\s+function\s+public\.gl_proteger_rol'
RegexExiste $m23 'create\s+or\s+replace\s+function\s+public\.gl_proteger_rol\(\)'
Tiene $m23 'if auth.role() = ''service_role'' then'
Tiene $m23 'v_es_propio := OLD.user_id is not null and OLD.user_id = auth.uid()'
RegexExiste $m23 'No pod.s modificar tus propios privilegios, torneo o flags'
Tiene $m23 'Solo el administrador principal puede promover a administrador'
Tiene $m23 'OLD.rol = ''expulsado'' and NEW.rol = ''jugador'''
Tiene $m23 'v_es_super := public.gl_es_super_admin()'

# --- INSERT seguro y RLS -----------------------------------------------------
Tiene $m23 'create or replace function public.gl_proteger_insercion_jugador()'
Tiene $m23 'NEW.rol := ''jugador'''
Tiene $m23 'NEW.super_admin := false'
Tiene $m23 'NEW.activo := true'
Tiene $m23 'NEW.suspendido := false'
Tiene $m23 'NEW.numero := null'
Tiene $m23 "where estado = 'activo'"
Tiene $m23 'create policy gl_23_solo_insert_propio on public.jugadores as restrictive'
Tiene $m23 'create policy gl_23_solo_update_propio_o_admin on public.jugadores as restrictive'
Tiene $m23 'create policy gl_23_bloquea_delete_clientes on public.jugadores as restrictive'
Tiene $m23 'using (false)'

# --- Privilegios: sin columnas sensibles -------------------------------------
Tiene $m23 'revoke all on public.jugadores from public, anon, authenticated'
NoExisteRegex $m23 'grant\s+(update|insert)\s*\([^)]*\b(super_admin|telefono_verificado)\b[^;]*\bto\s+authenticated\b'
NoExisteRegex $m23 'grant\s+(insert|update|delete)\s+on\s+public\.jugadores'
Tiene $m23 'revoke select on public.jugadores from anon'
Tiene $m23 'grant select on public.jugadores_publicos to anon, authenticated'
Tiene $m23 'with (security_invoker = false)'
Tiene $m23 'revoke all on function public.gl_confirmar_e164(uuid, text, text, boolean, text)'

# --- B1/B2/B3 e I1/I2/I4 -----------------------------------------------------
Tiene $m22 'NEW.telefono_verificado is true'
Tiene $m22 'select pg_catalog.max(a2.id)'
Tiene $m22 'a.valor_nuevo = j.telefono_e164'
Tiene $m22 'coalesce(a.evidencia'
Tiene $m22 'telefono_e164 !~ ''^\+[1-9][0-9]{7,14}$'''
Tiene $m22 'NEW.pais_telefono    is distinct from OLD.pais_telefono'
Tiene $m22 'auditoria.gl_tiene_confirmacion_tx(NEW.id, v_nuevo)'
Tiene $m22 'La titularidad requiere evidencia verificable'
NoTiene $m22 'app.gl_confirmacion_autorizada'

# --- Frontend: solo datos personales y estados veraces -----------------------
$js = 'js/core/supabase.js'
Tiene $js '_paisSeguro(valor, respaldo)'
Tiene $js '_esConflictoTelefono(error)'
Tiene $js '_marcarErrorPerfil(error)'
Tiene $js 'recuperarPerfilConTelefono(valor, codigoPais)'
NoTiene $js "rol: 'jugador',"
NoTiene $js 'torneo_id: GL.torneo() ? GL.torneo().id : null'
NoTiene $js 'telefono_verificado: !!'
RegexExiste $js 'confirmada:\s*Boolean\('
RegexExiste $js 'Auth\.perfilPendienteTelefono = null;'
Tiene 'js/modulos/perfil.js' 'data-reintentar-perfil'
Tiene 'js/modulos/admin.js' 'La titularidad requiere evidencia verificable.'

# --- Pruebas y plantilla SQL --------------------------------------------------
Tiene $testsJs "describe('FASE 2.3 - 20 escenarios de seguridad'"
foreach ($n in 1..20) {
  RegexExiste $testsJs ("it\('" + $n + "\. ")
}
Tiene $sqlTests 'ESTADO: NO EJECUTADA.'
Tiene $sqlTests 'rollback;'
foreach ($n in 1..20) {
  RegexExiste $sqlTests ('--\s*' + $n + '\)')
}
Tiene $sqlTests 'NO APLICABLE en SQL'

# --- Resultado ---------------------------------------------------------------
if ($failures.Count -gt 0) {
  Write-Host "FASE 2.3 STATIC VERIFICATION FAILED: $($failures.Count) problem(s)" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  exit 1
}
Write-Host 'FASE 2.3 STATIC VERIFICATION OK' -ForegroundColor Green
Write-Host '  - authoritative PostgreSQL security and single role trigger definition' -ForegroundColor Green
Write-Host '  - safe INSERT/UPDATE/DELETE model with no privileged columns from JS' -ForegroundColor Green
Write-Host '  - corrected B1/B2/B3 and canonical phone ownership rules present' -ForegroundColor Green
Write-Host '  - 20 Vitest scenarios and non-executed PostgreSQL template present' -ForegroundColor Green
Write-Host '  - real SQL execution remains PENDING in an authorized test database' -ForegroundColor Yellow
exit 0
