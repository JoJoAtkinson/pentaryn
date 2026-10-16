# Registers (or removes) the Windows scheduled task that runs the 03:00 nightly VTT backup
# inside WSL: automation/bin/vtt-nightly.sh. Idempotent - re-running replaces the task.
#
#   powershell -ExecutionPolicy Bypass -File register-vtt-nightly.ps1               # register
#   powershell -ExecutionPolicy Bypass -File register-vtt-nightly.ps1 -Unregister   # remove
#   ... -Distro Ubuntu-26.04 -LinuxUser joe -At 03:00                                # overrides
#
# From WSL: make vtt-nightly-register (it passes the distro name for you).
#
# Runs as the Windows user via S4U: "whether logged on or not", no stored password. The
# 03:00 run must happen with nobody signed in; an Interactive task silently never fired
# (2026-10-16). S4U drives WSL fine on BOSS - the \WSL keep-alive task and the boot-time
# Claude task both run that way. S4U has no network credentials for Windows shares; the
# script only uses Linux-side network (rclone, cloudflared), so that does not matter.
# WakeToRun wakes a sleeping PC; StartWhenAvailable runs a missed 03:00 at the next chance.
# The time is local wall-clock, so it follows DST.
# ExecutionTimeLimit must exceed the script's own step timeouts summed (stop+backup 2400s,
# start 600s, relaunch 360s, password check 90s, recovery 600s, ~4.1ks with kill-afters):
# a task killed by the scheduler takes wsl.exe with it, and the script's EXIT trap - the
# thing that brings Foundry back - may never run. 2h leaves the script's timeouts in charge.
[CmdletBinding()]
param(
    [string]$Distro = "Ubuntu-26.04",
    [string]$LinuxUser = "joe",
    [string]$Script = "/home/joe/code/pentaryn/automation/bin/vtt-nightly.sh",
    [string]$At = "03:00",
    [switch]$Unregister
)
$ErrorActionPreference = "Stop"
$TaskName = "Pentaryn VTT Nightly"

if ($Unregister) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "removed: $TaskName"
    } else { Write-Host "not registered: $TaskName" }
    return
}

$known = (& "$env:WINDIR\System32\wsl.exe" -l -q) -replace "`0", "" | Where-Object { $_.Trim() }
if ($known -notcontains $Distro) { throw "WSL distro '$Distro' not found (have: $($known -join ', '))" }

$action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wsl.exe" `
    -Argument "-d $Distro -u $LinuxUser --exec /bin/bash $Script"
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
# Not "$env:USERDOMAIN\$env:USERNAME": started from WSL, USERDOMAIN reads WORKGROUP, a
# name that maps to no SID. The token's own name is always the real MACHINE\user.
$account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $account `
    -LogonType S4U -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force `
    -Description "Stops Foundry + tunnel, uploads the world snapshot to OneDrive, starts them again. Log: ~/code/pentaryn/.state/logs/vtt-nightly-YYYY-MM.log (WSL)." | Out-Null

$t = Get-ScheduledTask -TaskName $TaskName
Write-Host "registered: $TaskName - daily $At, next run $((Get-ScheduledTaskInfo -TaskName $TaskName).NextRunTime)"
Write-Host "runs: wsl.exe $($t.Actions[0].Arguments)"
