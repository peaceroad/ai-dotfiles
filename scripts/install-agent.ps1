<#
.SYNOPSIS
Installs the repository-owned agent command for the current user.

.DESCRIPTION
Copies the agent launcher, Node.js implementation, development schema, and
version-matched runtime managers into the selected .agents directory. By
default, it also registers the scripts directory in the user Path. It does not
create or modify development.json or a PowerShell profile.

.EXAMPLE
.\scripts\install-agent.ps1

.EXAMPLE
.\scripts\install-agent.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
  [string]$AgentsRoot = (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.agents'),
  [switch]$SkipPathRegistration,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$agentMarker = '@ai-dotfiles agent-dev-runtime managed'
$legacyAgentMarker = '@ai-dotfiles agent-command v1'
$localPluginMarker = '@plugin-creator-agent-plugins managed-local-runner v1'
$marketplaceAssemblerMarker = '@plugin-creator-agent-plugins managed-marketplace-assembler v1'
$portableValidatorMarker = '@plugin-creator-agent-plugins managed-portable-validator v1'
$marketplaceSchemaMarker = '@plugin-creator-agent-plugins managed-marketplace-schema v2'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $projectRoot 'tools\agent'
$destinationScripts = Join-Path $AgentsRoot 'scripts'
$pluginToolsSource = Join-Path $projectRoot 'plugins\agent-plugin-tools\skills\plugin-creator-agent-plugins'
$pluginToolsDestination = Join-Path $destinationScripts 'agent-runtime\plugin-tools'
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

function Test-AgentManagedFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string[]]$Markers
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  $firstLines = @(Get-Content -LiteralPath $Path -TotalCount 8 -ErrorAction Stop)
  return [bool]($Markers | Where-Object {
    $firstLines -match [regex]::Escape($_)
  } | Select-Object -First 1)
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

function Get-AgentLegacyContent {
  param([Parameter(Mandatory = $true)][string]$Source)

  $content = [IO.File]::ReadAllText($Source)
  $escapedMarker = [regex]::Escape($agentMarker)
  switch (Split-Path -Leaf $Source) {
    'agent.cmd' {
      return $content -replace "(?m)^rem $escapedMarker\r?\n", ''
    }
    'agent.mjs' {
      return $content -replace "(?m)^// $escapedMarker\r?\n\r?\n", ''
    }
    'development.schema.json' {
      $commentPattern = '(?m)^  "\$comment": "' + $escapedMarker + '",\r?\n'
      $legacyContent = $content -replace $commentPattern, ''
      return $legacyContent.Replace('/tools/agent/development.schema.json', '/.agents/development.schema.json')
    }
    default {
      throw "No legacy migration rule exists for: $(ConvertTo-AgentDisplayPath $Source)"
    }
  }
}

function Test-AgentLegacyInstallation {
  param([Parameter(Mandatory = $true)][array]$Payload)

  $legacyCount = 0
  foreach ($item in $Payload) {
    if (-not (Test-Path -LiteralPath $item.Destination -PathType Leaf)) { return $false }
    if (Test-AgentManagedFile -Path $item.Destination -Markers $item.Markers) { continue }
    if ([IO.File]::ReadAllText($item.Destination) -cne (Get-AgentLegacyContent -Source $item.Source)) {
      return $false
    }
    $legacyCount++
  }
  return $legacyCount -gt 0
}

function Get-AgentInstallAction {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][string[]]$Markers,
    [switch]$AllowLegacyMigration
  )

  if (-not (Test-AgentManagedFile -Path $Source -Markers $Markers)) {
    throw "The source file is missing the managed marker: $(ConvertTo-AgentDisplayPath $Source)"
  }

  $destinationExists = Test-Path -LiteralPath $Destination
  if (-not $destinationExists) { return 'Install' }
  if (-not (Test-Path -LiteralPath $Destination -PathType Leaf)) {
    throw "The installation target is not a file: $(ConvertTo-AgentDisplayPath $Destination)"
  }
  $sourceHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash
  $destinationHash = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash
  if ($sourceHash -eq $destinationHash) { return 'Current' }
  if (-not $Force -and -not $AllowLegacyMigration -and -not (Test-AgentManagedFile -Path $Destination -Markers $Markers)) {
    throw "Refusing to replace an unmanaged file: $(ConvertTo-AgentDisplayPath $Destination). Use -Force only after reviewing it."
  }
  return 'Update'
}

function Install-AgentFile {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][ValidateSet('Current', 'Install', 'Update')][string]$Action
  )

  if ($Action -eq 'Current') {
    Write-Output "Current: $(ConvertTo-AgentDisplayPath $Destination)"
    return
  }
  if (-not $PSCmdlet.ShouldProcess((ConvertTo-AgentDisplayPath $Destination), "$Action agent development file")) { return }

  $destinationDirectory = Split-Path -Parent $Destination
  New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
  $temporaryPath = Join-Path $destinationDirectory ('.agent-install-' + [guid]::NewGuid().ToString('N') + '.tmp')
  try {
    Copy-Item -LiteralPath $Source -Destination $temporaryPath
    Move-Item -LiteralPath $temporaryPath -Destination $Destination -Force
  } finally {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }
  $result = if ($Action -eq 'Update') { 'Updated' } else { 'Installed' }
  Write-Output "${result}: $(ConvertTo-AgentDisplayPath $Destination)"
}

