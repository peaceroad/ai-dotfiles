<#
.SYNOPSIS
Installs the repository-owned agent command for the current user.

.DESCRIPTION
Uses install-agent.mjs to install the launcher, implementation, schema, and
version-matched runtime managers into the selected .agents directory. When the
scripts directory is not already available through a persistent Path, an
interactive run offers to add it to the user Path. It does not create or modify
development.json or a PowerShell profile.

.PARAMETER AddToPath
Adds the scripts directory to the user Path without prompting when it is not
already available through a persistent Path. Use this for unattended installs.

.PARAMETER SkipPathRegistration
Does not prompt or change the user Path.

.EXAMPLE
.\scripts\install-agent.ps1

.EXAMPLE
.\scripts\install-agent.ps1 -AddToPath -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
  [string]$AgentsRoot = (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.agents'),
  [switch]$AddToPath,
  [switch]$SkipPathRegistration,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$destinationScripts = Join-Path $AgentsRoot 'scripts'
$homeRoot = [Environment]::GetFolderPath('UserProfile')

function ConvertTo-AgentDisplayPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $absolutePath = [IO.Path]::GetFullPath($Path)
  $absoluteHome = [IO.Path]::GetFullPath($homeRoot).TrimEnd('\', '/')
  if ($absolutePath -eq $absoluteHome) { return '~' }
  if ($absolutePath.StartsWith("$absoluteHome\", [StringComparison]::OrdinalIgnoreCase)) {
    return '~/' + $absolutePath.Substring($absoluteHome.Length + 1).Replace('\', '/')
  }
  return '[custom]/' + [IO.Path]::GetFileName($absolutePath.TrimEnd('\', '/'))
}

function Test-AgentSamePath {
  param(
    [Parameter(Mandatory = $true)][string]$Left,
    [Parameter(Mandatory = $true)][string]$Right
  )

  try {
    $leftPath = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Left)).TrimEnd('\', '/')
    $rightPath = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Right)).TrimEnd('\', '/')
    return [string]::Equals($leftPath, $rightPath, [StringComparison]::OrdinalIgnoreCase)
  } catch {
    return $false
  }
}

function Test-AgentCanPrompt {
  try {
    if ([Console]::IsInputRedirected) { return $false }
  } catch {
    return $false
  }
  return -not ([Environment]::GetCommandLineArgs() | Where-Object { $_ -match '^-NonI' })
}

function Read-AgentPathConsent {
  param([Parameter(Mandatory = $true)][string]$DisplayPath)

  while ($true) {
    $response = ([string](Read-Host "Add $DisplayPath to your user Path? [y/N]")).Trim()
    switch ($response.ToLowerInvariant()) {
      { $_ -in @('', 'n', 'no') } { return $false }
      { $_ -in @('y', 'yes') } { return $true }
      default { Write-Host 'Please enter y or n.' }
    }
  }
}

function Assert-AgentCommandRegistrationSafe {
  $targetCommand = Join-Path $destinationScripts 'agent.cmd'
  $existingCommand = @(Get-Command agent -All -ErrorAction SilentlyContinue) |
    Where-Object {
      -not $_.Source -or -not (Test-AgentSamePath -Left $_.Source -Right $targetCommand)
    }
  if ($existingCommand.Count -gt 0) {
    throw 'Another command named agent is already available. Resolve the command collision before registering this one.'
  }
}

function Install-AgentPathRegistration {
  if ($SkipPathRegistration) { return }

  $displayPath = ConvertTo-AgentDisplayPath $destinationScripts
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userEntries = @($userPath -split ';' | Where-Object { $_ })
  $machineEntries = @($machinePath -split ';' | Where-Object { $_ })
  $processEntries = @($env:Path -split ';' | Where-Object { $_ })
  $availableInCurrentProcess = [bool]($processEntries | Where-Object {
    Test-AgentSamePath -Left $_ -Right $destinationScripts
  })
  if ($userEntries | Where-Object { Test-AgentSamePath -Left $_ -Right $destinationScripts }) {
    Assert-AgentCommandRegistrationSafe
    Write-Output "Current: $displayPath is already registered in the user Path."
    if (-not $availableInCurrentProcess) {
      Write-Output 'Open a new terminal before running agent.'
    }
    return
  }
  if ($machineEntries | Where-Object { Test-AgentSamePath -Left $_ -Right $destinationScripts }) {
    Assert-AgentCommandRegistrationSafe
    Write-Output "Current: $displayPath is already available through the machine Path."
    if (-not $availableInCurrentProcess) {
      Write-Output 'Open a new terminal before running agent.'
    }
    return
  }

  $register = [bool]$AddToPath
  if (-not $register) {
    if ($WhatIfPreference) {
      Write-Output 'Path registration was not selected. Add -AddToPath to preview it with -WhatIf.'
      return
    }
    if (-not (Test-AgentCanPrompt)) {
      Write-Output "Not registered: $displayPath is not in a persistent Path. Rerun with -AddToPath to register it."
      return
    }
    $register = Read-AgentPathConsent -DisplayPath $displayPath
  }
  if (-not $register) {
    Write-Output "Not registered: $displayPath was not added to the user Path."
    return
  }
  if (-not $PSCmdlet.ShouldProcess('User Path', "Append $displayPath")) { return }

  Assert-AgentCommandRegistrationSafe
  [Environment]::SetEnvironmentVariable('Path', ((@($userEntries) + $destinationScripts) -join ';'), 'User')
  Write-Output "Registered: $displayPath in the user Path."
  Write-Output 'Open a new terminal before running agent.'
}

try {
  if ($AddToPath -and $SkipPathRegistration) {
    throw '-AddToPath and -SkipPathRegistration cannot be used together.'
  }
  $nodeCommand = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
  $AgentsRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($AgentsRoot)
  $destinationScripts = Join-Path $AgentsRoot 'scripts'
  $installerArguments = @((Join-Path $PSScriptRoot 'install-agent.mjs'), '--agents-root', $AgentsRoot)
  if ($Force) { $installerArguments += '--force' }
  # Node preflights the complete batch before writing; WhatIf remains read-only.
  if ($WhatIfPreference) {
    & $nodeCommand.Source @installerArguments --dry-run
    if ($LASTEXITCODE -ne 0) { throw 'Agent installation preview failed.' }
  } else {
    if (-not $PSCmdlet.ShouldProcess((ConvertTo-AgentDisplayPath $AgentsRoot), 'Install or update agent runtime files')) { return }
    & $nodeCommand.Source @installerArguments
    if ($LASTEXITCODE -ne 0) { throw 'Agent installation failed.' }
  }
  Install-AgentPathRegistration
} catch {
  $message = $_.Exception.Message
  if ($homeRoot) {
    $message = $message.Replace($homeRoot, '~').Replace($homeRoot.Replace('\', '/'), '~')
  }
  throw $message
}
