<#
.SYNOPSIS
  Vérifie l'installation et le fonctionnement de la collecte quotidienne TesPrix sur cet ordinateur.

.DESCRIPTION
  Lecture seule : n'installe, ne lance et ne modifie rien. Affiche :
    - la tâche « TesPrix - collecte quotidienne » : présence, état, déclencheurs ;
    - la prochaine exécution, en heure locale et en heure de Zurich ;
    - la dernière exécution et son résultat (code du Planificateur de tâches) ;
    - le rattrapage : réglage « exécuter dès que possible après un démarrage manqué », déclencheur
      à l'ouverture de session, exécutions manquées, et les collectes des derniers jours avec leur
      heure réelle de lancement (data\private\runs) ;
    - l'emplacement et la fin du dernier journal (data\private\logs).
  Code de sortie : 0 = tout est conforme ; 1 = au moins un point à corriger (détaillé à l'écran).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\verifier-tache.ps1
#>
[CmdletBinding()]
param(
  # Nombre de jours d'historique affichés.
  [int]$Jours = 14,
  # Heure prévue de la collecte (celle passée à installer-tache.ps1) ; par défaut 06:00, ou 15:30 si la
  # tâche partage le journal de GitHub (-DepotEtat).
  [string]$Heure
)

$ErrorActionPreference = 'Stop'
$nom = 'TesPrix - collecte quotidienne'
$repo = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($PSScriptRoot, '..', '..'))
$problemes = New-Object System.Collections.Generic.List[string]
$zurichId = 'W. Europe Standard Time'

function Ligne([string]$libelle, [string]$valeur, [bool]$conforme = $true) {
  $marque = if ($conforme) { 'OK ' } else { '!! ' }
  Write-Host ("{0} {1,-44} {2}" -f $marque, $libelle, $valeur)
  if (-not $conforme) { $problemes.Add("$libelle : $valeur") }
}

function ResultatTache([int64]$code) {
  switch ($code) {
    0 { 'succès (0)' }
    1 { 'échec (1) : voir le journal' }
    2 { 'pas de connexion Internet (2) : collecte reportée' }
    3 { 'Node.js ou pnpm introuvable (3)' }
    267009 { 'en cours (0x41301)' }
    267011 { "jamais exécutée (0x41303)" }
    267014 { "arrêtée par l'utilisateur (0x41306)" }
    2147946720 { 'non lancée : conditions non remplies (0x800710E0, réseau ou batterie)' }
    default { "code $code (0x{0:X})" -f $code }
  }
}

Write-Host "Vérification de la collecte quotidienne TesPrix — $(Get-Date -Format 'dd.MM.yyyy HH:mm')"
Write-Host "Dossier : $repo"
Write-Host ''

