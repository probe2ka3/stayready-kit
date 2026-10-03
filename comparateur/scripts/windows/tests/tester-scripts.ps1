<#
.SYNOPSIS
  Tests des scripts Windows de TesPrix avec un Planificateur de tâches simulé.

.DESCRIPTION
  Exécutable sous Windows comme sous Linux (PowerShell 7, intégration continue). Les cmdlets du
  Planificateur (Register-ScheduledTask, Get-ScheduledTaskInfo…), Get-TimeZone, Resolve-DnsName et
  Get-WinEvent sont remplacées par des fonctions qui enregistrent les appels : rien n'est installé
  et aucune collecte réelle n'est lancée. Ce test ne remplace pas la vérification sur l'ordinateur
  (verifier-tache.ps1), qui seule prouve qu'une tâche est installée et s'exécute.

.EXAMPLE
  pwsh -File scripts/windows/tests/tester-scripts.ps1
#>
$ErrorActionPreference = 'Stop'
$scripts = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($PSScriptRoot, '..'))
$echecs = New-Object System.Collections.Generic.List[string]
function Verifie([string]$nom, [bool]$condition) {
  if ($condition) { Write-Host "  ok    $nom" } else { Write-Host "  ÉCHEC $nom"; $echecs.Add($nom) }
}

# Copie des scripts dans un dépôt temporaire (data\private y est créé par les scripts).
$racine = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "tesprix-ps-$([guid]::NewGuid().ToString('N'))")
$copie = [System.IO.Path]::Combine($racine, 'scripts', 'windows')
New-Item -ItemType Directory -Force -Path $copie | Out-Null
Copy-Item -Path ([System.IO.Path]::Combine($scripts, '*.ps1')) -Destination $copie
$runs = [System.IO.Path]::Combine($racine, 'data', 'private', 'runs')
$logs = [System.IO.Path]::Combine($racine, 'data', 'private', 'logs')

