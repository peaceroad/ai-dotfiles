[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$installer = Join-Path $PSScriptRoot 'install-agent.ps1'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('agent-install-test-' + [guid]::NewGuid().ToString('N'))
$agentsRoot = Join-Path $tempRoot '.agents'

function Assert-AgentTest {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if (-not $Condition) { throw $Message }
}

function Get-LegacyAgentContent {
  param([Parameter(Mandatory = $true)][string]$Source)

  $content = [IO.File]::ReadAllText($Source)
  switch (Split-Path -Leaf $Source) {
    'agent.cmd' { return $content -replace '(?m)^rem @ai-dotfiles agent-command v1\r?\n', '' }
    'agent.mjs' { return $content -replace '(?m)^// @ai-dotfiles agent-command v1\r?\n\r?\n', '' }
    'development.schema.json' {
      $legacyContent = $content -replace '(?m)^  "\$comment": "@ai-dotfiles agent-command v1",\r?\n', ''
      return $legacyContent.Replace('/tools/agent/development.schema.json', '/.agents/development.schema.json')
    }
    default { throw "No legacy test fixture exists for: $Source" }
  }
}

try {
  $tokens = $null
  $parseErrors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($installer, [ref]$tokens, [ref]$parseErrors)
  Assert-AgentTest ($parseErrors.Count -eq 0) 'Installer has a PowerShell parser error.'

  $tokens = $null
  $parseErrors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($PSCommandPath, [ref]$tokens, [ref]$parseErrors)
  Assert-AgentTest ($parseErrors.Count -eq 0) 'Installer test has a PowerShell parser error.'

  $whatIfRoot = Join-Path $tempRoot '.agents-whatif'
  & $installer -AgentsRoot $whatIfRoot -SkipPathRegistration -WhatIf
  Assert-AgentTest (-not (Test-Path -LiteralPath $whatIfRoot)) 'Installer changed files during -WhatIf.'

  New-Item -ItemType Directory -Path $agentsRoot -Force | Out-Null
  $localConfig = Join-Path $agentsRoot 'development.json'
  Set-Content -LiteralPath $localConfig -Value '{"schemaVersion":1,"plugins":{},"marketplaces":{}}' -Encoding utf8NoBOM
  $configBefore = Get-Content -LiteralPath $localConfig -Raw

  & $installer -AgentsRoot $agentsRoot -SkipPathRegistration
  Assert-AgentTest ((Get-Content -LiteralPath $localConfig -Raw) -eq $configBefore) 'Installer changed development.json.'

  $files = @(
    @{ Source = (Join-Path $projectRoot 'tools\agent\agent.cmd'); Destination = (Join-Path $agentsRoot 'scripts\agent.cmd') }
    @{ Source = (Join-Path $projectRoot 'tools\agent\agent.mjs'); Destination = (Join-Path $agentsRoot 'scripts\agent.mjs') }
    @{ Source = (Join-Path $projectRoot 'tools\agent\development.schema.json'); Destination = (Join-Path $agentsRoot 'development.schema.json') }
  )
  foreach ($file in $files) {
    Assert-AgentTest (Test-Path -LiteralPath $file.Destination -PathType Leaf) "Installed file is missing: $($file.Destination)"
    Assert-AgentTest (
      (Get-FileHash -LiteralPath $file.Source -Algorithm SHA256).Hash -eq
      (Get-FileHash -LiteralPath $file.Destination -Algorithm SHA256).Hash
    ) "Installed file differs from its source: $($file.Destination)"
  }

  $legacyRoot = Join-Path $tempRoot '.agents-legacy'
  foreach ($file in $files) {
    $legacyDestination = $file.Destination.Replace($agentsRoot, $legacyRoot)
    New-Item -ItemType Directory -Path (Split-Path -Parent $legacyDestination) -Force | Out-Null
    Set-Content -LiteralPath $legacyDestination -Value (Get-LegacyAgentContent -Source $file.Source) -Encoding utf8NoBOM -NoNewline
  }
  $obsoleteTest = Join-Path $legacyRoot 'scripts\agent.test.mjs'
  Copy-Item -LiteralPath (Join-Path $projectRoot 'tools\agent\agent.test.mjs') -Destination $obsoleteTest
  & $installer -AgentsRoot $legacyRoot -SkipPathRegistration
  foreach ($file in $files) {
    $legacyDestination = $file.Destination.Replace($agentsRoot, $legacyRoot)
    Assert-AgentTest (
      (Get-FileHash -LiteralPath $file.Source -Algorithm SHA256).Hash -eq
      (Get-FileHash -LiteralPath $legacyDestination -Algorithm SHA256).Hash
    ) "Installer did not migrate the known legacy file: $legacyDestination"
  }
  Assert-AgentTest (-not (Test-Path -LiteralPath $obsoleteTest)) 'Installer did not remove the known obsolete test file.'
  Set-Content -LiteralPath $obsoleteTest -Value '// preserve me' -Encoding utf8NoBOM
  & $installer -AgentsRoot $legacyRoot -SkipPathRegistration
  Assert-AgentTest (Test-Path -LiteralPath $obsoleteTest -PathType Leaf) 'Installer removed an unrecognized obsolete-path file.'

  & $installer -AgentsRoot $agentsRoot -SkipPathRegistration

  $agentCommand = Join-Path $agentsRoot 'scripts\agent.cmd'
  $agentImplementation = Join-Path $agentsRoot 'scripts\agent.mjs'
  $staleManagedCommand = "@echo off`nrem @ai-dotfiles agent-command v1`nrem stale`n"
  Set-Content -LiteralPath $agentCommand -Value $staleManagedCommand -Encoding utf8NoBOM -NoNewline
  Set-Content -LiteralPath $agentImplementation -Value '// unmanaged collision' -Encoding utf8NoBOM
  $collisionRejected = $false
  try {
    & $installer -AgentsRoot $agentsRoot -SkipPathRegistration
  } catch {
    $collisionRejected = $true
  }
  Assert-AgentTest $collisionRejected 'Installer replaced an unmanaged collision without -Force.'
  Assert-AgentTest ((Get-Content -LiteralPath $agentCommand -Raw) -eq $staleManagedCommand) 'Installer changed a file before rejecting a later collision.'

  & $installer -AgentsRoot $agentsRoot -SkipPathRegistration -Force
  Write-Output 'Agent installer tests passed.'
} finally {
  $resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
  $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
  if ($resolvedTemp.StartsWith("$systemTemp\", [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
  }
}
