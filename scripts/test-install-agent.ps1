[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$installer = Join-Path $PSScriptRoot 'install-agent.ps1'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('agent-install-test 日本語 ' + [guid]::NewGuid().ToString('N'))
$agentsRoot = Join-Path $tempRoot '.agents'

function Assert-AgentTest {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if (-not $Condition) { throw $Message }
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

  $conflictingOptionsRoot = Join-Path $tempRoot '.agents-conflicting-options'
  $conflictingOptionsRejected = $false
  try {
    & $installer -AgentsRoot $conflictingOptionsRoot -AddToPath -SkipPathRegistration
  } catch {
    $conflictingOptionsRejected = $true
  }
  Assert-AgentTest $conflictingOptionsRejected 'Installer accepted conflicting Path registration options.'
  Assert-AgentTest (-not (Test-Path -LiteralPath $conflictingOptionsRoot)) 'Installer wrote files before rejecting conflicting Path registration options.'

  $userPathBefore = [Environment]::GetEnvironmentVariable('Path', 'User')
  $pathWhatIfRoot = Join-Path $tempRoot '.agents-path-whatif'
  & $installer -AgentsRoot $pathWhatIfRoot -AddToPath -WhatIf
  Assert-AgentTest (-not (Test-Path -LiteralPath $pathWhatIfRoot)) 'Installer changed files during Path registration -WhatIf.'
  Assert-AgentTest (
    [Environment]::GetEnvironmentVariable('Path', 'User') -eq $userPathBefore
  ) 'Installer changed the user Path during -WhatIf.'

  $nonInteractiveRoot = Join-Path $tempRoot '.agents-noninteractive'
  $pwsh = (Get-Process -Id $PID).Path
  $nonInteractiveOutput = & $pwsh `
    -NoProfile `
    -NonInteractive `
    -File $installer `
    -AgentsRoot $nonInteractiveRoot 2>&1 | Out-String
  Assert-AgentTest ($LASTEXITCODE -eq 0) 'Non-interactive install without a Path choice failed.'
  Assert-AgentTest (
    Test-Path -LiteralPath (Join-Path $nonInteractiveRoot 'scripts\agent.cmd') -PathType Leaf
  ) 'Non-interactive install did not install the agent command.'
  Assert-AgentTest ($nonInteractiveOutput.Contains('Rerun with -AddToPath')) 'Non-interactive install did not explain explicit Path registration.'
  Assert-AgentTest (
    [Environment]::GetEnvironmentVariable('Path', 'User') -eq $userPathBefore
  ) 'Non-interactive install changed the user Path without consent.'

  $whatIfRoot = Join-Path $tempRoot '.agents-whatif'
  & $installer -AgentsRoot $whatIfRoot -SkipPathRegistration -WhatIf
  Assert-AgentTest (-not (Test-Path -LiteralPath $whatIfRoot)) 'Installer changed files during -WhatIf.'

  New-Item -ItemType Directory -Path (Join-Path $agentsRoot 'ai-dotfiles') -Force | Out-Null
  $localConfig = Join-Path $agentsRoot 'ai-dotfiles\development.json'
  Set-Content -LiteralPath $localConfig -Value '{"schemaVersion":2,"plugins":{},"marketplaces":{}}' -Encoding utf8NoBOM
  $configBefore = Get-Content -LiteralPath $localConfig -Raw

  & $installer -AgentsRoot $agentsRoot -SkipPathRegistration
  Assert-AgentTest ((Get-Content -LiteralPath $localConfig -Raw) -eq $configBefore) 'Installer changed development.json.'

  $commandCollisionRejected = $false
  function agent { }
  try {
    try {
      & $installer -AgentsRoot $agentsRoot -AddToPath | Out-Null
    } catch {
      if ($_.Exception.Message -notmatch 'Another command named agent') { throw }
      $commandCollisionRejected = $true
    }
  } finally {
    Remove-Item -LiteralPath Function:\agent
  }
  Assert-AgentTest $commandCollisionRejected 'Installer registered a Path that would expose a command collision.'
  Assert-AgentTest (
    [Environment]::GetEnvironmentVariable('Path', 'User') -eq $userPathBefore
  ) 'Installer changed the user Path after detecting a command collision.'

  $coreFiles = @(
    @{ Source = (Join-Path $projectRoot 'tools\agent\agent.cmd'); Destination = (Join-Path $agentsRoot 'scripts\agent.cmd') }
    @{ Source = (Join-Path $projectRoot 'tools\agent\agent.mjs'); Destination = (Join-Path $agentsRoot 'ai-dotfiles\runtime\agent.mjs') }
    @{ Source = (Join-Path $projectRoot 'tools\agent\development.schema.json'); Destination = (Join-Path $agentsRoot 'ai-dotfiles\development.schema.json') }
  )
  $pluginToolsSource = Join-Path $projectRoot 'plugins\agent-plugin-tools\skills\plugin-creator-agent-plugins'
  $pluginToolsDestination = Join-Path $agentsRoot 'ai-dotfiles\runtime\plugin-tools'
  $pluginRuntimeFiles = @(
    @{ Source = (Join-Path $pluginToolsSource 'scripts\manage-local-agent-plugin.mjs'); Destination = (Join-Path $pluginToolsDestination 'scripts\manage-local-agent-plugin.mjs') }
    @{ Source = (Join-Path $pluginToolsSource 'scripts\assemble-agent-marketplace.mjs'); Destination = (Join-Path $pluginToolsDestination 'scripts\assemble-agent-marketplace.mjs') }
    @{ Source = (Join-Path $pluginToolsSource 'scripts\validate-agent-plugin.mjs'); Destination = (Join-Path $pluginToolsDestination 'scripts\validate-agent-plugin.mjs') }
    @{ Source = (Join-Path $pluginToolsSource 'assets\marketplace-distribution\marketplace-development.schema.json'); Destination = (Join-Path $pluginToolsDestination 'assets\marketplace-distribution\marketplace-development.schema.json') }
  )
  $files = @(
    $coreFiles
    @{ Source = (Join-Path $projectRoot 'tools\agent\manage-skill-links.mjs'); Destination = (Join-Path $agentsRoot 'ai-dotfiles\runtime\manage-skill-links.mjs') }
    $pluginRuntimeFiles
  )
  foreach ($file in $pluginRuntimeFiles) {
    Assert-AgentTest (
      -not [IO.File]::ReadAllText($file.Source).Contains('@ai-dotfiles agent-dev-runtime managed')
    ) "Generic plugin tooling contains an ai-dotfiles ownership marker: $($file.Source)"
  }
  foreach ($file in $files) {
    Assert-AgentTest (Test-Path -LiteralPath $file.Destination -PathType Leaf) "Installed file is missing: $($file.Destination)"
    Assert-AgentTest (
      (Get-FileHash -LiteralPath $file.Source -Algorithm SHA256).Hash -eq
      (Get-FileHash -LiteralPath $file.Destination -Algorithm SHA256).Hash
    ) "Installed file differs from its source: $($file.Destination)"
  }

  & $installer -AgentsRoot $agentsRoot -SkipPathRegistration

  $staleGenericManager = "#!/usr/bin/env node`n`n// @plugin-creator-agent-plugins managed-local-runner v1`n`n// stale`n"
  Set-Content -LiteralPath $pluginRuntimeFiles[0].Destination -Value $staleGenericManager -Encoding utf8NoBOM -NoNewline
  $staleLegacyRuntime = "#!/usr/bin/env node`n`n// @ai-dotfiles agent-dev-runtime managed`n`n// stale`n"
  Set-Content -LiteralPath $pluginRuntimeFiles[1].Destination -Value $staleLegacyRuntime -Encoding utf8NoBOM -NoNewline
  & $installer -AgentsRoot $agentsRoot -SkipPathRegistration
  foreach ($file in $pluginRuntimeFiles[0..1]) {
    Assert-AgentTest (
      (Get-FileHash -LiteralPath $file.Source -Algorithm SHA256).Hash -eq
      (Get-FileHash -LiteralPath $file.Destination -Algorithm SHA256).Hash
    ) "Installer did not update a managed plugin runtime file: $($file.Destination)"
  }

  $agentCommand = Join-Path $agentsRoot 'scripts\agent.cmd'
  $agentImplementation = Join-Path $agentsRoot 'ai-dotfiles\runtime\agent.mjs'
  $staleManagedCommand = "@echo off`nrem @ai-dotfiles agent-dev-runtime managed`nrem stale`n"
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
  $launcherHelp = & $agentCommand --help | Out-String
  Assert-AgentTest ($LASTEXITCODE -eq 0 -and $launcherHelp.Contains('Agent Skill')) 'Windows launcher failed to start its runtime.'
  $codexHelp = & $agentCommand codex --help | Out-String
  Assert-AgentTest ($LASTEXITCODE -eq 0 -and $codexHelp.Contains('Codex diagnostics')) 'Windows launcher failed to dispatch Codex tools.'
  $gitAclHelp = & $agentCommand codex git-acl --help | Out-String
  Assert-AgentTest ($LASTEXITCODE -eq 0 -and $gitAclHelp.Contains('CodexHome')) 'Windows launcher failed to run the standalone PowerShell helper.'
  $previousConfig = $env:AGENT_DEV_CONFIG
  try {
    $env:AGENT_DEV_CONFIG = $localConfig
    $launcherError = & $agentCommand dev plugin status 'name with spaces' 2>&1 | Out-String
    Assert-AgentTest ($LASTEXITCODE -ne 0 -and $launcherError.Contains('name with spaces') -and -not $launcherError.Contains('Unexpected argument')) 'Windows launcher did not preserve quoted arguments or failure status.'
  } finally {
    $env:AGENT_DEV_CONFIG = $previousConfig
  }
  Write-Output 'Agent installer tests passed.'
} finally {
  $resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
  $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
  if ($resolvedTemp.StartsWith("$systemTemp\", [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
  }
}
