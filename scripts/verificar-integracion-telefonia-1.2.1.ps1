<#
  Static verification of the 1.2.1 FRONTEND integration.
  It does NOT connect to Supabase, apply the SQL migration, or simulate any
  Supabase response. It only reads local files and checks that every call site
  uses the shared phone service with the pinned libphonenumber-js version.
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

# --- Versión única -----------------------------------------------------------
$version = '1.13.17'
Tiene 'index.html' "libphonenumber-js@$version/bundle/libphonenumber-min.js"
NoTiene 'index.html' 'libphonenumber-js@latest'
Tiene 'js/core/config.js' "LIBPHONENUMBER_VERSION: '$version'"
Tiene 'js/core/config.js' "VERSION: '1.2.1'"
Tiene 'package.json' '"libphonenumber-js": "1.13.17"'
Tiene 'package-lock.json' '"libphonenumber-js": "1.13.17"'
Tiene 'package-lock.json' '"node_modules/libphonenumber-js"'
Tiene 'supabase/functions/admin-crear-jugador/index.ts' "libphonenumber-js@$version/min"

# --- Cache-busting solo en archivos modificados ------------------------------
foreach ($rel in @('js/core/config.js','js/core/gl.js','js/core/supabase.js','js/ui/auth.js','js/ui/onboarding.js','js/modulos/dashboard-admin.js')) {
  Tiene 'index.html' "$rel`?v=1.2.1"
}
foreach ($rel in @('js/core/ui-estados.js','js/core/imagen.js','js/core/clasificacion.js','js/core/estadisticas.js','js/ui/menu.js','js/ui/onboarding-admin.js','js/modulos/notificaciones.js','js/modulos/auditoria.js','js/app.js')) {
  $actual = [regex]::Match((Texto 'index.html'), [regex]::Escape($rel) + '\?v=([0-9.]+)').Groups[1].Value
  if ($actual -eq '1.2.1') { $failures.Add("CACHE: $rel was not changed but was bumped to 1.2.1") }
}

# --- Servicio telefónico central ---------------------------------------------
Tiene 'js/core/gl.js' 'e164Jugador(jugador)'
Tiene 'js/core/gl.js' 'cambiosSiNuevos(valor, codigoPais, jugador)'
Tiene 'js/core/supabase.js' 'telefono_verificado`: eso solo lo confirma una persona'
NoTiene 'js/core/gl.js' 'telefono_verificado:'
Tiene 'js/core/gl.js' 'id,nombre_usuario,pais,zona_horaria,avatar_url,activo,suspendido,rol,torneo_id,numero,telefono,telefono_e164,telefono_nacional,pais_telefono,telefono_verificado,telefono_valido_plan'

# Ningún llamador puede pasar una cadena suelta.
NoTiene 'js/modulos/admin.js' 'GL.linkWhatsapp(j.telefono'
NoTiene 'js/modulos/fixture.js' 'GL.linkWhatsapp(local.telefono'
NoTiene 'js/modulos/fixture.js' 'GL.linkWhatsapp(visita.telefono'
Tiene 'js/modulos/admin.js' 'GL.linkWhatsapp(j, j.nombre_usuario)'
Tiene 'js/modulos/fixture.js' 'GL.linkWhatsapp(local, local.nombre_usuario)'
Tiene 'js/modulos/calendario.js' 'GL.tel.e164Jugador(datos)'
Tiene 'js/modulos/dashboard-admin.js' '!GL.tel.e164Jugador(j)'
Tiene 'js/ui/onboarding.js' '!!GL.tel.e164Jugador(j)'

# --- Formularios respetan el país del teléfono -------------------------------
Tiene 'js/ui/auth.js' 'function paisTelefono()'
Tiene 'js/ui/auth.js' "GL.tel.validar(valor, paisTelefono(), true)"
foreach ($par in @(
  @('js/modulos/perfil.js','perfil-tel-pais'),
  @('js/modulos/admin.js','nt-jug-tel-pais'),
  @('js/modulos/admin.js','ed-tel-pais'),
  @('js/modulos/admin.js','ag-tel-pais')
)) {
  Tiene $par[0] $par[1]
}
NoTiene 'js/modulos/admin.js' 'CONFIG.PAISES'

