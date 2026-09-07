#requires -Version 7.0
[CmdletBinding()]
param([string]$ScriptPath = (Join-Path $PSScriptRoot '../home/.agents/scripts/codex/manage-git-write-acl.ps1'))

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Windows is required.' }
$ScriptPath = (Resolve-Path -LiteralPath $ScriptPath).Path
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($ScriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Script has PowerShell parse errors.' }
# Load only function definitions. Never execute repair or persist a filesystem ACL.
foreach ($definition in $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
    . ([scriptblock]::Create($definition.Extent.Text))
}
function Assert-True($Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}
function Assert-Rejected([scriptblock]$Action, [string]$Message) {
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $_.Exception.Message -like "*$Message*" }
    Assert-True $rejected "Expected refusal: $Message"
}
function New-TestAcl([string]$Entries) {
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetSecurityDescriptorSddlForm("D:$Entries")
    return $acl
}
$script:sids = @('S-1-15-3-1')
$acl = New-TestAcl '(D;;0x00010156;;;S-1-15-3-1)(D;;0x2;;;S-1-15-3-2)(A;;FA;;;S-1-15-3-1)'
$rules = @(Get-Rules $acl)
Assert-True ($rules.Count -eq 1) 'Select only the mapped SID write-denial entry.'
$acl.RemoveAccessRuleSpecific($rules[0])
$remaining = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
Assert-True ($remaining.Count -eq 2) 'Preserve unrelated denial and allow entries.'
Assert-True (@(Get-Rules $acl).Count -eq 0) 'No matching denial remains after in-memory removal.'
foreach ($mask in @('0x130156', '0x40130156')) {
    # Different inheritance keeps the read Deny separate during .NET normalization.
    $preserved = '(D;CI;FR;;;S-1-15-3-1)(D;;0x2;;;S-1-15-3-2)(A;;FA;;;S-1-15-3-1)'
    $acl = New-TestAcl "(D;;$mask;;;S-1-15-3-1)$preserved"
    $rules = @(Get-Rules $acl)
    Assert-True ($rules.Count -eq 1) 'Accept the observed Codex write-denial masks, including shared standard rights.'
    $acl.RemoveAccessRuleSpecific($rules[0])
    $actual = $acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
    $expected = (New-TestAcl $preserved).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
    Assert-True ($actual -ceq $expected -and @(Get-Rules $acl).Count -eq 0) 'Known-mask removal preserves same-SID read denial, other-SID denial, and Allow.'
    Assert-Rejected { Get-Rules (New-TestAcl "(D;;$mask;;;S-1-15-3-1)(D;;FR;;;S-1-15-3-1)") } 'outside the supported write mask'
}
Assert-True (@(Get-Rules (New-TestAcl '(D;;FR;;;S-1-15-3-1)')).Count -eq 0) 'Read-only denial is not a repair target.'
Assert-Rejected { Get-Rules (New-TestAcl '(D;;0x3;;;S-1-15-3-1)') } 'outside the supported write mask'
Assert-Rejected { Get-Rules (New-TestAcl '(D;;FA;;;S-1-15-3-1)') } 'outside the supported write mask'
foreach ($securityMask in @('0x40000', '0x80000', '0xD0156')) {
    Assert-Rejected { Get-Rules (New-TestAcl "(D;;$securityMask;;;S-1-15-3-1)") } 'outside the supported write mask'
}
Assert-Rejected { Get-Rules (New-TestAcl '(D;ID;0x2;;;S-1-15-3-1)') } 'inherited Deny'
$inheritedAcl = New-TestAcl '(D;ID;0x130156;;;S-1-15-3-1)(D;OICIIOID;0x40130156;;;S-1-15-3-1)(A;OICIID;FA;;;SY)'
$inheritedRules = @(Get-Rules $inheritedAcl -IncludeInherited)
Assert-True ($inheritedRules.Count -eq 2 -and @($inheritedRules | Where-Object IsInherited).Count -eq 2) 'Inspect supported inherited Deny when explicitly requested.'
$expectedInheritedSddl = Get-SddlWithoutInheritedRules $inheritedAcl $inheritedRules
Assert-True ($expectedInheritedSddl -notmatch 'S-1-15-3-1' -and $expectedInheritedSddl -match 'SY') 'Model inherited Deny removal while preserving unrelated inherited Allow.'
Assert-Rejected { Get-SddlWithoutInheritedRules $inheritedAcl @($inheritedRules[0]) } 'model inherited Deny removal exactly'
foreach ($aclType in @([Security.AccessControl.DirectorySecurity], [Security.AccessControl.FileSecurity])) {
    $sourceAcl = [Activator]::CreateInstance($aclType)
    $sourceAcl.SetSecurityDescriptorSddlForm('O:S-1-5-21-1-2-3-1001G:S-1-5-21-1-2-3-513D:P(D;;0x130156;;;S-1-15-3-1)(D;;FR;;;S-1-15-3-2)(A;;FA;;;S-1-5-21-1-2-3-1001)S:(AU;SA;FW;;;WD)')
    $originalDescriptor = $sourceAcl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All)
    $updateAcl = New-DaclUpdate $sourceAcl
    Assert-True ($updateAcl.GetType() -eq $aclType) 'Retain the file or directory ACL type.'
    $rawUpdate = [Security.AccessControl.RawSecurityDescriptor]::new($updateAcl.GetSecurityDescriptorBinaryForm(), 0)
    Assert-True ($null -eq $rawUpdate.Owner -and $null -eq $rawUpdate.Group -and $null -eq $rawUpdate.SystemAcl) 'Update payload excludes owner, group, and audit sections.'
    Assert-True ($updateAcl.AreAccessRulesProtected -and $rawUpdate.DiscretionaryAcl.Count -eq 2) 'Preserve DACL protection and unrelated entries.'
    Assert-True (@(Get-Rules $updateAcl).Count -eq 0) 'Update payload contains no matching Deny.'
    Assert-True ($sourceAcl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All) -ceq $originalDescriptor) 'Planning leaves the source descriptor unchanged.'
}
Assert-Rejected { New-DaclUpdate (New-TestAcl '(D;;0x130156;;;S-1-15-3-1)') } 'would produce a null or empty DACL'
Assert-Rejected { New-DaclUpdate (New-TestAcl '') } 'Null or empty DACL'
Assert-Rejected { New-DaclUpdate (New-TestAcl 'NO_ACCESS_CONTROL') } 'Null or empty DACL'
Assert-Rejected { New-DaclUpdate (New-TestAcl '(A;;FA;;;S-1-15-3-2)(D;;0x2;;;S-1-15-3-1)') } 'Non-canonical DACL'
function New-TestRecord([string]$Path) {
    return [ordered]@{ path = $Path; isDirectory = $false; sddl = 'D:(A;;FA;;;SY)'; owner = 'S-1-5-18'; group = 'S-1-5-18' }
}
$expectedRecords = @((New-TestRecord 'C:\fixture\.git\HEAD'), (New-TestRecord 'C:\fixture\.git\config'))
Assert-AclSnapshot @((New-TestRecord 'C:\fixture\.git\config'), (New-TestRecord 'C:\fixture\.git\HEAD')) $expectedRecords
foreach ($field in @('sddl', 'owner', 'group', 'isDirectory')) {
    $unexpectedRecord = New-TestRecord 'C:\fixture\.git\config'
    if ($field -eq 'isDirectory') { $unexpectedRecord[$field] = $true }
    else { $unexpectedRecord[$field] = 'changed' }
    Assert-Rejected { Assert-AclSnapshot @($expectedRecords[0], $unexpectedRecord) $expectedRecords } "Unexpected $field change"
}
Assert-Rejected { Assert-AclSnapshot @($expectedRecords[0]) $expectedRecords } 'contents changed'
Assert-Rejected { Assert-AclSnapshot @($expectedRecords[0], (New-TestRecord 'C:\fixture\.git\new')) $expectedRecords } 'Unexpected or duplicate path'
Assert-Rejected { Assert-AclSnapshot @($expectedRecords[0], $expectedRecords[0]) $expectedRecords } 'Unexpected or duplicate path'
Assert-True ((Normalize-PathKey 'C:/work/Project/') -ceq (Normalize-PathKey '\\?\C:\WORK\project')) 'Normalize case, separators, and extended paths.'
foreach ($variant in @($HOME, $HOME.Replace('\', '/'), $HOME.ToUpperInvariant())) {
    Assert-True ((ConvertTo-PublicText "$variant/test") -ceq '~/test') 'Redact home paths.'
}

$fixture = Join-Path ([IO.Path]::GetTempPath()) ('git-acl-review-' + [guid]::NewGuid().ToString('N'))
try {
    $gitOutput = @(& git init --quiet -- $fixture 2>&1)
    Assert-True ($LASTEXITCODE -eq 0) 'Create an isolated test repository.'
    $capPath = Join-Path $fixture 'cap_sid'
    $caps = @{ workspace_by_cwd = @{ $fixture = $script:sids[0] } }
    $utf8 = [Text.UTF8Encoding]::new($false)
    Write-Json $capPath $caps
    $statusOutput = @(& pwsh -NoProfile -File $ScriptPath status $fixture -CodexHome $fixture 2>&1)
    $statusText = $statusOutput -join "`n"
    Assert-True ($LASTEXITCODE -eq 0 -and $statusText -match 'ACL status: clear' -and
        $statusText -match 'Status is read-only; no ACLs changed') 'Read-only status clearly reports a safe, unchanged ACL state.'
    $statusOutput = @(& pwsh -NoProfile -File $ScriptPath status -Repo $fixture -CodexHome $fixture 2>&1)
    Assert-True ($LASTEXITCODE -eq 0) 'Named repository argument works.'
    $initialSnapshot = @(Get-GitAclSnapshot (Join-Path $fixture '.git'))
    Assert-AclSnapshot @(Get-GitAclSnapshot (Join-Path $fixture '.git')) $initialSnapshot
    $addedFile = Join-Path $fixture '.git/new-fixture-file'
    [IO.File]::WriteAllText($addedFile, 'concurrent file fixture', $utf8)
    Assert-Rejected { Assert-AclSnapshot @(Get-GitAclSnapshot (Join-Path $fixture '.git')) $initialSnapshot } 'contents changed'
    Remove-Item -LiteralPath $addedFile -Force
    Write-Json $capPath @{ writable_root_by_path = @{ (Join-Path $fixture '.git') = $script:sids[0] } }
    $statusOutput = @(& pwsh -NoProfile -File $ScriptPath status $fixture -CodexHome $fixture 2>&1)
    Assert-True ($LASTEXITCODE -eq 0) 'Exact .git writable-root mapping works.'
    Write-Json $capPath @{ workspace_by_cwd = @{ ($fixture + '-other') = $script:sids[0] } }
    $statusOutput = @(& pwsh -NoProfile -File $ScriptPath status $fixture -CodexHome $fixture 2>&1)
    Assert-True ($LASTEXITCODE -eq 1 -and ($statusOutput -join "`n") -match 'No exact') 'Reject a neighboring repository mapping.'
    Write-Json $capPath @{ workspace_by_cwd = @{ '.' = $script:sids[0] } }
    $statusOutput = @(& pwsh -NoProfile -File $ScriptPath status $fixture -CodexHome $fixture 2>&1)
    Assert-True ($LASTEXITCODE -eq 1 -and ($statusOutput -join "`n") -match 'non-absolute') 'Reject relative cap_sid mappings.'
    Write-Json $capPath $caps
    $previousGitDir = [Environment]::GetEnvironmentVariable('GIT_DIR')
    try {
        [Environment]::SetEnvironmentVariable('GIT_DIR', (Join-Path $fixture '.git'))
        $statusOutput = @(& pwsh -NoProfile -File $ScriptPath status $fixture -CodexHome $fixture 2>&1)
        Assert-True ($LASTEXITCODE -eq 1 -and ($statusOutput -join "`n") -match 'Repository override GIT_DIR') 'Refuse Git repository overrides.'
    } finally {
        if ($null -eq $previousGitDir) { Remove-Item -LiteralPath Env:GIT_DIR -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable('GIT_DIR', $previousGitDir) }
    }
    $fakeRepo = Join-Path $fixture 'not-a-repository'
    [void][IO.Directory]::CreateDirectory((Join-Path $fakeRepo '.git'))
    $statusOutput = @(& pwsh -NoProfile -File $ScriptPath status $fakeRepo -CodexHome $fixture 2>&1)
    Assert-True ($LASTEXITCODE -eq 1 -and ($statusOutput -join "`n") -match 'different repository|Could not verify') 'An arbitrary .git directory is insufficient.'
    $shared = Join-Path $fixture 'shared.txt'
    [IO.File]::WriteAllText($shared, 'hard-link fixture', $utf8)
    Assert-SingleFileLink $shared
    $hardLink = Join-Path $fixture '.git/shared-link'
    $null = New-Item -ItemType HardLink -Path $hardLink -Target $shared
    Assert-Rejected { Assert-SingleFileLink $shared } 'Hard link or unverified'
    Assert-Rejected { Assert-SingleFileLink $hardLink } 'Hard link or unverified'
    $statusOutput = @(& pwsh -NoProfile -File $ScriptPath status $fixture -CodexHome $fixture 2>&1)
    Assert-True ($LASTEXITCODE -eq 1 -and ($statusOutput -join "`n") -match 'Hard link or unverified') (ConvertTo-PublicText "Refuse a .git file with a second name outside .git. Output: $($statusOutput -join ' ')")
    Remove-Item -LiteralPath $hardLink -Force
    Assert-SingleFileLink $shared
    Assert-Rejected { Assert-SingleFileLink (Join-Path $fixture 'missing-file') } 'Hard link or unverified'
    Assert-Rejected { Assert-SingleFileLink $fixture } 'Hard link or unverified'
    $longDirectory = $fixture
    1..7 | ForEach-Object { $longDirectory = Join-Path $longDirectory ('日本語-path-' + ('x' * 30)) }
    [void][IO.Directory]::CreateDirectory($longDirectory)
    $longFile = Join-Path $longDirectory 'metadata [1].txt'
    [IO.File]::WriteAllText($longFile, 'unchanged content', $utf8)
    Assert-True ($longFile.Length -gt 260) 'Exercise a Unicode path beyond MAX_PATH.'
    Assert-SingleFileLink $longFile
    Assert-SingleFileLink ('\\?\' + $longFile)
    Assert-True ([IO.File]::ReadAllText($longFile) -ceq 'unchanged content') 'Metadata inspection preserves file contents.'
    $junction = Join-Path $fixture '.git/junction-fixture'
    $null = New-Item -ItemType Junction -Path $junction -Target $longDirectory
    try {
        Assert-Rejected { Get-GitItems (Join-Path $fixture '.git') } 'Reparse point'
        Assert-Rejected { Assert-RegularPath (Join-Path $junction 'metadata [1].txt') } 'Reparse point'
    } finally {
        # Remove the junction itself without walking its target.
        Remove-Item -LiteralPath $junction -Force
    }
    $logDirectory = Join-Path $fixture 'failure-log'
    [void][IO.Directory]::CreateDirectory($logDirectory)
    Assert-Rejected { Stop-Repair $logDirectory 'original failure' @($shared) } 'original failure'
    $record = [IO.File]::ReadAllText((Join-Path $logDirectory 'failure.json')) | ConvertFrom-Json
    Assert-True ($record.error -ceq 'original failure' -and $record.changed.Count -eq 1) 'Failure record retains the original error and attempted paths.'
    try {
        Stop-Repair (Join-Path $fixture 'missing-log-directory') 'original failure' @($shared)
    } catch {
        $failureMessage = $_.Exception.Message
    }
    Assert-True ($failureMessage -like '*original failure*' -and $failureMessage -like '*missing-log-directory*' -and
        $failureMessage -like '*Failure record could not be saved*') 'A failed failure-log write preserves the original error and repair-record location.'
    $statusOutput = @(& pwsh -NoProfile -File $ScriptPath status (Join-Path $HOME 'missing-git-acl-review-path') 2>&1)
    $errorText = $statusOutput -join "`n"
    Assert-True ($LASTEXITCODE -eq 1 -and -not $errorText.Contains($HOME, [StringComparison]::OrdinalIgnoreCase)) 'Errors do not expose the home path.'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $fixture '.codex'))) 'Status creates no backup directory.'
    Assert-True (-not ([IO.File]::ReadAllText($capPath).Contains("`r"))) 'JSON diagnostics use LF.'
} finally {
    $resolvedFixture = [IO.Path]::GetFullPath($fixture)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolvedFixture.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($resolvedFixture) -notlike 'git-acl-review-*') { throw 'Unexpected cleanup target.' }
    Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
}
Write-Host 'PASS: parsing, in-memory DACL-only planning and preservation, null/empty/non-canonical refusal, full-tree comparisons, Git/path/link checks, redaction, failure records, and read-only status. No filesystem ACLs changed.'
