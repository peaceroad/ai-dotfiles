#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Position=0)][string]$Mode = 'help',
    [Parameter(Position=1)][string]$Repo,
    [string]$CodexHome = $(if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' })
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$utf8 = [Text.UTF8Encoding]::new($false)
$inspectionStarted = $false
$inspectionCompleted = $false
function ConvertTo-PublicText([string]$Text) {
    foreach ($root in @($HOME, $env:USERPROFILE) | Where-Object { $_ } | Sort-Object -Unique | Sort-Object Length -Descending) {
        foreach ($variant in @($root, $root.Replace('\', '/'))) {
            $Text = $Text.Replace($variant, '~', [StringComparison]::OrdinalIgnoreCase)
        }
    }
    if ($env:USERNAME) { $Text = $Text.Replace($env:USERNAME, '<user>', [StringComparison]::OrdinalIgnoreCase) }
    return $Text
}
function Write-Json($Path, $Value) {
    [IO.File]::WriteAllText($Path, (($Value | ConvertTo-Json -Depth 10) -replace "`r`n", "`n") + "`n", $utf8)
}
function Normalize-PathKey([string]$Path) {
    $p = $Path -replace '/', '\'
    if ($p.StartsWith('\\?\')) { $p = $p.Substring(4) }
    return [IO.Path]::GetFullPath($p).TrimEnd('\').ToLowerInvariant()
}
function Assert-RegularPath([string]$Path) {
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        $item = Get-Item -LiteralPath $cursor -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse point: $cursor" }
        $parent = [IO.Directory]::GetParent($cursor)
        if ($null -eq $parent) { break }
        $cursor = $parent.FullName
    }
}
function Assert-SingleFileLink([string]$Path) {
    # Compile once per process instead of launching fsutil for each file.
    # This helper only opens existing files for metadata; it cannot write ACLs.
    if (-not ('CodexGitAcl.LinkInspector' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace CodexGitAcl {
    public static class LinkInspector {
        [StructLayout(LayoutKind.Sequential)]
        private struct FileInformation {
            public uint Attributes;
            public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written;
            public uint VolumeSerial, SizeHigh, SizeLow, LinkCount, IndexHigh, IndexLow;
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
        private static extern SafeFileHandle CreateFileW(string path, uint access, uint share,
            IntPtr security, uint disposition, uint flags, IntPtr template);
        [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileInformation info);
        public static uint CountLinks(string path) {
            path = Path.GetFullPath(path);
            if (!path.StartsWith(@"\\?\")) path = @"\\?\" + path;
            // Access=0, share=read/write/delete, OPEN_EXISTING, OPEN_REPARSE_POINT.
            // A directory or an inaccessible file fails instead of being assumed safe.
            using (var handle = CreateFileW(path, 0, 7, IntPtr.Zero, 3, 0x00200000, IntPtr.Zero)) {
                if (handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
                FileInformation info;
                if (!GetFileInformationByHandle(handle, out info))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                if ((info.Attributes & 0x410) != 0) throw new IOException("Not a regular file.");
                return info.LinkCount;
            }
        }
    }
}
'@
    }
    try { $linkCount = [CodexGitAcl.LinkInspector]::CountLinks($Path) }
    catch { throw "Hard link or unverified file link count: $Path" }
    if ($linkCount -ne 1) {
        throw "Hard link or unverified file link count: $Path"
    }
}
function Assert-Repository([string]$Root, [string]$GitDirectory) {
    $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($Root))
    if ($drive.DriveType -notin @([IO.DriveType]::Fixed, [IO.DriveType]::Removable) -or $drive.DriveFormat -ne 'NTFS') {
        throw 'Only local NTFS repositories are supported.'
    }
    foreach ($name in @('GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
                        'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE')) {
        if ($null -ne [Environment]::GetEnvironmentVariable($name)) {
            throw "Repository override $name is set; use a terminal without Git repository overrides."
        }
    }
    $paths = @(& git -C $Root rev-parse --path-format=absolute --show-toplevel --absolute-git-dir --git-common-dir 2>&1)
    if ($LASTEXITCODE -ne 0 -or $paths.Count -ne 3) { throw 'Could not verify a regular Git repository.' }
    if ((Normalize-PathKey ([string]$paths[0])) -cne (Normalize-PathKey $Root) -or
        (Normalize-PathKey ([string]$paths[1])) -cne (Normalize-PathKey $GitDirectory) -or
        (Normalize-PathKey ([string]$paths[2])) -cne (Normalize-PathKey $GitDirectory)) {
        throw 'Git resolved a different repository root or shared Git directory; refusing repair.'
    }
}
function Stop-Repair([string]$RecordDirectory, [string]$Failure, $Changed) {
    $recordError = ''
    try {
        Write-Json (Join-Path $RecordDirectory 'failure.json') ([ordered]@{ error = $Failure; changed = @($Changed) })
    } catch {
        $recordError = " Failure record could not be saved: $($_.Exception.Message)"
    }
    throw "Repair stopped; inspect partial changes and repair records at $RecordDirectory. $Failure$recordError"
}
function Assert-ExternalSession {
    if ([Security.Principal.WindowsIdentity]::GetCurrent().Name -match 'CodexSandbox') {
        throw 'Use an ordinary terminal as your normal Windows user, outside Codex.'
    }
    $running = @(Get-Process | Where-Object { $_.ProcessName -match '^(codex($|[-.])|ChatGPT$)' })
    if ($running.Count) { throw 'Fully quit Codex/ChatGPT and their CLI/IDE sessions first.' }
}
function Get-Rules($Acl, [switch]$IncludeInherited) {
    # Inspect write-like candidates, including permission/ownership rights so
    # unsupported security changes are refused rather than silently ignored.
    foreach ($rule in $Acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        if ($script:sids -contains $rule.IdentityReference.Value -and
            $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Deny -and
            (([long]$rule.FileSystemRights -band 0x500D0156) -ne 0)) {
            if ($rule.IsInherited -and -not $IncludeInherited) { throw 'Matching inherited Deny; inspect its parent manually.' }
            # Codex 0.153.4 acl.rs DenyAceKind::Write includes ReadPermissions and
            # Synchronize through FILE_GENERIC_WRITE, with/without GENERIC_WRITE.
            # Accept those complete known masks; reject other mixed read/execute ACEs.
            $knownCodexMask = [long]$rule.FileSystemRights -in @(0x130156, 0x40130156)
            # Other accepted masks may contain only data/attribute writes and delete.
            # WRITE_DAC and WRITE_OWNER are not part of Codex's known write Deny.
            if (-not $knownCodexMask -and ([long]$rule.FileSystemRights -band (-bnot [long]0x10156)) -ne 0) {
                throw 'Matching Deny includes rights outside the supported write mask; inspect it manually.'
            }
            $rule
        }
    }
}
function Get-SddlWithoutInheritedRules($Acl, $Rules) {
    $raw = [Security.AccessControl.RawSecurityDescriptor]::new($Acl.GetSecurityDescriptorBinaryForm(), 0)
    $removed = 0
    for ($index = $raw.DiscretionaryAcl.Count - 1; $index -ge 0; $index--) {
        $ace = $raw.DiscretionaryAcl[$index]
        if ($ace -is [Security.AccessControl.CommonAce] -and
            $ace.AceQualifier -eq [Security.AccessControl.AceQualifier]::AccessDenied -and
            ($ace.AceFlags -band [Security.AccessControl.AceFlags]::Inherited) -and
            $script:sids -contains $ace.SecurityIdentifier.Value -and
            (([long]$ace.AccessMask -band 0x500D0156) -ne 0)) {
            $raw.DiscretionaryAcl.RemoveAce($index)
            $removed++
        }
    }
    if ($removed -ne @($Rules).Count) { throw 'Could not model inherited Deny removal exactly.' }
    if ($null -eq $raw.DiscretionaryAcl -or $raw.DiscretionaryAcl.Count -eq 0) {
        throw 'Repair would produce a null or empty DACL; inspect it manually.'
    }
    return $raw.GetSddlForm([Security.AccessControl.AccessControlSections]::Access)
}
function New-DaclUpdate([Security.AccessControl.FileSystemSecurity]$Acl) {
    if (-not $Acl.AreAccessRulesCanonical) { throw 'Non-canonical DACL; inspect it manually.' }
    $binary = $Acl.GetSecurityDescriptorBinaryForm()
    $raw = [Security.AccessControl.RawSecurityDescriptor]::new($binary, 0)
    if ($null -eq $raw.DiscretionaryAcl -or $raw.DiscretionaryAcl.Count -eq 0) {
        throw 'Null or empty DACL is unsupported.'
    }
    if ($Acl -is [Security.AccessControl.DirectorySecurity]) { $update = [Security.AccessControl.DirectorySecurity]::new() }
    else { $update = [Security.AccessControl.FileSecurity]::new() }
    # Copy only Access. Owner, Group and Audit are never marked for persistence.
    # SetAccessControl persists changed sections; Set-Acl first attempts all sections.
    $update.SetSecurityDescriptorBinaryForm($binary, [Security.AccessControl.AccessControlSections]::Access)
    foreach ($rule in @(Get-Rules $update)) { $update.RemoveAccessRuleSpecific($rule) }
    if (@(Get-Rules $update).Count) { throw 'Matching Deny remains after preparing DACL.' }
    $result = [Security.AccessControl.RawSecurityDescriptor]::new($update.GetSecurityDescriptorBinaryForm(), 0)
    if ($null -eq $result.DiscretionaryAcl -or $result.DiscretionaryAcl.Count -eq 0) {
        throw 'Repair would produce a null or empty DACL; inspect it manually.'
    }
    return $update
}
function Get-GitItems([string]$GitDirectory) {
    Assert-RegularPath $GitDirectory
    $root = Get-Item -LiteralPath $GitDirectory -Force
    if (-not $root.PSIsContainer) { throw 'Linked worktrees are unsupported.' }
    $queue = [Collections.Generic.Queue[string]]::new()
    $root
    $queue.Enqueue($GitDirectory)
    while ($queue.Count) {
        foreach ($item in Get-ChildItem -LiteralPath $queue.Dequeue() -Force) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse point: $($item.FullName)" }
            if (-not $item.PSIsContainer) { Assert-SingleFileLink $item.FullName }
            $item
            if ($item.PSIsContainer) { $queue.Enqueue($item.FullName) }
        }
    }
}
function Get-AclRecord($Item, $Acl) {
    return [ordered]@{
        path = $Item.FullName
        isDirectory = [bool]$Item.PSIsContainer
        sddl = $Acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
        owner = $Acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
        group = $Acl.GetGroup([Security.Principal.SecurityIdentifier]).Value
    }
}
function Get-GitAclSnapshot([string]$GitDirectory) {
    foreach ($item in @(Get-GitItems $GitDirectory)) {
        Get-AclRecord $item (Get-Acl -LiteralPath $item.FullName)
    }
}
function Assert-AclSnapshot($Actual, $Expected) {
    if (@($Actual).Count -ne @($Expected).Count) { throw 'Git directory contents changed since inspection.' }
    $byPath = [Collections.Generic.Dictionary[string,object]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $Expected) { $byPath.Add($entry.path, $entry) }
    foreach ($entry in $Actual) {
        if (-not $byPath.ContainsKey($entry.path)) { throw "Unexpected or duplicate path: $($entry.path)" }
        $planned = $byPath[$entry.path]
        foreach ($field in @('isDirectory', 'sddl', 'owner', 'group')) {
            if ($entry[$field] -cne $planned[$field]) { throw "Unexpected $field change: $($entry.path)" }
        }
        [void]$byPath.Remove($entry.path)
    }
}
if ($Mode -eq 'help') {
    Write-Host @"
Inspect or repair Codex Git deny-write ACLs on Windows.

Usage: ./manage-git-write-acl.ps1 <status|repair> [-Repo] <repository-root> [-CodexHome <directory>]
       ./manage-git-write-acl.ps1 help

status: Read ACLs and match explicit write-denial entries against Codex cap_sid.
repair: Back up DACLs, then remove only matching entries after interactive y confirmation.
Requires Windows, PowerShell 7, Git, and a local NTFS repository.
File link counts are queried through the Windows API; no external ACL utility is required.
Repair must run as the normal Windows user, with Codex/ChatGPT and CLI/IDE sessions closed.
Keep the repository idle throughout inspection and repair; concurrent file replacement is unsupported.
Enable the intended .git write permission in Codex first. This script does not edit permissions config.
Only regular .git directories are supported; linked worktrees, reparse points, and hard links are refused.
Inherited Deny is accepted only when it comes from a matching inheritable entry directly on .git.
Unknown Deny masks that also restrict other rights (including WRITE_DAC/WRITE_OWNER) are refused.
Git repository overrides in environment variables are refused. Use your own trusted cap_sid file.
Known Codex write-denial masks include ReadPermissions and Synchronize; whole matching entries are removed.
Only the DACL is submitted for update; owner, group and audit sections are excluded.
Null/empty results and non-canonical target DACLs are refused.
The complete inspected tree, including unchanged paths, is checked before and after updates.
Git contents, unrelated ACL entries, config.toml, and cap_sid are preserved.
Repair records: <repo>/.codex/git-acl-repair-records/<timestamp>-<short-id>/ . Exclude /.codex/ from Git.
Experimental: repair has completed and verified on an affected repository; restoration and durable prevention remain unvalidated.
There is no automatic rollback. A failure may leave partial ACL changes.
Restart Codex after repair and verify writes and whether Deny entries return.
Exit codes: 0 success/cancelled; 1 failure.
"@
    return
}
try {
    if ($Mode -notin @('status', 'repair')) { throw 'Mode must be status, repair, or help.' }
    if (-not $IsWindows) { throw 'Windows is required.' }
    if ([string]::IsNullOrWhiteSpace($Repo)) { throw 'Repository path is required (second positional argument or -Repo).' }
    $Repo = (Resolve-Path -LiteralPath $Repo).ProviderPath
    $gitPath = Join-Path $Repo '.git'
    # This also checks the repository and all its ancestors.
    Assert-RegularPath $gitPath
    if (-not (Get-Item -LiteralPath $gitPath -Force).PSIsContainer) { throw 'Linked worktrees are unsupported.' }
    Assert-Repository $Repo $gitPath
    $CodexHome = (Resolve-Path -LiteralPath $CodexHome).ProviderPath
    $capPath = Join-Path $CodexHome 'cap_sid'
    $caps = [IO.File]::ReadAllText($capPath) | ConvertFrom-Json
    $pathKeys = @((Normalize-PathKey $Repo), (Normalize-PathKey $gitPath))
    $script:sids = @()
    foreach ($mapName in @('workspace_by_cwd','writable_root_by_path')) {
        $map = $caps.PSObject.Properties[$mapName]
        if ($null -eq $map) { continue }
        foreach ($entry in $map.Value.PSObject.Properties) {
            if (-not [IO.Path]::IsPathFullyQualified($entry.Name)) { throw 'cap_sid contains a non-absolute path mapping.' }
            if ((Normalize-PathKey $entry.Name) -in $pathKeys) {
                $sid = [Security.Principal.SecurityIdentifier]::new([string]$entry.Value)
                $script:sids += $sid.Value
            }
        }
    }
    $script:sids = @($script:sids | Sort-Object -Unique)
    if (-not $script:sids.Count) { throw 'No exact repository/.git SID mapping found in cap_sid. Refusing to guess.' }
    # Traverse one directory at a time, rejecting links before entering them.
    $targets = [Collections.Generic.List[object]]::new()
    $targetSummaries = [Collections.Generic.List[string]]::new()
    $allBefore = [Collections.Generic.List[object]]::new()
    $allExpected = [Collections.Generic.List[object]]::new()
    $rootPropagatingSids = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $inspectedPathCount = 0
    $explicitRuleCount = 0
    $inheritedRuleCount = 0
    $inheritedPathCount = 0
    $inspectionStarted = $true
    foreach ($item in @(Get-GitItems $gitPath)) {
        $inspectedPathCount++
        $acl = Get-Acl -LiteralPath $item.FullName
        if ($Mode -eq 'repair') {
            $beforeRecord = Get-AclRecord $item $acl
            $allBefore.Add($beforeRecord)
            $expectedRecord = $beforeRecord
        }
        try {
            $rules = @(Get-Rules $acl -IncludeInherited)
            $explicitRules = @($rules | Where-Object { -not $_.IsInherited })
            $inheritedRules = @($rules | Where-Object IsInherited)
            $explicitRuleCount += $explicitRules.Count
            $inheritedRuleCount += $inheritedRules.Count
            if ($inheritedRules.Count) { $inheritedPathCount++ }
            $isGitRoot = (Normalize-PathKey $item.FullName) -ceq (Normalize-PathKey $gitPath)
            if ($isGitRoot) {
                if ($inheritedRules.Count) { throw 'Matching Deny inherited from above .git; inspect its parent manually.' }
                foreach ($rule in $explicitRules) {
                    if (($rule.InheritanceFlags -band ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit)) -eq
                            ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit) -and
                        $rule.PropagationFlags -eq [Security.AccessControl.PropagationFlags]::InheritOnly) {
                        [void]$rootPropagatingSids.Add($rule.IdentityReference.Value)
                    }
                }
            }
            elseif ($explicitRules.Count -and $inheritedRules.Count) {
                throw 'Matching explicit Deny below .git is unsupported when validating inheritance.'
            }
            foreach ($rule in $inheritedRules) {
                if (-not $rootPropagatingSids.Contains($rule.IdentityReference.Value)) {
                    throw 'Matching inherited Deny is not covered by a corresponding inheritable entry on .git.'
                }
            }
            if ($explicitRules.Count) {
                $update = New-DaclUpdate $acl
                if ($Mode -eq 'repair') {
                    $expectedRecord = Get-AclRecord $item $acl
                    $expectedRecord.sddl = $update.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
                    $targets.Add($beforeRecord)
                }
                else { $targets.Add($item.FullName) }
                $targetSummaries.Add((ConvertTo-PublicText "Direct ACL update: $($item.FullName) ($($explicitRules.Count) matching Deny entries)"))
            }
            elseif ($Mode -eq 'repair' -and $inheritedRules.Count) {
                $expectedRecord = Get-AclRecord $item $acl
                $expectedRecord.sddl = Get-SddlWithoutInheritedRules $acl $inheritedRules
            }
        } catch { throw "$($item.FullName): $_" }
        if ($Mode -eq 'repair') { $allExpected.Add($expectedRecord) }
    }
    $inspectionCompleted = $true
    if ($targets.Count) {
        Write-Host 'ACL status: matching Codex deny-write entries found.'
        foreach ($summary in $targetSummaries) { Write-Host $summary }
        Write-Host "Paths requiring direct ACL update: $($targets.Count)"
        Write-Host "Explicit Deny entries: $explicitRuleCount"
        if ($inheritedRuleCount) {
            Write-Host "Inherited Deny entries expected to follow the parent update: $inheritedRuleCount across $inheritedPathCount descendant paths"
        }
    }
    else {
        Write-Host 'ACL status: clear. No matching Codex deny-write entries were found under .git.'
    }
    Write-Host "Capability SIDs checked: $($script:sids.Count)"
    Write-Host "Git paths inspected: $inspectedPathCount"
    if ($Mode -eq 'status') {
        Write-Host 'Status is read-only; no ACLs changed.'
        if ($targets.Count) { Write-Host 'Next step: if you need a diagnostic repair, review the recurrence limitation, fully quit Codex/ChatGPT, then run repair from an ordinary terminal.' }
        else { Write-Host 'No ACL repair is needed for the entries recognized by this script.' }
        return
    }
    if (-not $targets.Count) { Write-Host 'Repair result: no changes needed.'; return }
    Assert-ExternalSession
    if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) {
        throw 'Repair requires an interactive terminal.'
    }
    $answer = Read-Host 'Back up ACLs and remove the listed write-denial entries? [y/N]'
    if ($answer.Trim().ToLowerInvariant() -ne 'y') { Write-Host 'Repair result: cancelled; no ACLs changed.'; return }
    Assert-ExternalSession
    Assert-Repository $Repo $gitPath
    # Keep local diagnostics out of the repository's tracked files.
    $runId = '{0}-{1}' -f (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd_HHmmssZ'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
    foreach ($fileName in @('repair-plan.json', 'verification.json', 'failure.json')) {
        $null = & git -C $Repo check-ignore -q -- ".codex/git-acl-repair-records/$runId/$fileName" 2>&1
        if ($LASTEXITCODE -ne 0) { throw 'Exclude /.codex/ from Git before repair.' }
    }
    $gitOutput = @(& git -C $Repo ls-files -- .codex/git-acl-repair-records 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'Could not check tracked repair record files.' }
    if ($gitOutput.Count) { throw 'Repair record directory contains tracked files; remove them from tracking before repair.' }
    $local = Join-Path $Repo '.codex'
    if (Test-Path -LiteralPath $local) { Assert-RegularPath $local }
    $recordRoot = Join-Path $local 'git-acl-repair-records'
    if (Test-Path -LiteralPath $recordRoot) { Assert-RegularPath $recordRoot }
    $recordDirectory = Join-Path $recordRoot $runId
    [void][IO.Directory]::CreateDirectory($recordDirectory)
    Assert-RegularPath $recordDirectory
    Write-Json (Join-Path $recordDirectory 'repair-plan.json') ([ordered]@{
        schemaVersion = 2; repo = $Repo; sids = $script:sids; time = (Get-Date).ToString('o')
        acl = $allBefore; expectedAcl = $allExpected
    })
    Write-Host (ConvertTo-PublicText "Repair records: $recordDirectory")
    $changed = [Collections.Generic.List[string]]::new()
    try {
        # Parent DACL updates may propagate to descendants. Check the whole tree,
        # not just explicit targets, and compare against a plan made before writing.
        Assert-AclSnapshot @(Get-GitAclSnapshot $gitPath) $allBefore.ToArray()
        foreach ($target in $targets) {
            Assert-RegularPath $target.path
            $item = Get-Item -LiteralPath $target.path -Force
            if (-not $item.PSIsContainer) { Assert-SingleFileLink $target.path }
            $acl = Get-Acl -LiteralPath $target.path
            $expected = Get-AclRecord $item $acl
            Assert-AclSnapshot @($expected) @($target)
            $update = New-DaclUpdate $acl
            $expected.sddl = $update.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
            # Include a path even if persistence changes it and then reports an error.
            $changed.Add($target.path)
            [IO.FileSystemAclExtensions]::SetAccessControl($item, $update)
            $actual = Get-AclRecord (Get-Item -LiteralPath $target.path -Force) (Get-Acl -LiteralPath $target.path)
            Assert-AclSnapshot @($actual) @($expected)
        }
        $after = @(Get-GitAclSnapshot $gitPath)
        Write-Json (Join-Path $recordDirectory 'verification.json') $after
        Assert-AclSnapshot $after $allExpected.ToArray()
    } catch {
        Stop-Repair $recordDirectory $_.ToString() $changed.ToArray()
    }
    Write-Host 'Repair result: completed and verified.'
    Write-Host "Explicit Deny entries removed: $explicitRuleCount"
    if ($inheritedRuleCount) { Write-Host "Inherited Deny entries removed through propagation: $inheritedRuleCount" }
    Write-Host "Git paths verified against the repair plan: $($allExpected.Count)"
    Write-Host 'ACL status: clear for the matching entries found by this run.'
    Write-Host 'Restart Codex, run status again, and verify the Git operation that previously failed.'
    Write-Host 'Codex may add Deny entries again after restart or later operations; do not assume this repair prevents recurrence.'
} catch {
    if ($inspectionStarted -and -not $inspectionCompleted) {
        [Console]::Error.WriteLine('ACL status: not verified because inspection did not complete.')
    }
    [Console]::Error.WriteLine(('Error: ' + (ConvertTo-PublicText $_.Exception.Message)))
    exit 1
}
