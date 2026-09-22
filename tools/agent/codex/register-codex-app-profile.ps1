# @ai-dotfiles agent-dev-runtime managed
# Registration only; never launches Codex or loads the user's profile.
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$ProfilePath = $PROFILE.CurrentUserCurrentHost,
    [switch]$Register
)

$ErrorActionPreference = 'Stop'
$block = @'
# >>> ai-dotfiles codexapp >>>
if (-not (Get-Command codexapp -ErrorAction SilentlyContinue)) {
    function global:codexapp { & agent.cmd codex app launch @args }
}
# <<< ai-dotfiles codexapp <<<
'@

function Assert-RegularPath([string]$Path) {
    for ($part = $Path; $part; $part = [IO.Path]::GetDirectoryName($part)) {
        if (Test-Path -LiteralPath $part) {
            $item = Get-Item -LiteralPath $part -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected profile paths are not supported; register manually.' }
            if ($part -eq $Path -and $item.PSIsContainer) { throw 'Profile path is a directory.' }
        }
    }
}

try {
    $target = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfilePath)
    Assert-RegularPath $target
    $exists = [IO.File]::Exists($target)
    $bytes = [byte[]]@()
    if ($exists) { $bytes = [IO.File]::ReadAllBytes($target) }
    $utf8 = [Text.UTF8Encoding]::new($false, $true)
    $text = $utf8.GetString($bytes)
    $normalized = $text.Replace("`r`n", "`n")
    $beginCount = [regex]::Matches($normalized, '(?m)^# >>> ai-dotfiles codexapp >>>$').Count
    $endCount = [regex]::Matches($normalized, '(?m)^# <<< ai-dotfiles codexapp <<<$').Count
    if ($beginCount -or $endCount) {
        if ($beginCount -ne 1 -or $endCount -ne 1 -or -not $normalized.Contains($block)) {
            throw 'The codexapp registration block was modified or is ambiguous; review it manually.'
        }
        Write-Output 'codexapp registration is already present. No profile was changed.'
        Write-Output 'Open a new PowerShell 7 console and run Get-Command codexapp to verify resolution.'
        exit 0
    }
    if ($text -match '(?i)\bcodexapp\b' -or (Get-Command codexapp -ErrorAction SilentlyContinue)) {
        throw 'An existing codexapp command or profile reference was found; no changes were made.'
    }
    $tokens = $null; $errors = $null
    $null = [Management.Automation.Language.Parser]::ParseInput($text, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw 'The existing profile has syntax errors; no changes were made.' }
    $homePath = [Environment]::GetFolderPath('UserProfile').TrimEnd('\', '/')
    $display = if ($target.StartsWith($homePath + '\', [StringComparison]::OrdinalIgnoreCase)) {
        '~/' + $target.Substring($homePath.Length + 1).Replace('\', '/')
    } else { '[custom]/' + [IO.Path]::GetFileName($target) }
    Write-Output "Target: PowerShell 7 console profile ($display)"
    Write-Output $block
    Write-Output 'Indirect profile definitions are checked at load time; existing commands take precedence.'
    if (-not $Register) {
        if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) {
            Write-Output 'Preview only; no profile was changed. Run agent codex app profile in an interactive terminal to register.'
            exit 0
        }
        if ((Read-Host 'Add this block to the profile? [y/N]').Trim() -notin @('y', 'yes')) {
            Write-Output 'Cancelled; no profile was changed.'
            exit 0
        }
    }
    if (-not (Get-Command agent.cmd -CommandType Application -ErrorAction SilentlyContinue)) {
        throw 'agent.cmd is not available on PATH; install the agent command first.'
    }
    if (-not $PSCmdlet.ShouldProcess($display, 'Back up the existing profile and register codexapp')) { exit 0 }
    Assert-RegularPath $target
    if ([IO.File]::Exists($target) -ne $exists -or ($exists -and
        [Convert]::ToBase64String([IO.File]::ReadAllBytes($target)) -ne [Convert]::ToBase64String($bytes))) {
        throw 'Profile changed during review; retry after checking it.'
    }
    $parent = [IO.Path]::GetDirectoryName($target)
    $null = [IO.Directory]::CreateDirectory($parent)
    $suffix = [Guid]::NewGuid().ToString('N')
    $temporary = Join-Path $parent ".codexapp-$suffix.tmp"
    $backup = "$target.codexapp-$suffix.bak"
    try {
        # Preserve existing bytes, including BOM and line endings; new text uses LF.
        $addition = $utf8.GetBytes("`n" + $block + "`n")
        [IO.File]::WriteAllBytes($temporary, [byte[]]($bytes + $addition))
        if ($exists) { [IO.File]::Replace($temporary, $target, $backup) }
        else { [IO.File]::Move($temporary, $target) }
    } finally {
        if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
    }
    Write-Output 'Registered codexapp. Open a new PowerShell 7 console, then run codexapp.'
    Write-Output 'To reload here, run . $PROFILE directly at your prompt.'
    if ($exists) { Write-Output 'The original profile was backed up beside it as *.codexapp-<id>.bak.' }
} catch {
    # Only deliberate validation errors contain public-safe text. PowerShell's
    # formatted errors and wrapped .NET exceptions can expose absolute paths.
    $message = if ($_.Exception.GetType() -eq [Management.Automation.RuntimeException]) {
        $_.Exception.Message
    } else { 'Profile registration failed: check file access and UTF-8 encoding. No automatic retry was attempted.' }
    [Console]::Error.WriteLine("Error: $message")
    exit 1
}
