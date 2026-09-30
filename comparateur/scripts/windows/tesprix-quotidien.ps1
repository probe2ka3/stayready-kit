<#
.SYNOPSIS
  Collecte quotidienne des prix TesPrix (lancée par le Planificateur de tâches Windows).

.DESCRIPTION
  Exécute `pnpm job quotidien` dans le dossier `comparateur` et écrit un journal par jour dans
  `data\private\logs\`. La commande elle-même :
    - ne collecte qu'une fois par jour (heure de Zurich) ; relancée le même jour (rattrapage,
      ouverture de session, nouvel essai après échec), elle ne reprend que les sources en échec ;
    - isole chaque enseigne : une panne chez l'une n'arrête pas les autres ;
    - n'appelle aucune API d'IA ni aucun service payant.
  Code de sortie : 0 = au moins une source a produit des données ; 2 = pas de connexion Internet ;
  autre = échec (le Planificateur relance la tâche selon ses paramètres).
#>
[CmdletBinding()]
param(
  # Relance toutes les sources même si la collecte du jour a déjà eu lieu.
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$logDir = Join-Path $repo 'data\private\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("quotidien-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

function Write-Log([string]$message) {
  $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Host $line
}

# Journaux de plus de 60 jours supprimés.
Get-ChildItem -Path $logDir -Filter 'quotidien-*.log' |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-60) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

Write-Log "Début de la collecte quotidienne (dossier : $repo)"

# Connexion Internet : sans elle, rien n'est tenté (les anciens prix gardent leur date).
$online = $false
foreach ($target in @('sortiment.lidl.ch', 'www.denner.ch', 'prices.openfoodfacts.org')) {
  try {
    Resolve-DnsName -Name $target -ErrorAction Stop | Out-Null
    $online = $true
    break
  } catch { }
}
if (-not $online) {
  Write-Log 'Pas de connexion Internet : collecte reportée (code 2).'
  exit 2
}

# Node.js et pnpm : ceux de l'installation de l'utilisateur (corepack si pnpm n'est pas dans le PATH).
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if ($pnpm) {
  $exe = $pnpm.Source
  $prefix = @()
} else {
  $corepack = Get-Command corepack -ErrorAction SilentlyContinue
  if (-not $corepack) {
    Write-Log 'Ni pnpm ni corepack introuvables : installer Node.js 22 puis exécuter « corepack enable ».'
    exit 3
  }
  $exe = $corepack.Source
  $prefix = @('pnpm')
}

# « -C apps\worker » : sortie diffusée au fil de l'eau dans le journal (pnpm --filter la retient).
$arguments = $prefix + @('-s', '-C', 'apps\worker', 'job', 'quotidien')
if ($Force) { $arguments += '--force' }

Push-Location $repo
try {
  $started = Get-Date
  # Windows PowerShell 5.1 : une ligne sur la sortie d'erreur de Node ne doit pas interrompre le script,
  # et le journal reste en UTF-8 (la redirection « >> » écrirait en UTF-16).
  $ErrorActionPreference = 'Continue'
  & $exe @arguments 2>&1 | ForEach-Object { "$_" } | Out-File -FilePath $log -Append -Encoding utf8
  $code = $LASTEXITCODE
  $minutes = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)
  Write-Log "Fin de la collecte : code $code, durée $minutes min. Détail : data\private\runs\latest.json"
  exit $code
} finally {
  Pop-Location
}