function Remove-AgentObsoleteFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$KnownSource
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
  $existingHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  $knownHash = (Get-FileHash -LiteralPath $KnownSource -Algorithm SHA256).Hash
  if ($existingHash -ne $knownHash) {
    Write-Warning "Preserved an unrecognized obsolete-path file: $(ConvertTo-AgentDisplayPath $Path)"
    return
  }
  if ($PSCmdlet.ShouldProcess((ConvertTo-AgentDisplayPath $Path), 'Remove obsolete installed test file')) {
    Remove-Item -LiteralPath $Path -Force
    Write-Output "Removed obsolete: $(ConvertTo-AgentDisplayPath $Path)"
  }
}

function Remove-AgentManagedObsoleteFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string[]]$Markers
  )

  if (-not (Test-Path -LiteralPath $Path)) { return }
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -or
      -not (Test-AgentManagedFile -Path $Path -Markers $Markers)) {
    Write-Warning "Preserved an unmanaged obsolete-path file: $(ConvertTo-AgentDisplayPath $Path)"
    return
  }
  if ($PSCmdlet.ShouldProcess((ConvertTo-AgentDisplayPath $Path), 'Remove obsolete managed runtime file')) {
    Remove-Item -LiteralPath $Path -Force
    Write-Output "Removed obsolete: $(ConvertTo-AgentDisplayPath $Path)"
  }
}

try {
  if (-not (Get-Command node -CommandType Application -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required but node was not found on Path.'
  }

  if (-not $SkipPathRegistration) {
    $existingCommand = @(Get-Command agent -All -ErrorAction SilentlyContinue) |
      Where-Object {
        -not $_.Source -or -not (Test-AgentSamePath -Left $_.Source -Right (Join-Path $destinationScripts 'agent.cmd'))
      }
    if ($existingCommand.Count -gt 0) {
      throw 'Another command named agent is already available. Resolve the command collision before registering this one.'
    }
  }

  $corePayload = @(
    @{ Source = (Join-Path $sourceRoot 'agent.cmd'); Destination = (Join-Path $destinationScripts 'agent.cmd'); Markers = @($agentMarker, $legacyAgentMarker) }
    @{ Source = (Join-Path $sourceRoot 'agent.mjs'); Destination = (Join-Path $destinationScripts 'agent.mjs'); Markers = @($agentMarker, $legacyAgentMarker) }
    @{ Source = (Join-Path $sourceRoot 'development.schema.json'); Destination = (Join-Path $AgentsRoot 'development.schema.json'); Markers = @($agentMarker, $legacyAgentMarker) }
  )
  $payload = @(
    $corePayload
    @{ Source = (Join-Path $projectRoot '.agents\scripts\manage-skill-links.mjs'); Destination = (Join-Path $destinationScripts 'manage-skill-links.mjs'); Markers = @($agentMarker, $legacyAgentMarker) }
    @{ Source = (Join-Path $pluginToolsSource 'scripts\manage-local-agent-plugin.mjs'); Destination = (Join-Path $pluginToolsDestination 'scripts\manage-local-agent-plugin.mjs'); Markers = @($localPluginMarker, $agentMarker) }
    @{ Source = (Join-Path $pluginToolsSource 'scripts\assemble-agent-marketplace.mjs'); Destination = (Join-Path $pluginToolsDestination 'scripts\assemble-agent-marketplace.mjs'); Markers = @($marketplaceAssemblerMarker, $agentMarker) }
    @{ Source = (Join-Path $pluginToolsSource 'scripts\validate-agent-plugin.mjs'); Destination = (Join-Path $pluginToolsDestination 'scripts\validate-agent-plugin.mjs'); Markers = @($portableValidatorMarker, $agentMarker) }
    @{ Source = (Join-Path $pluginToolsSource 'assets\marketplace-distribution\marketplace-development.schema.json'); Destination = (Join-Path $pluginToolsDestination 'assets\marketplace-distribution\marketplace-development.schema.json'); Markers = @($marketplaceSchemaMarker, $agentMarker) }
  )
  $legacyMigration = Test-AgentLegacyInstallation -Payload $corePayload
  $plan = foreach ($item in $payload) {
    @{
      Source = $item.Source
      Destination = $item.Destination
      Action = Get-AgentInstallAction `
        -Source $item.Source `
        -Destination $item.Destination `
        -Markers $item.Markers `
        -AllowLegacyMigration:$legacyMigration
    }
  }

  foreach ($item in $plan) {
    Install-AgentFile -Source $item.Source -Destination $item.Destination -Action $item.Action
  }

  Remove-AgentObsoleteFile `
    -Path (Join-Path $destinationScripts 'agent.test.mjs') `
    -KnownSource (Join-Path $sourceRoot 'agent.test.mjs')

  Remove-AgentManagedObsoleteFile `
    -Path (Join-Path $pluginToolsDestination 'scripts\assemble-plugin-marketplace.mjs') `
    -Markers @($marketplaceAssemblerMarker, $agentMarker)

  if (-not $SkipPathRegistration) {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @($userPath -split ';' | Where-Object { $_ })
    $normalizedDestination = [IO.Path]::GetFullPath($destinationScripts).TrimEnd('\', '/')
    $registered = $entries | Where-Object {
      Test-AgentSamePath -Left $_ -Right $normalizedDestination
    }
    if ($registered) {
      Write-Output 'Current: ~/.agents/scripts is already registered in the user Path.'
    } elseif ($PSCmdlet.ShouldProcess('User Path', 'Append ~/.agents/scripts')) {
      [Environment]::SetEnvironmentVariable('Path', ((@($entries) + $destinationScripts) -join ';'), 'User')
      Write-Output 'Registered: ~/.agents/scripts in the user Path.'
      Write-Output 'Open a new terminal before running agent.'
    }
  }
} catch {
  $message = $_.Exception.Message
  if ($homeRoot) {
    $message = $message.Replace($homeRoot, '~').Replace($homeRoot.Replace('\', '/'), '~')
  }
  throw $message
}
