<#
  Verificación estática LOCAL de FASE 3.2.
  No conecta con Supabase, no despliega y no modifica archivos.
  Comprueba que el sistema visual canónico quedó aplicado globalmente.
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
function RegexNoExiste([string]$rel, [string]$pattern) {
  if ([regex]::IsMatch((Texto $rel), $pattern, 'Singleline')) {
    $failures.Add("FORBIDDEN REGEX: $rel -> $pattern")
  }
}

$tokens = 'css/tokens-3.1.css'
$css    = 'css/estilos.css'
$html   = 'index.html'
$gl     = 'js/core/gl.js'
$informe = 'docs/fase-3.2-informe.md'
$capturas = 'docs/capturas-fase-3.2'

# 1) El sistema canónico se carga ANTES que la hoja de componentes.
RegexExiste $html 'css/tokens-3\.1\.css[\s\S]*css/estilos\.css'
Tiene $html 'family=Inter:wght@400;500;600;700;800'
NoTiene $html 'Rajdhani'

# 2) Fuente única: ninguna otra hoja declara :root ni Rajdhani.
RegexNoExiste $css '(?m)^\s*:root\s*\{'
NoTiene $css 'Rajdhani'
$otras = Get-ChildItem -LiteralPath (Join-Path $Raiz 'css') -Filter '*.css' -File
foreach ($f in $otras) {
  if ($f.Name -eq 'tokens-3.1.css') { continue }
  $rel = 'css/' + $f.Name
  if (-not $cache.ContainsKey($rel)) {
    $cache[$rel] = Get-Content -Raw -Encoding UTF8 -LiteralPath $f.FullName
  }
  if ([regex]::IsMatch($cache[$rel], '(?m)^\s*:root\s*\{', 'Singleline')) {
    $failures.Add("FORBIDDEN REGEX: $rel -> :root duplicado")
  }
}

# 3) Roles canónicos y aliases de compatibilidad.
Tiene $tokens '--gl-bg: #0B0D10'
Tiene $tokens '--gl-surface-1: #14171B'
Tiene $tokens '--gl-surface-2: #20252B'
Tiene $tokens '--gl-border: #2E353D'
Tiene $tokens '--gl-text: #F5F6F7'
Tiene $tokens '--gl-text-secondary: #9299A3'
Tiene $tokens '--gl-brand: #E11D35'
Tiene $tokens '--gl-brand-text: #FF6B7A'
Tiene $tokens '--gl-success: #00D4AA'
Tiene $tokens "--gl-font-sans: 'Inter'"
Tiene $tokens '--gl-numeric: tabular-nums'
Tiene $tokens '--gl-icon-stroke: 1.8'
Tiene $tokens '--accent-red: var(--gl-danger)'
Tiene $tokens '--border: var(--gl-border)'

# 4) Iconografía con escala cerrada.
RegexExiste $gl 'const escala = \[14, ?16, ?18, ?20, ?24, ?32\]'
Tiene $css 'stroke-width:var(--gl-icon-stroke)'

# 5) Evidencia de la fase ya entregada.
Tiene $informe 'FASE 3.2'
RegexExiste $informe '80 passed \(80\)'
if (-not (Test-Path -LiteralPath (Join-Path $Raiz $capturas))) {
  $failures.Add("MISSING DIRECTORY: $capturas")
} else {
  $png = @(Get-ChildItem -LiteralPath (Join-Path $Raiz $capturas) -Filter '*.png' -File)
  if ($png.Count -lt 4) { $failures.Add("MISSING EVIDENCE: $capturas -> al menos 4 PNG") }
}

if ($failures.Count -gt 0) {
  Write-Host "FASE 3.2 STATIC VERIFICATION FAILED: $($failures.Count) problem(s)" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  exit 1
}
Write-Host 'FASE 3.2 STATIC VERIFICATION OK' -ForegroundColor Green
Write-Host '  - tokens canónicos cargados antes que estilos.css' -ForegroundColor Green
Write-Host '  - :root único y tipografía Inter-only en la UI global' -ForegroundColor Green
Write-Host '  - aliases legacy definidos solo en tokens-3.1.css' -ForegroundColor Green
Write-Host '  - iconografía Lucide con escala cerrada' -ForegroundColor Green
Write-Host '  - informe y evidencia visual de FASE 3.2 presentes' -ForegroundColor Green
exit 0
