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
  Avec -DepotEtat (clone du dépôt privé tesprix-collecte), la tâche partage le journal de GitHub
  Actions : état lu puis réécrit dans ce dépôt, verrou commun, suivi commun (etat/suivi/SUIVI.md).
  Une seule collecte par jour de Zurich, quel que soit le système qui la fait ; si GitHub a déjà
  collecté, la tâche note « rien à faire » et s'arrête.
  Code de sortie : 0 = au moins une source a produit des données ; 2 = pas de connexion Internet ;
  4 = état partagé inaccessible (rien n'est collecté, pour ne pas collecter deux fois) ;
  autre = échec (le Planificateur relance la tâche selon ses paramètres).
#>
[CmdletBinding()]
param(
  # Relance toutes les sources même si la collecte du jour a déjà eu lieu.
  [switch]$Force,
  # Heure prévue par la tâche planifiée : un lancement plus tardif est noté comme rattrapage.
  [string]$HeurePrevue = '06:00',
  # Clone local du dépôt privé tesprix-collecte : journal partagé avec GitHub Actions.
  [string]$DepotEtat = '',
  # Lancement par le Planificateur (et non à la main) : noté comme tel dans le suivi.
  [switch]$Planifie
)

$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($PSScriptRoot, '..', '..'))
$logDir = [System.IO.Path]::Combine($repo, 'data', 'private', 'logs')
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = [System.IO.Path]::Combine($logDir, ("quotidien-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd')))

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
$prevue = [datetime]::ParseExact($HeurePrevue, 'HH:mm', $null)
$retard = (Get-Date) - (Get-Date).Date.Add($prevue.TimeOfDay)
if ($retard.TotalMinutes -gt 15) {
  Write-Log ("Lancement à {0:HH:mm}, après l'heure prévue {1} : rattrapage (ordinateur éteint ou en veille à l'heure prévue) ou lancement manuel." -f (Get-Date), $HeurePrevue)
}

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

# --- État partagé avec GitHub Actions (facultatif) ---------------------------------------------
$partage = [bool]$DepotEtat
if ($partage) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $node -or -not $git) {
    Write-Log 'État partagé : node ou git introuvable (installer Node.js 22 et Git pour Windows). Collecte annulée (code 4).'
    exit 4
  }
  $etatJs = [System.IO.Path]::Combine($repo, 'ops', 'actions-prive', 'etat.mjs')
  $etat = [System.IO.Path]::Combine($DepotEtat, 'etat')
  $data = [System.IO.Path]::Combine($repo, 'data')
  $debut = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  $declencheur = if ($Planifie) { 'windows-tache' } else { 'windows-manuel' }

  function Invoke-Git([string[]]$GitArgs) {
    $ErrorActionPreference = 'Continue'
    & $git.Source -C $DepotEtat -c 'user.name=TesPrix (Windows)' -c 'user.email=tesprix-windows@users.noreply.github.com' @GitArgs 2>&1 |
      ForEach-Object { "$_" } | Out-File -FilePath $log -Append -Encoding utf8
    return $LASTEXITCODE
  }
  function Invoke-Etat([string[]]$EtatArgs) {
    $ErrorActionPreference = 'Continue'
    $sortie = & $node.Source $etatJs @EtatArgs 2>&1 | ForEach-Object { "$_" }
    $script:etatCode = $LASTEXITCODE
    $sortie | Out-File -FilePath $log -Append -Encoding utf8
    return ($sortie -join "`n")
  }
  # Enregistrement : en cas de poussée concurrente, repartir du dépôt distant, y recopier notre état
  # (données, exécutions) et régénérer le tableau de suivi.
  function Save-Etat([string]$Message) {
    Invoke-Git @('add', '-A', 'etat') | Out-Null
    & $git.Source -C $DepotEtat diff --cached --quiet
    if ($LASTEXITCODE -eq 0) { return 0 }
    Invoke-Git @('commit', '-q', '-m', $Message) | Out-Null
    if ((Invoke-Git @('push', '-q')) -eq 0) { return 0 }
    $sauve = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "tesprix-etat-$PID")
    Remove-Item -Recurse -Force $sauve -ErrorAction SilentlyContinue
    Copy-Item -Recurse -Path $etat -Destination $sauve
    Invoke-Git @('fetch', '-q') | Out-Null
    Invoke-Git @('reset', '-q', '--hard', '@{u}') | Out-Null
    Copy-Item -Recurse -Force -Path ([System.IO.Path]::Combine($sauve, '*')) -Destination $etat
    if (-not (Test-Path ([System.IO.Path]::Combine($sauve, 'verrou.json')))) { Invoke-Etat @('liberer', $etat) | Out-Null }
    Invoke-Etat @('tableau', $etat) | Out-Null
    Remove-Item -Recurse -Force $sauve -ErrorAction SilentlyContinue
    Invoke-Git @('add', '-A', 'etat') | Out-Null
    Invoke-Git @('commit', '-q', '-m', "$Message (après fusion)") | Out-Null
    return (Invoke-Git @('push', '-q'))
  }
  function Write-Suivi([string[]]$Extra, [string]$Message) {
    Invoke-Etat (@('noter', $etat, '--systeme', 'windows', '--declencheur', $declencheur, '--debut', $debut) + $Extra) | Out-Null
    $verdict = $script:etatCode
    if ((Save-Etat $Message) -ne 0) { Write-Log 'État partagé : enregistrement impossible (git push) ; il sera repris à la prochaine exécution.' }
    return $verdict
  }

  Write-Log "État partagé : $DepotEtat"
  if ((Invoke-Git @('pull', '-q', '--ff-only')) -ne 0) {
    Write-Log 'État partagé inaccessible (git pull) : collecte annulée pour ne pas collecter deux fois (code 4).'
    exit 4
  }
  $pris = $false
  foreach ($essai in 1, 2) {
    $reponse = Invoke-Etat (@('besoin', $etat) + $(if ($Force) { @('--force') } else { @() }))
    if ($reponse -notmatch 'collecte=oui') {
      $issue = if ($reponse -match 'collecte en cours') { 'concurrence' } else { 'rien' }
      Write-Log ("État partagé : {0}" -f (($reponse -split "`n" | Where-Object { $_ -like 'raison=*' }) -replace '^raison=', ''))
      Write-Suivi @('--issue', $issue) ("Suivi du {0:dd.MM.yyyy} : {1} (Windows)" -f (Get-Date), $issue) | Out-Null
      exit 0
    }
    Invoke-Etat @('verrou', $etat, '--systeme', 'windows') | Out-Null
    if ($script:etatCode -eq 0) {
      Invoke-Git @('add', 'etat/verrou.json') | Out-Null
      Invoke-Git @('commit', '-q', '-m', 'Verrou de collecte (Windows)') | Out-Null
      if ((Invoke-Git @('push', '-q')) -eq 0) { $pris = $true; break }
      Invoke-Git @('fetch', '-q') | Out-Null
      Invoke-Git @('reset', '-q', '--hard', '@{u}') | Out-Null
    }
  }
  if (-not $pris) {
    Write-Log 'État partagé : collecte en cours sur un autre système, rien à faire.'
    Write-Suivi @('--issue', 'concurrence') ("Suivi du {0:dd.MM.yyyy} : concurrence (Windows)" -f (Get-Date)) | Out-Null
    exit 0
  }
  Invoke-Etat @('restaurer', $etat, $data) | Out-Null
}

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
  if ($partage) {
    Invoke-Etat @('enregistrer', $data, $etat) | Out-Null
    Invoke-Etat @('liberer', $etat) | Out-Null
    $verdict = Write-Suivi @('--code', "$code") ("Collecte du {0:dd.MM.yyyy}, code {1} (Windows)" -f (Get-Date), $code)
    if ($code -eq 0 -and $verdict -ne 0) {
      Write-Log 'État partagé : au moins une source en échec (voir etat\suivi\SUIVI.md) ; nouvel essai selon le Planificateur.'
      $code = 1
    }
  }
  exit $code
} finally {
  Pop-Location
}
