<#
  Verificacion estatica LOCAL de FASE 3.1.
  No conecta con Supabase, no despliega y no aplica el sistema globalmente.
  Comprueba que los tokens canonicos existen y que el HTML/CSS actual
  todavia NO los carga.
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

$tokens = 'css/tokens-3.1.css'
$doc = 'docs/fase-3.1-sistema-visual.md'
$html = 'index.html'
$css = 'css/estilos.css'

# El sistema queda definido pero NO enlazado todavia.
NoTiene $html 'tokens-3.1.css'
NoTiene $css 'tokens-3.1.css'
Tiene $tokens 'NO APLICADO GLOBALMENTE'
RegexExiste $doc 'no aplicado globalmente'

# Paleta propuesta y roles derivados por contraste.
Tiene $tokens '--gl-bg: #0B0D10'
Tiene $tokens '--gl-surface-1: #14171B'
Tiene $tokens '--gl-surface-2: #20252B'
Tiene $tokens '--gl-brand: #E11D35'
Tiene $tokens '--gl-text: #F5F6F7'
Tiene $tokens '--gl-text-secondary: #9299A3'
Tiene $tokens '--gl-brand-text: #FF6B7A'
Tiene $tokens '--gl-text-tertiary: #7A828E'

# Tipografia: una familia, minimo 12px, numeros tabulares.
Tiene $tokens "--gl-font-sans: 'Inter'"
RegexExiste $tokens '--gl-fs-2xs: 12px'
NoTiene $tokens '--gl-fs-2xs: 11px'
Tiene $tokens '--gl-numeric: tabular-nums'
RegexExiste $tokens '--gl-fw-bold: 700'

# Iconografia: una libreria y una escala cerrada.
Tiene $tokens '--gl-icon-xs: 14px'
Tiene $tokens '--gl-icon-xl: 24px'
Tiene $tokens '--gl-icon-stroke: 1.8'
RegexExiste $doc 'Lucide'

# La documentacion debe registrar la validacion de contraste.
RegexExiste $doc '4\.10:1'
RegexExiste $doc '2\.57:1'
RegexExiste $doc '7\.08:1'

if ($failures.Count -gt 0) {
  Write-Host "FASE 3.1 STATIC VERIFICATION FAILED: $($failures.Count) problem(s)" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  exit 1
}
Write-Host 'FASE 3.1 STATIC VERIFICATION OK' -ForegroundColor Green
Write-Host '  - canonical tokens defined and NOT linked globally yet' -ForegroundColor Green
Write-Host '  - proposed palette plus accessible derived roles present' -ForegroundColor Green
Write-Host '  - Inter-only typography with 12px minimum and tabular numbers' -ForegroundColor Green
Write-Host '  - single Lucide icon scale and stroke defined' -ForegroundColor Green
Write-Host '  - current-screen validation and contrast evidence documented' -ForegroundColor Yellow
exit 0
