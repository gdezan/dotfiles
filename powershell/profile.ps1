# Shared PowerShell profile. Optional tools are initialized only when installed.
$env:STARSHIP_CONFIG = Join-Path (Split-Path $PSScriptRoot -Parent) 'starship.toml'
if (Get-Command starship -CommandType Application -ErrorAction SilentlyContinue) {
    Invoke-Expression (& starship init powershell)
}

# gdezan-material terminal palette, without directory background blocks.
$PSStyle.FileInfo.Directory = $PSStyle.Foreground.FromRgb(0x82aaff)
$PSStyle.FileInfo.SymbolicLink = $PSStyle.Foreground.FromRgb(0x89ddff)
$PSStyle.FileInfo.Executable = $PSStyle.Foreground.FromRgb(0xc3e88d)
$PSStyle.Formatting.TableHeader = $PSStyle.Foreground.FromRgb(0x80cbc4)

Import-Module PSReadLine -ErrorAction SilentlyContinue
if (Get-Module PSReadLine) {
    if ($Host.UI.SupportsVirtualTerminal -and -not [Console]::IsOutputRedirected) {
        Set-PSReadLineOption -PredictionSource History
        Set-PSReadLineOption -PredictionViewStyle InlineView
    }
    Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete
}

# Use eza for listings; Get-ChildItem remains available for object pipelines.
if (Get-Command eza -CommandType Application -ErrorAction SilentlyContinue) {
    Remove-Item Alias:ls -ErrorAction SilentlyContinue
    function ls { eza --group-directories-first --icons=auto @args }
    function ll { eza -l --group-directories-first --icons=auto @args }
}

if (Get-Command zoxide -CommandType Application -ErrorAction SilentlyContinue) {
    Invoke-Expression (& { zoxide init powershell | Out-String })
}
if (Get-Command carapace -CommandType Application -ErrorAction SilentlyContinue) {
    Invoke-Expression (& { carapace _carapace powershell | Out-String })
}
if ((Get-Command fzf -CommandType Application -ErrorAction SilentlyContinue) -and
    (Get-Module -ListAvailable PSFzf)) {
    Import-Module PSFzf
    Set-PsFzfOption -PSReadlineChordProvider 'Ctrl+t' -PSReadlineChordReverseHistory 'Ctrl+r'
}
if (Get-Module -ListAvailable Terminal-Icons) {
    Import-Module Terminal-Icons
}