# --- Nunca se escribe telefono_verificado desde el frontend ------------------
NoTiene 'js/core/gl.js' 'telefono_verificado:'
NoTiene 'js/ui/auth.js' 'telefono_verificado:'
NoTiene 'js/modulos/perfil.js' 'telefono_verificado:'
NoTiene 'js/modulos/admin.js' 'telefono_verificado:'
NoTiene 'js/modulos/fixture.js' 'telefono_verificado:'
NoTiene 'js/modulos/calendario.js' 'telefono_verificado:'
# supabase.js solo puede ignorar/explicitar false; jamás derivarlo de isValid().
RegexExiste 'js/core/supabase.js' 'telefono_verificado ignorado'
NoTiene 'js/core/supabase.js' 'telefono_verificado: !!'

# --- Titularidad y registro con confirmación ---------------------------------
Tiene 'js/modulos/perfil.js' 'Titularidad confirmada'
Tiene 'js/modulos/perfil.js' 'titularidad sin confirmar'
Tiene 'js/core/supabase.js' '_resultadoRegistro(data)'
Tiene 'js/core/supabase.js' 'requiereConfirmacion: true'
Tiene 'js/core/supabase.js' 'options: { data: metadata }'
Tiene 'js/core/supabase.js' '_crearPerfilDesdeMetadata'
Tiene 'js/ui/auth.js' 'resultado.requiereConfirmacion'

# --- Edición sin número nuevo y duplicados -----------------------------------
Tiene 'js/modulos/perfil.js' 'GL.tel.cambiosSiNuevos(telRaw, telPais.value, j)'
Tiene 'js/modulos/admin.js' 'Object.assign(update, telCambios)'
foreach ($rel in @('js/core/supabase.js','js/modulos/admin.js')) {
  Tiene $rel 'jugadores_e164_canonicalizado_uniq'
}

# --- El Edge Function valida en servidor con la misma versión ----------------
Tiene 'supabase/functions/admin-crear-jugador/index.ts' 'telefono_e164: e164'
Tiene 'supabase/functions/admin-crear-jugador/index.ts' 'telefono_nacional: nacional || nacionalCalculado'
Tiene 'supabase/functions/admin-crear-jugador/index.ts' 'pais_telefono: pais'
Tiene 'supabase/functions/admin-crear-jugador/index.ts' 'telefono_valido_plan: true'
Tiene 'supabase/functions/admin-crear-jugador/index.ts' '/^\+[1-9]\d{7,14}$/'
NoTiene 'supabase/functions/admin-crear-jugador/index.ts' 'telefono_verificado:'
Tiene 'supabase/functions/admin-crear-jugador/index.ts' 'admin.auth.admin.deleteUser(creado.user.id)'

# --- Resultado ---------------------------------------------------------------
if ($failures.Count -gt 0) {
  Write-Host "INTEGRATION VERIFICATION FAILED: $($failures.Count) problem(s)" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  exit 1
}
Write-Host 'INTEGRATION VERIFICATION OK' -ForegroundColor Green
Write-Host '  - one pinned libphonenumber-js 1.13.17 and release 1.2.1' -ForegroundColor Green
Write-Host '  - cache-busting bumped only for changed files' -ForegroundColor Green
Write-Host '  - all WhatsApp links take the player object' -ForegroundColor Green
Write-Host '  - every form follows the selected phone country' -ForegroundColor Green
Write-Host '  - no frontend write of telefono_verificado' -ForegroundColor Green
Write-Host '  - confirmation signup, duplicate mapping and server E.164 checks' -ForegroundColor Green
exit 0
