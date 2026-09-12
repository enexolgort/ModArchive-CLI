# Plays one audio file through Windows' native audio stack (Media Foundation via
# WPF's MediaPlayer), invoked from WSL via interop. This exists because WSLg's
# PulseAudio bridge to Windows can't sustain real-time throughput over long
# streams (confirmed: ffmpeg -f pulse decays from 1.0x to 0.5x speed within ~30s
# on this setup and eventually drops the connection). Running the player as a
# native Windows process sidesteps that bridge entirely.
#
# No live control channel: stdin over the WSL->Windows interop bridge only
# reliably delivers the first line written to a long-running process (verified
# empirically — every write after the first is silently lost), so pause/resume
# aren't driven by commands here. The caller instead kills this process to
# pause/stop and re-launches it with -StartSeconds to resume, exactly like the
# process-exit-driven contract the ffmpeg backend already uses.
#
# Exits 0 and prints ENDED when the track finishes naturally, or ERROR:
# <message> and exit 1 if the file can't be opened. A kill from outside (pause
# or stop) ends the process without either line — the caller distinguishes
# that itself, since it's the one doing the killing.
#
# Event-callback script blocks (Add_Tick, add_MediaOpened, etc.) run outside
# the normal PowerShell pipeline over this interop path, so Write-Output from
# inside them is silently dropped. Everything here runs in the plain top-level
# script flow instead, with the WPF dispatcher pumped manually each loop tick.

param(
    [Parameter(Mandatory = $true)][string]$Path,
    [double]$StartSeconds = 0
)

Add-Type -AssemblyName PresentationCore, WindowsBase, PresentationFramework

$player = New-Object System.Windows.Media.MediaPlayer
$dispatcher = [System.Windows.Threading.Dispatcher]::CurrentDispatcher

function Pump {
    $dispatcher.Invoke([action] {}, [System.Windows.Threading.DispatcherPriority]::Background) | Out-Null
}

$player.Open([Uri]::new($Path))

$waitedMs = 0
while (-not $player.NaturalDuration.HasTimeSpan -and $waitedMs -lt 10000) {
    Start-Sleep -Milliseconds 50
    Pump
    $waitedMs += 50
}

if (-not $player.NaturalDuration.HasTimeSpan) {
    Write-Output "ERROR: could not open media (timed out waiting for duration)"
    exit 1
}

$duration = $player.NaturalDuration.TimeSpan
if ($StartSeconds -gt 0) {
    $player.Position = [TimeSpan]::FromSeconds($StartSeconds)
}
$player.Play()

while ($player.Position -lt $duration) {
    Start-Sleep -Milliseconds 100
    Pump
}

$player.Stop()
Write-Output "ENDED"
exit 0
