$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
. (Join-Path $repo 'powershell/profile.ps1')

if ($env:STARSHIP_CONFIG -ne (Join-Path $repo 'starship.toml')) {
    throw 'Starship configuration does not point to the repository.'
}
if ($PSStyle.FileInfo.Directory -ne $PSStyle.Foreground.FromRgb(0x82aaff)) {
    throw 'Directory color does not match gdezan-material.'
}
if (Get-Command eza -CommandType Application -ErrorAction SilentlyContinue) {
    if ((Get-Command ls).CommandType -ne 'Function' -or
        (Get-Command ll).CommandType -ne 'Function') {
        throw 'eza listing functions are missing.'
    }
}
if ((Get-Command fzf -CommandType Application -ErrorAction SilentlyContinue) -and
    (Get-Module -ListAvailable PSFzf) -and -not (Get-Module PSFzf)) {
    throw 'PSFzf was not loaded.'
}
Write-Output 'PowerShell profile test passed.'