# --- Planificateur simulé ----------------------------------------------------------------------
$global:Appels = @{}
$global:TacheSimulee = $null
$global:InfoSimulee = $null
$global:FuseauSimule = 'W. Europe Standard Time'
function global:New-ScheduledTaskAction { param($Execute, $Argument, $WorkingDirectory) [pscustomobject]@{ Execute = $Execute; Arguments = $Argument; WorkingDirectory = $WorkingDirectory } }
function global:New-ScheduledTaskTrigger {
  param([switch]$Daily, $At, [switch]$AtLogOn, $User)
  if ($Daily) { return [pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskDailyTrigger' }; StartBoundary = ('{0:yyyy-MM-dd}T{1}:00' -f (Get-Date), $At); Delay = $null } }
  [pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskLogonTrigger' }; UserId = $User; Delay = $null }
}
function global:New-ScheduledTaskSettingsSet {
  param([switch]$StartWhenAvailable, [switch]$RunOnlyIfNetworkAvailable, [switch]$AllowStartIfOnBatteries, [switch]$DontStopIfGoingOnBatteries, $ExecutionTimeLimit, $RestartCount, $RestartInterval, $MultipleInstances, [switch]$WakeToRun)
  [pscustomobject]@{ StartWhenAvailable = [bool]$StartWhenAvailable; RunOnlyIfNetworkAvailable = [bool]$RunOnlyIfNetworkAvailable; WakeToRun = [bool]$WakeToRun; ExecutionTimeLimit = $ExecutionTimeLimit; RestartCount = $RestartCount; RestartInterval = $RestartInterval; MultipleInstances = $MultipleInstances }
}
function global:New-ScheduledTaskPrincipal { param($UserId, $LogonType, $RunLevel) [pscustomobject]@{ UserId = $UserId; LogonType = $LogonType; RunLevel = $RunLevel } }
function global:Register-ScheduledTask {
  param($TaskName, $Action, $Trigger, $Settings, $Principal, $User, $Password, $RunLevel, $Description, [switch]$Force)
  $global:Appels['Register'] = $PSBoundParameters
  $global:TacheSimulee = [pscustomobject]@{ TaskName = $TaskName; State = 'Ready'; Triggers = $Trigger; Settings = $Settings; Actions = $Action }
  $global:InfoSimulee = [pscustomobject]@{ NextRunTime = (Get-Date).Date.AddDays(1).AddHours(6); LastRunTime = [datetime]'1999-11-30'; LastTaskResult = 267011; NumberOfMissedRuns = 0 }
}
function global:Unregister-ScheduledTask { param($TaskName, $Confirm) $global:Appels['Unregister'] = $TaskName; $global:TacheSimulee = $null }
function global:Get-ScheduledTask { param($TaskName, $ErrorAction) $global:TacheSimulee }
function global:Get-ScheduledTaskInfo { param($TaskName) $global:InfoSimulee }
function global:Get-TimeZone { [pscustomobject]@{ Id = $global:FuseauSimule } }
function global:Get-WinEvent { throw 'journal désactivé' }

try {
  $env:USERDOMAIN = 'PC'
  $env:USERNAME = 'utilisateur'

  Write-Host 'Installation de la tâche'
  & ([System.IO.Path]::Combine($copie, 'installer-tache.ps1')) | Out-Null
  $r = $global:Appels['Register']
  Verifie 'tâche « TesPrix - collecte quotidienne »' ($r.TaskName -eq 'TesPrix - collecte quotidienne')
  Verifie 'déclencheur quotidien à 06:00' ($r.Trigger[0].StartBoundary -like '*T06:00:00')
  Verifie "déclencheur à l'ouverture de session, délai 5 min" ($r.Trigger[1].CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' -and $r.Trigger[1].Delay -eq 'PT5M')
  Verifie 'rattrapage après démarrage manqué' ($r.Settings.StartWhenAvailable)
  Verifie 'réseau requis, une seule instance' ($r.Settings.RunOnlyIfNetworkAvailable -and "$($r.Settings.MultipleInstances)" -eq 'IgnoreNew')
  Verifie '3 nouveaux essais, 30 min' ($r.Settings.RestartCount -eq 3 -and $r.Settings.RestartInterval.TotalMinutes -eq 30)
  Verifie 'script lancé avec -HeurePrevue 06:00 -Planifie' ($r.Action.Arguments -like '*tesprix-quotidien.ps1*-HeurePrevue 06:00 -Planifie*')
  Verifie 'sans journal partagé par défaut' ($r.Action.Arguments -notlike '*-DepotEtat*')
  Verifie 'session interactive, droits limités' ($r.Principal.LogonType -eq 'Interactive' -and $r.Principal.RunLevel -eq 'Limited')

  Write-Host 'Vérification juste après installation (jamais exécutée)'
  & ([System.IO.Path]::Combine($copie, 'verifier-tache.ps1')) *> $null
  Verifie 'verdict « à corriger » (aucune exécution, aucun journal)' ($LASTEXITCODE -eq 1)

  Write-Host 'Vérification après une collecte réussie et un rattrapage'
  New-Item -ItemType Directory -Force -Path $runs, $logs | Out-Null
  $aujourdhui = Get-Date
  $hier = $aujourdhui.AddDays(-1)
  $run = @{ date = $aujourdhui.ToString('yyyy-MM-dd'); startedAt = $aujourdhui.Date.AddHours(6).AddMinutes(1).ToUniversalTime().ToString('o'); finishedAt = $aujourdhui.Date.AddHours(6).AddMinutes(12).ToUniversalTime().ToString('o'); requests = 245; ok = $true; validation = @{ checked = 110; passed = 110 }; sources = @(@{ connector = 'lidl-web'; status = 'success' }, @{ connector = 'denner-web'; status = 'success' }) }
  $run | ConvertTo-Json -Depth 5 | Set-Content -Path ([System.IO.Path]::Combine($runs, 'latest.json')) -Encoding UTF8
  $run | ConvertTo-Json -Depth 5 | Set-Content -Path ([System.IO.Path]::Combine($runs, "$($run.date).json")) -Encoding UTF8
  $rattrapage = @{ date = $hier.ToString('yyyy-MM-dd'); startedAt = $hier.Date.AddHours(8).AddMinutes(7).ToUniversalTime().ToString('o'); finishedAt = $hier.Date.AddHours(8).AddMinutes(19).ToUniversalTime().ToString('o'); requests = 240; ok = $true; sources = @() }
  $rattrapage | ConvertTo-Json -Depth 5 | Set-Content -Path ([System.IO.Path]::Combine($runs, "$($rattrapage.date).json")) -Encoding UTF8
  'fin de la collecte : code 0' | Set-Content -Path ([System.IO.Path]::Combine($logs, "quotidien-$($run.date).log")) -Encoding UTF8
  $global:InfoSimulee = [pscustomobject]@{ NextRunTime = $aujourdhui.Date.AddDays(1).AddHours(6); LastRunTime = $aujourdhui.Date.AddHours(6); LastTaskResult = 0; NumberOfMissedRuns = 1 }
  $sortie = & ([System.IO.Path]::Combine($copie, 'verifier-tache.ps1')) 6>&1 | Out-String
  Verifie 'verdict conforme' ($LASTEXITCODE -eq 0)
  Verifie 'prochaine exécution à 06:00 (Zurich)' ($sortie -match 'Prochaine exécution\s+\S+ 06:00')
  Verifie 'dernière exécution et résultat « succès (0) »' ($sortie -match 'succès \(0\)')
  Verifie 'rattrapage de la veille signalé' ($sortie -match 'lancée à 08:07\s+rattrapage')
  Verifie 'emplacement des journaux affiché' ($sortie -match 'Journaux')

  Write-Host 'Vérification : fuseau horaire différent et dernier résultat en échec'
  $global:FuseauSimule = 'GMT Standard Time'
  $global:InfoSimulee.LastTaskResult = 2
  $sortie = & ([System.IO.Path]::Combine($copie, 'verifier-tache.ps1')) 6>&1 | Out-String
  Verifie 'verdict « à corriger »' ($LASTEXITCODE -eq 1)
  Verifie 'fuseau signalé' ($sortie -match "Fuseau de l'ordinateur\s+GMT")
  Verifie 'cause « pas de connexion Internet »' ($sortie -match 'pas de connexion Internet')
  $global:FuseauSimule = 'W. Europe Standard Time'

  Write-Host 'Script quotidien : pas de connexion Internet'
  function global:Resolve-DnsName { param($Name, $ErrorAction) throw 'hors ligne' }
  & ([System.IO.Path]::Combine($copie, 'tesprix-quotidien.ps1')) *> $null
  Verifie 'code de sortie 2, rien tenté' ($LASTEXITCODE -eq 2)
  $journal = Get-Content ([System.IO.Path]::Combine($logs, "quotidien-$($aujourdhui.ToString('yyyy-MM-dd')).log")) -Raw
  Verifie 'journal « Pas de connexion Internet »' ($journal -match 'Pas de connexion Internet')

  Write-Host 'Script quotidien : collecte simulée, lancement tardif'
  function global:Resolve-DnsName { param($Name, $ErrorAction) [pscustomobject]@{ Name = $Name } }
  $faux = [System.IO.Path]::Combine($racine, 'faux-pnpm.ps1')
  'param([Parameter(ValueFromRemainingArguments = $true)]$a) Write-Output "pnpm $($a -join '' '')"; exit 0' | Set-Content -Path $faux -Encoding UTF8
  function global:Get-Command { param($Name, $ErrorAction) if ($Name -eq 'pnpm') { [pscustomobject]@{ Source = $faux } } }
  & ([System.IO.Path]::Combine($copie, 'tesprix-quotidien.ps1')) -HeurePrevue '00:00' *> $null
  $code = $LASTEXITCODE
  Remove-Item function:global:Get-Command
  $journal = Get-Content ([System.IO.Path]::Combine($logs, "quotidien-$($aujourdhui.ToString('yyyy-MM-dd')).log")) -Raw
  Verifie 'code de sortie de la collecte transmis (0)' ($code -eq 0)
  Verifie 'commande « job quotidien » lancée' ($journal -match 'pnpm -s -C apps.worker job quotidien')
  Verifie 'rattrapage noté dans le journal' ($journal -match 'rattrapage')
  Verifie 'fin de collecte journalisée' ($journal -match 'Fin de la collecte : code 0')

  Write-Host 'Journal partagé avec GitHub Actions (dépôt privé simulé par un dépôt Git local)'
  $gitCmd = Microsoft.PowerShell.Core\Get-Command git -ErrorAction SilentlyContinue
  $nodeCmd = Microsoft.PowerShell.Core\Get-Command node -ErrorAction SilentlyContinue
  if ($gitCmd -and $nodeCmd) {
    $outils = [System.IO.Path]::Combine($racine, 'ops', 'actions-prive')
    New-Item -ItemType Directory -Force -Path $outils | Out-Null
    Copy-Item -Path ([System.IO.Path]::Combine($scripts, '..', '..', 'ops', 'actions-prive', 'etat.mjs')) -Destination $outils
    $etatJs = [System.IO.Path]::Combine($outils, 'etat.mjs')
    $nu = [System.IO.Path]::Combine($racine, 'depot.git')
    $clone = [System.IO.Path]::Combine($racine, 'tesprix-collecte')
    $autre = [System.IO.Path]::Combine($racine, 'autre')
    $id = @('-c', 'user.name=test', '-c', 'user.email=test@example.org')
    & git init -q --bare -b main $nu
    & git clone -q $nu $clone 2>$null
    'dépôt privé simulé' | Set-Content -Path ([System.IO.Path]::Combine($clone, 'README.md'))
    & git -C $clone add README.md; & git -C $clone @id commit -q -m init; & git -C $clone push -q origin main 2>$null
    $appelsPnpm = [System.IO.Path]::Combine($racine, 'appels-pnpm.txt')
    $fauxPartage = [System.IO.Path]::Combine($racine, 'faux-pnpm-partage.ps1')
    @'
param([Parameter(ValueFromRemainingArguments = $true)]$a)
$runs = [System.IO.Path]::Combine((Get-Location).Path, 'data', 'private', 'runs')
New-Item -ItemType Directory -Force -Path $runs | Out-Null
$z = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Europe/Zurich')
$statut = if ($env:FAUX_STATUT) { $env:FAUX_STATUT } else { 'success' }
$maintenant = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
@{ date = $z.ToString('yyyy-MM-dd'); startedAt = $maintenant; finishedAt = $maintenant; sources = @(@{ connector = 'open-prices'; status = $statut; prices = 1; promotions = 0; message = $null }) } |
  ConvertTo-Json -Depth 4 | Set-Content -Path ([System.IO.Path]::Combine($runs, 'latest.json')) -Encoding utf8
Add-Content -Path ([System.IO.Path]::Combine((Get-Location).Path, 'appels-pnpm.txt')) -Value ($a -join ' ')
exit 0
'@ | Set-Content -Path $fauxPartage -Encoding utf8
    function global:Get-Command { param($Name, $ErrorAction) if ($Name -eq 'pnpm') { [pscustomobject]@{ Source = $fauxPartage } } else { Microsoft.PowerShell.Core\Get-Command $Name -ErrorAction SilentlyContinue } }
    $quotidien = [System.IO.Path]::Combine($copie, 'tesprix-quotidien.ps1')
    $sujets = { & git -C $nu log --format=%s main }
    $fichiers = { & git -C $nu ls-tree -r --name-only main }
    $executions = { @(& $fichiers | Where-Object { $_ -like 'etat/suivi/executions/*' }) }

    & $quotidien -DepotEtat $clone -Planifie *> $null
    $code = $LASTEXITCODE
    Verifie 'première exécution : collecte faite, code 0' ($code -eq 0 -and (Test-Path $appelsPnpm))
    Verifie 'verrou pris puis libéré dans le dépôt partagé' ((& $sujets) -contains 'Verrou de collecte (Windows)' -and (& $fichiers) -notcontains 'etat/verrou.json')
    Verifie 'état et suivi enregistrés (journal des exécutions, SUIVI.md)' ((& $fichiers) -contains 'etat/private/runs/latest.json' -and (& $fichiers) -contains 'etat/suivi/SUIVI.md' -and (& $executions).Count -eq 1)

    Remove-Item $appelsPnpm
    & $quotidien -DepotEtat $clone -Planifie *> $null
    Verifie 'même jour : rien à faire, aucune collecte, code 0' ($LASTEXITCODE -eq 0 -and -not (Test-Path $appelsPnpm) -and (& $executions).Count -eq 2)

    & git clone -q $nu $autre 2>$null
    & node $etatJs verrou ([System.IO.Path]::Combine($autre, 'etat')) --systeme github
    & git -C $autre add etat/verrou.json; & git -C $autre @id commit -q -m 'Verrou (GitHub)'; & git -C $autre push -q 2>$null
    & $quotidien -DepotEtat $clone -Planifie -Force *> $null
    Verifie 'collecte en cours sur GitHub : rien, même avec -Force' ($LASTEXITCODE -eq 0 -and -not (Test-Path $appelsPnpm))
    $derniere = (& $executions | Sort-Object | Select-Object -Last 1)
    Verifie 'concurrence notée dans le suivi' (((& git -C $nu show "main:$derniere") | Out-String) -match '"issue": "concurrence"')

    & git -C $autre pull -q 2>$null; & node $etatJs liberer ([System.IO.Path]::Combine($autre, 'etat'))
    & git -C $autre add -A etat; & git -C $autre @id commit -q -m 'Verrou libéré'; & git -C $autre push -q 2>$null
    $env:FAUX_STATUT = 'failed'
    & $quotidien -DepotEtat $clone -Planifie -Force *> $null
    $code = $LASTEXITCODE
    Remove-Item env:FAUX_STATUT
    Verifie 'source en échec : code 1 (nouvel essai du Planificateur), échec noté' ($code -eq 1 -and (& git -C $nu show 'main:etat/suivi/SUIVI.md' | Out-String) -match 'ÉCHEC')
    Remove-Item function:global:Get-Command

    Write-Host 'Installation avec journal partagé'
    & ([System.IO.Path]::Combine($copie, 'installer-tache.ps1')) -DepotEtat $clone | Out-Null
    $r = $global:Appels['Register']
    Verifie 'déclencheur à 07:30 (après le créneau GitHub de 06:17)' ($r.Trigger[0].StartBoundary -like '*T07:30:00')
    Verifie 'script lancé avec -DepotEtat' ($r.Action.Arguments -like "*-Planifie -DepotEtat*tesprix-collecte*")
  } else {
    Write-Host '  (git ou node absent : contrôles du journal partagé non exécutés)'
  }

  Write-Host 'Désinstallation'
  & ([System.IO.Path]::Combine($copie, 'installer-tache.ps1')) -Desinstaller | Out-Null
  Verifie 'tâche retirée' ($global:Appels['Unregister'] -eq 'TesPrix - collecte quotidienne')
} finally {
  Remove-Item -Recurse -Force $racine -ErrorAction SilentlyContinue
}

Write-Host ''
if ($echecs.Count) { Write-Host "$($echecs.Count) échec(s)"; exit 1 }
Write-Host 'Tous les contrôles sont passés.'
exit 0