# 1. Tâche planifiée --------------------------------------------------------------------------
$task = Get-ScheduledTask -TaskName $nom -ErrorAction SilentlyContinue
if (-not $task) {
  Ligne 'Tâche planifiée' "absente : lancer scripts\windows\installer-tache.ps1" $false
} else {
  Ligne 'Tâche planifiée' "« $nom » présente"
  Ligne 'État' "$($task.State)" ("$($task.State)" -in @('Ready', 'Running'))
  $info = Get-ScheduledTaskInfo -TaskName $nom

  # Mode partagé avec GitHub (-DepotEtat) : 15:30, sans rattrapage à l'ouverture de session.
  $partage = "$(@($task.Actions)[0].Arguments)" -like '*-DepotEtat*'
  if (-not $Heure) { $Heure = if ($partage) { '15:30' } else { '06:00' } }
  Ligne 'Journal' $(if ($partage) { 'partagé avec GitHub Actions (-DepotEtat)' } else { 'propre à cet ordinateur' })
  $quotidien = @($task.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskDailyTrigger' })
  $session = @($task.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' })
  if ($quotidien.Count -eq 0) {
    Ligne 'Déclencheur quotidien' 'absent' $false
  } else {
    $debut = [datetime]$quotidien[0].StartBoundary
    Ligne 'Déclencheur quotidien' ("chaque jour à {0:HH:mm} (heure locale)" -f $debut) (('{0:HH:mm}' -f $debut) -eq $Heure)
  }
  Ligne "Déclencheur à l'ouverture de session" ($(if ($session.Count) { "présent (délai $($session[0].Delay))" } else { "absent$(if ($partage) { ' (voulu en mode partagé)' })" })) (($session.Count -gt 0) -ne $partage)

  # 2. Fuseau horaire et prochaine exécution --------------------------------------------------
  $tz = (Get-TimeZone).Id
  Ligne "Fuseau de l'ordinateur" $tz ($tz -eq $zurichId)
  if ($info.NextRunTime) {
    $prochaine = [datetime]$info.NextRunTime
    try {
      $local = [System.TimeZoneInfo]::FindSystemTimeZoneById($tz)
      $zurich = [System.TimeZoneInfo]::ConvertTime([datetime]::SpecifyKind($prochaine, 'Unspecified'), $local, [System.TimeZoneInfo]::FindSystemTimeZoneById($zurichId))
      $texteZurich = '{0:dd.MM.yyyy HH:mm} à Zurich' -f $zurich
    } catch {
      $zurich = $prochaine
      $texteZurich = '(conversion vers Zurich indisponible)'
    }
    Ligne 'Prochaine exécution' ('{0:dd.MM.yyyy HH:mm} (heure locale) = {1}' -f $prochaine, $texteZurich) (('{0:HH:mm}' -f $zurich) -eq $Heure)
  } else {
    Ligne 'Prochaine exécution' 'aucune (tâche désactivée ?)' $false
  }

  # 3. Dernière exécution ---------------------------------------------------------------------
  $jamais = ($info.LastTaskResult -eq 267011) -or (-not $info.LastRunTime) -or ([datetime]$info.LastRunTime).Year -lt 2000
  if ($jamais) {
    Ligne 'Dernière exécution' 'jamais : lancer un essai (Start-ScheduledTask)' $false
  } else {
    Ligne 'Dernière exécution' ('{0:dd.MM.yyyy HH:mm}' -f [datetime]$info.LastRunTime)
    Ligne 'Résultat de la dernière exécution' (ResultatTache ([int64]$info.LastTaskResult)) ($info.LastTaskResult -in @(0, 267009))
  }
  Ligne 'Exécutions manquées (compteur Windows)' "$($info.NumberOfMissedRuns)"

  # 4. Réglages de rattrapage -----------------------------------------------------------------
  $s = $task.Settings
  Ligne 'Rattrapage après démarrage manqué' ($(if ($s.StartWhenAvailable) { 'activé' } else { 'désactivé' })) ([bool]$s.StartWhenAvailable)
  Ligne 'Uniquement avec réseau' ($(if ($s.RunOnlyIfNetworkAvailable) { 'oui' } else { 'non' }))
  Ligne 'Réveil de la veille' ($(if ($s.WakeToRun) { 'oui' } else { 'non (installer avec -Reveil pour réveiller le PC)' }))
  Ligne 'Nouvel essai après échec' ("$($s.RestartCount) fois, toutes les $($s.RestartInterval)")
}

# 5. Collectes réellement effectuées (journal de la chaîne) ----------------------------------
Write-Host ''
$runs = [System.IO.Path]::Combine($repo, 'data', 'private', 'runs')
$latest = [System.IO.Path]::Combine($runs, 'latest.json')
if (-not (Test-Path $latest)) {
  Ligne 'Journal des collectes' "absent ($latest) : aucune collecte terminée" $false
} else {
  $r = Get-Content $latest -Raw -Encoding UTF8 | ConvertFrom-Json
  $debut = [datetime]::Parse($r.startedAt).ToLocalTime()
  $fin = [datetime]::Parse($r.finishedAt).ToLocalTime()
  $age = (Get-Date) - $fin
  Ligne 'Dernière collecte terminée' ('{0:dd.MM.yyyy HH:mm} (journée du {1}, {2} requêtes)' -f $fin, $r.date, $r.requests) ($age.TotalHours -lt 30)
  $etats = ($r.sources | ForEach-Object { "$($_.connector)=$($_.status)" }) -join ', '
  Ligne 'Sources' $etats ([bool]$r.ok)
  if ($r.validation) {
    Ligne 'Contrôle de non-régression' ("$($r.validation.passed)/$($r.validation.checked)") ($r.validation.passed -eq $r.validation.checked)
  }
  Write-Host ''
  Write-Host "Collectes des $Jours derniers jours (heure réelle de lancement) :"
  $prevue = [datetime]::ParseExact($Heure, 'HH:mm', $null).TimeOfDay
  $fichiers = Get-ChildItem -Path $runs -Filter '????-??-??.json' | Sort-Object Name -Descending | Select-Object -First $Jours
  foreach ($f in $fichiers) {
    $j = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    $lance = [datetime]::Parse($j.startedAt).ToLocalTime()
    $type = if (($lance.TimeOfDay - $prevue).TotalMinutes -gt 15) { 'rattrapage ou relance' } else { "à l'heure" }
    Write-Host ('   {0}  lancée à {1:HH:mm}  {2,-22} {3}' -f $j.date, $lance, $type, $(if ($j.ok) { 'données produites' } else { 'ÉCHEC' }))
  }
}

# 6. Journaux --------------------------------------------------------------------------------
Write-Host ''
$logs = [System.IO.Path]::Combine($repo, 'data', 'private', 'logs')
$dernier = Get-ChildItem -Path $logs -Filter 'quotidien-*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($dernier) {
  Ligne 'Journaux' "$logs (dernier : $($dernier.Name))"
  Get-Content $dernier.FullName -Tail 4 -Encoding UTF8 | ForEach-Object { Write-Host "     $_" }
} else {
  Ligne 'Journaux' "aucun journal dans $logs" $false
}

# 7. Historique du Planificateur (si activé) -------------------------------------------------
try {
  $ev = Get-WinEvent -LogName 'Microsoft-Windows-TaskScheduler/Operational' -MaxEvents 400 -ErrorAction Stop |
    Where-Object { $_.Message -like "*$nom*" -and $_.Id -in @(100, 102, 107, 119, 201) } | Select-Object -First 6
  if ($ev) {
    Write-Host ''
    Write-Host 'Historique du Planificateur (107 = heure prévue, 119 = ouverture de session, 102/201 = terminé) :'
    $ev | ForEach-Object { Write-Host ('   {0:dd.MM HH:mm}  événement {1}' -f $_.TimeCreated, $_.Id) }
  }
} catch {
  Write-Host ''
  Write-Host "Historique du Planificateur désactivé (facultatif) : l'heure réelle des collectes ci-dessus suffit."
}

Write-Host ''
if ($problemes.Count -eq 0) {
  Write-Host 'Verdict : collecte quotidienne installée et fonctionnelle.'
  exit 0
}
Write-Host "Verdict : $($problemes.Count) point(s) à corriger :"
$problemes | ForEach-Object { Write-Host "  - $_" }
exit 1
