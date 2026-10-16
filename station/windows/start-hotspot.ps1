<#
  LICET Attendance Station — classroom Wi-Fi for self check-in.

  -Mode Direct  (default) Wi-Fi Direct "legacy" access point. Phones join it like any
                Wi-Fi; it does NOT need or share internet. The laptop keeps its own
                internet (Ethernet or college Wi-Fi) to reach the ERP.
  -Mode Hotspot Windows Mobile Hotspot (Settings → Network → Mobile hotspot). Shares the
                laptop's internet; needs an active internet connection.

  Usage (PowerShell):  .\start-hotspot.ps1 -Ssid "LICET-CSE-I11" -Passphrase "attend2026"
  Keep this window open during the class; closing it switches the Wi-Fi off.
#>
param(
  [string]$Ssid = "LICET-ATTENDANCE",
  [string]$Passphrase = "licet1234",
  [ValidateSet("Direct", "Hotspot")][string]$Mode = "Direct"
)
$ErrorActionPreference = "Stop"
if ($Passphrase.Length -lt 8) { throw "Passphrase must be at least 8 characters" }

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }

if ($Mode -eq "Direct") {
  $null = [Windows.Devices.WiFiDirect.WiFiDirectAdvertisementPublisher, Windows.Devices, ContentType = WindowsRuntime]
  $null = [Windows.Security.Credentials.PasswordCredential, Windows.Security.Credentials, ContentType = WindowsRuntime]
  $pub = New-Object Windows.Devices.WiFiDirect.WiFiDirectAdvertisementPublisher
  $pub.Advertisement.IsAutonomousGroupOwnerEnabled = $true
  $pub.Advertisement.LegacySettings.IsEnabled = $true
  $pub.Advertisement.LegacySettings.Ssid = $Ssid
  $cred = New-Object Windows.Security.Credentials.PasswordCredential
  $cred.Password = $Passphrase
  $pub.Advertisement.LegacySettings.Passphrase = $cred
  $pub.Start()
  Start-Sleep -Seconds 2
  if ($pub.Status -ne 'Started') { throw "Wi-Fi Direct did not start (status: $($pub.Status)). Try -Mode Hotspot, or check that Wi-Fi is on." }
  Write-Host "`n  Wi-Fi '$Ssid' is ON  (password: $Passphrase)" -ForegroundColor Green
  Write-Host "  Students: join this Wi-Fi, then scan the QR on the Attendance Station console.`n"
  Write-Host "  Leave this window open. Press Ctrl+C to stop." -ForegroundColor Yellow
  try { while ($true) { Start-Sleep -Seconds 5; if ($pub.Status -ne 'Started') { Write-Host "  Wi-Fi stopped ($($pub.Status)) — restarting"; $pub.Start() } } }
  finally { $pub.Stop(); Write-Host "  Wi-Fi off." }
}
else {
  $null = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]
  $null = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]
  $profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
  if (-not $profile) { throw "No internet connection to share. Use -Mode Direct instead." }
  $tm = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile)
  $cfg = $tm.GetCurrentAccessPointConfiguration()
  $cfg.Ssid = $Ssid; $cfg.Passphrase = $Passphrase
  $null = Await ($tm.ConfigureAccessPointAsync($cfg)) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult]) 2>$null
  $r = Await ($tm.StartTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
  if ($r.Status -ne 'Success') { throw "Mobile Hotspot did not start: $($r.Status) $($r.AdditionalErrorMessage)" }
  Write-Host "`n  Mobile Hotspot '$Ssid' is ON (password: $Passphrase). Turn it off in Settings when the class ends.`n" -ForegroundColor Green
}
