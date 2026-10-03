<#
.SYNOPSIS
  Installe (ou retire) la tâche planifiée « TesPrix - collecte quotidienne ».

.DESCRIPTION
  Crée une tâche du Planificateur de tâches Windows pour l'utilisateur courant :
    - chaque jour à 06:00 (heure locale de l'ordinateur : Europe/Zurich attendu) ;
    - à l'ouverture de session, pour rattraper une exécution manquée ;
    - « Exécuter dès que possible si une exécution planifiée a été manquée » (ordinateur éteint à 06:00) ;
    - uniquement si une connexion réseau est disponible ;
    - nouvel essai toutes les 30 minutes (3 fois au plus) après un échec ;
    - durée maximale 2 heures ; jamais deux exécutions en même temps.
  La collecte elle-même ne s'exécute qu'une fois par jour : les déclencheurs supplémentaires ne
  provoquent pas de double collecte.
  Avec -DepotEtat (clone du dépôt privé tesprix-collecte), la tâche partage le journal de GitHub
  Actions : une seule collecte par jour pour les deux systèmes. Heure par défaut alors 07:30, après
  le créneau GitHub de 06:17 : la tâche ne collecte que si GitHub ne l'a pas fait.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\installer-tache.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\installer-tache.ps1 -Reveil
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\installer-tache.ps1 -Desinstaller
#>
[CmdletBinding()]
param(
  # Heure de la collecte quotidienne (heure locale).
  [string]$Heure = '06:00',
  # Réveille l'ordinateur en veille pour la collecte (sans effet s'il est éteint).
  [switch]$Reveil,
  # Exécute aussi quand aucune session n'est ouverte (mot de passe Windows demandé une fois).
  [switch]$SansSession,
  # Retire la tâche.
  [switch]$Desinstaller,
  # Clone local du dépôt privé tesprix-collecte (journal partagé avec GitHub Actions).
  [string]$DepotEtat = ''
)

$ErrorActionPreference = 'Stop'
$nom = 'TesPrix - collecte quotidienne'

if ($Desinstaller) {
  if (Get-ScheduledTask -TaskName $nom -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $nom -Confirm:$false
    Write-Host "Tâche « $nom » retirée."
  } else {
    Write-Host "Aucune tâche « $nom » à retirer."
  }
  exit 0
}

$script = [System.IO.Path]::Combine($PSScriptRoot, 'tesprix-quotidien.ps1')
if (-not (Test-Path $script)) { throw "Script introuvable : $script" }
$partage = ''
if ($DepotEtat) {
  $DepotEtat = [System.IO.Path]::GetFullPath($DepotEtat)
  if (-not (Test-Path ([System.IO.Path]::Combine($DepotEtat, '.git')))) { throw "Pas un clone Git : $DepotEtat (git clone https://github.com/probe2ka3/tesprix-collecte.git)" }
  $partage = " -DepotEtat `"$DepotEtat`""
  # Après le créneau GitHub de 06:17 (heure de Zurich), sauf heure choisie explicitement.
  if (-not $PSBoundParameters.ContainsKey('Heure')) { $Heure = '07:30' }
}

$tz = (Get-TimeZone).Id
if ($tz -ne 'W. Europe Standard Time') {
  Write-Warning "Fuseau de l'ordinateur : $tz. La tâche suit l'heure locale ; 06:00 à Zurich correspond à une autre heure ici."
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`" -HeurePrevue $Heure -Planifie$partage" `
  -WorkingDirectory ([System.IO.Path]::GetFullPath([System.IO.Path]::Combine($PSScriptRoot, '..', '..')))

$triggers = @(
  (New-ScheduledTaskTrigger -Daily -At $Heure),
  (New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME")
)
# Rattrapage à l'ouverture de session : léger délai pour laisser le réseau s'établir.
$triggers[1].Delay = 'PT5M'

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 30) `
  -MultipleInstances IgnoreNew `
  -WakeToRun:$Reveil

if ($SansSession) {
  $cred = Get-Credential -UserName "$env:USERDOMAIN\$env:USERNAME" -Message 'Mot de passe Windows (exécution sans session ouverte)'
  Register-ScheduledTask -TaskName $nom -Action $action -Trigger $triggers -Settings $settings `
    -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited `
    -Description 'Collecte quotidienne des prix des 50 aliments de base (TesPrix). Journal : data\private\logs.' -Force | Out-Null
} else {
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $nom -Action $action -Trigger $triggers -Settings $settings -Principal $principal `
    -Description 'Collecte quotidienne des prix des 50 aliments de base (TesPrix). Journal : data\private\logs.' -Force | Out-Null
}

$info = Get-ScheduledTaskInfo -TaskName $nom
Write-Host "Tâche « $nom » installée$(if ($DepotEtat) { " (journal partagé : $DepotEtat)" })."

Write-Host "Prochaine exécution : $($info.NextRunTime)"
Write-Host 'Lancer un essai maintenant : Start-ScheduledTask -TaskName "TesPrix - collecte quotidienne"'
Write-Host 'Résultat : data\private\runs\latest.json ; journal : data\private\logs\'
Write-Host 'Vérification complète : powershell -ExecutionPolicy Bypass -File .\scripts\windows\verifier-tache.ps1'
