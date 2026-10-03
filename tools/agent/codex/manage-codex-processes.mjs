#!/usr/bin/env node
// @ai-dotfiles agent-dev-runtime managed

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export class ProcessError extends Error {}
const fail = message => { throw new ProcessError(message); };
const HELP = `Inspect or explicitly close local Codex/ChatGPT processes (Windows, PowerShell 7).
Usage: agent codex process <status|close|stop|help>
  status [--json]       Read-only: names, PIDs, parents, and why maintenance is blocked.
  close [--pid NUMBER]  Confirm a normal close request to desktop windows; never force.
  stop --pid NUMBER    Confirm force termination of one detected app/CLI process.
Close/stop require an external interactive terminal. Save work first.
Helpers/services and this command's ancestors cannot be stopped here.
Names alone do not establish whether a helper is writing history; unknown helpers still block deletion.
The reviewed registered sandbox provisioning service is listed separately. Its presence alone
does not block session maintenance; active descendants or unverified registration still block.
Stop may lose unsaved work. No process-tree kill, restart, elevation, or automatic retry.
After closing, run status again and keep clients closed until session maintenance completes.
No command lines, executable paths, or conversation contents are printed.
Exit codes: 0 no blockers/completed/cancelled, 1 failed, 2 invalid arguments, 3 blocking processes remain.`;

// The inventory and the session mutation guard use exactly the same classifier.
// Do not exempt unknown helpers on the assumption that they cannot write history.
// Reviewed: rust-v0.159.2/windows-sandbox-service/src/{service.rs,ipc/request.rs,provisioning.rs}
// and windows-sandbox-rs/src/service_identity.rs. This SCM broker registers installations
// and provisions sandbox accounts/permissions; it is not a session app server. Some setup
// runs in-process, so no descendants is an extra guard, not proof of complete inactivity.
const INVENTORY = String.raw`
$ErrorActionPreference='Stop'
$all=@(Get-CimInstance Win32_Process)
$services=@{}; foreach($service in @(Get-CimInstance Win32_Service)) {
  if($service.ProcessId -gt 0) {
    $key=[int]$service.ProcessId
    if(!$services.ContainsKey($key)) { $services[$key]=@() }
    $services[$key]+=,$service
  }
}
$parents=@{}; $children=@{}
foreach($item in $all) {
  $parents[[int]$item.ProcessId]=[int]$item.ParentProcessId
  $parent=[int]$item.ParentProcessId
  if(!$children.ContainsKey($parent)) { $children[$parent]=@() }
  $children[$parent]+=[int]$item.ProcessId
}
$ancestors=@{}; $current=[int]$env:AGENT_CODEX_PROCESS_CALLER
while($current -gt 0 -and !$ancestors.ContainsKey($current)) {
  $ancestors[$current]=$true; $current=$parents[$current]
}
$items=@(foreach($item in $all) {
  $nodeCli=$item.Name -match '^node(\.exe)?$' -and $item.CommandLine -match '[/\\]codex[/\\]bin[/\\]codex\.js'
  if($item.Name -notmatch '^(codex|chatgpt)([.-]|$)' -and !$nodeCli) { continue }
  $role=if($services.ContainsKey([int]$item.ProcessId)){'service'}elseif($nodeCli){'cli'}elseif($item.Name -match '^(codex|chatgpt)(\.exe)?$'){'app-or-cli'}else{'helper-unverified'}
  $descendants=0
  if($role -eq 'service' -and $item.Name -ieq 'codex-windows-sandbox-service.exe') {
    $seen=@{}; $seen[[int]$item.ProcessId]=$true
    $pending=[System.Collections.Generic.Queue[int]]::new()
    $pending.Enqueue([int]$item.ProcessId)
    while($pending.Count -gt 0) {
      $parent=$pending.Dequeue()
      foreach($child in $children[$parent]) {
        if(!$seen.ContainsKey($child)) { $seen[$child]=$true; $descendants++; $pending.Enqueue($child) }
      }
    }
    $registration=@($services[[int]$item.ProcessId])
    if($registration.Count -eq 1 -and $registration[0].State -eq 'Running' -and $registration[0].Name -match '^CodexSandboxService(?:\.OpenAI\.[a-zA-Z0-9.-]+)?$') {
      $binaryMatch=[regex]::Match($registration[0].PathName, '^(?:"(?<exe>[^"]+)"|(?<exe>.+?\.exe))(?:\s.*)?$', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
      if($binaryMatch.Success -and [System.IO.Path]::IsPathFullyQualified($binaryMatch.Groups['exe'].Value) -and [System.IO.Path]::GetFileName($binaryMatch.Groups['exe'].Value) -ieq $item.Name) {
        # SCM binds its registered image to this PID. Non-admin CIM may omit the image
        # path of LocalSystem processes; if available, also check the full image path.
        if(!$item.ExecutablePath -or [System.String]::Equals([System.IO.Path]::GetFullPath($binaryMatch.Groups['exe'].Value), [System.IO.Path]::GetFullPath($item.ExecutablePath), [System.StringComparison]::OrdinalIgnoreCase)) {
          $role='sandbox-provisioning-service'
        }
      }
    }
  }
  $window=$false; $started=$null
  try {
    $proc=Get-Process -Id $item.ProcessId -ErrorAction Stop
    $started=$proc.StartTime.ToUniversalTime().ToString('o')
    $window=$proc.MainWindowHandle -ne 0
  } catch {}
  [pscustomobject]@{ name=$item.Name; pid=[int]$item.ProcessId; parentPid=[int]$item.ParentProcessId;
    created=$item.CreationDate.ToUniversalTime().ToString('o'); role=$role; window=$window;
    hosted=$ancestors.ContainsKey([int]$item.ProcessId); started=$started; descendants=$descendants }
})
ConvertTo-Json -InputObject ([pscustomobject]@{processes=$items}) -Compress -Depth 4
`;

function powershell(script, { spawn = spawnSync, env = {}, timeout = 15000 } = {}) {
  // Native diagnostics can include executable paths. Return only fixed error categories.
  const wrapped = `$ErrorActionPreference='Stop'; try {\n${script}\n} catch {
    $kind=if($_.Exception.Message -in @('Changed process identity','Changed process start time')){'process-changed'}
      elseif($_.Exception.Message -eq 'Selected process is a service'){'service-protected'}
      elseif($_.CategoryInfo.Category -eq 'PermissionDenied'){'access-denied'}else{'operation-failed'}
    ConvertTo-Json @{failure=$kind} -Compress
  }`;
  const result = spawn('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', wrapped], {
    encoding: 'utf8', timeout, windowsHide: true,
    env: { ...process.env, AGENT_CODEX_PROCESS_CALLER: String(process.pid), ...env },
  });
  if (result.status !== 0 || result.error) {
    if (result.error?.code === 'ETIMEDOUT') fail('Process inspection or shutdown timed out. Inspect status in an external terminal before proceeding; no automatic retry was attempted.');
    if (result.error?.code === 'ENOENT') fail('PowerShell 7 (pwsh) was not found on PATH. No process was stopped.');
    fail('Could not inspect or manage Codex processes. Check PowerShell 7 and process-information permissions in an external terminal; no automatic retry was attempted.');
  }
  let response;
  try { response = JSON.parse(result.stdout); }
  catch { fail('Process inspection returned an unsupported response; no automatic retry was attempted.'); }
  if (!response || typeof response !== 'object') fail('Process inspection returned an unsupported response.');
  if (response.failure) fail({
    'process-changed': 'The selected process changed before shutdown. No shutdown was attempted for that PID; inspect status again.',
    'service-protected': 'The selected process is now registered as a Windows service. No shutdown was attempted for that PID.',
    'access-denied': 'Access denied while inspecting or managing processes. Use an external terminal with permission to inspect the owning process; no automatic elevation or retry was attempted.',
    'operation-failed': 'Process inspection or shutdown failed. The process may have exited or become inaccessible; inspect status in an external terminal before proceeding.',
  }[response.failure] ?? 'Process inspection returned an unsupported failure response.');
  return response;
}

export function inspectProcesses({ platform = process.platform, spawn = spawnSync } = {}) {
  if (platform !== 'win32') fail('Process inspection and shutdown currently require Windows and PowerShell 7.');
  const response = powershell(INVENTORY, { spawn });
  if (!Array.isArray(response.processes) || response.processes.some(item =>
    !/^(?:codex|chatgpt)(?:[.-][a-z0-9_.-]+)?$|^node(?:\.exe)?$/i.test(item.name ?? '') ||
    !Number.isSafeInteger(item.pid) || item.pid <= 0 || !Number.isSafeInteger(item.parentPid) || item.parentPid < 0 ||
    typeof item.created !== 'string' || !Number.isFinite(Date.parse(item.created)) ||
    !['cli', 'app-or-cli', 'helper-unverified', 'service', 'sandbox-provisioning-service'].includes(item.role) ||
    (item.role === 'sandbox-provisioning-service' && item.name.toLowerCase() !== 'codex-windows-sandbox-service.exe') ||
    !Number.isSafeInteger(item.descendants) || item.descendants < 0 ||
    typeof item.window !== 'boolean' || typeof item.hosted !== 'boolean' ||
    !(item.started === null || (typeof item.started === 'string' && Number.isFinite(Date.parse(item.started)))))) fail('Process inspection returned unsupported process metadata.');
  return response.processes.sort((a, b) => a.pid - b.pid);
}

export function processDescription(item) {
  return `${item.name} PID ${item.pid} (parent ${item.parentPid}; ${item.role}${item.hosted ? '; hosts this command' : ''}; ${item.window ? 'desktop window' : 'no desktop window'}${item.role === 'sandbox-provisioning-service' || item.descendants ? `; descendants ${item.descendants}` : ''}; ${blocksMaintenance(item) ? 'blocks maintenance' : 'not a session client; non-blocking'})`;
}

export const blocksMaintenance = item => !(item.role === 'sandbox-provisioning-service' && item.descendants === 0 && !item.hosted && !item.window);

export function assertClientsClosed(options = {}) {
  const items = inspectProcesses(options).filter(blocksMaintenance);
  if (items.length) fail(`Close Codex/ChatGPT, CLI sessions, IDE integrations, and background writers first. Detected ${items.length}:\n${items.map(processDescription).join('\n')}\nRun agent codex process status in an external terminal. Unknown helpers remain blockers; they are not automatically stopped.`);
}

const sameProcess = (a, b) => a.pid === b.pid && a.created === b.created && a.started === b.started && a.name === b.name && a.parentPid === b.parentPid;
const canStop = item => !item.hosted && ['cli', 'app-or-cli'].includes(item.role) && item.started !== null;

function operate(item, action, spawn) {
  // Recheck identity in the PowerShell process immediately before acting. Use a Process
  // object and its StartTime for the action rather than a second PID lookup for Kill.
  const result = powershell(String.raw`
$ErrorActionPreference='Stop'
$target=ConvertFrom-Json $env:AGENT_CODEX_PROCESS_TARGET
$item=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$target.pid)
if(!$item) { ConvertTo-Json @{state='absent'} -Compress; exit 0 }
if($item.Name -cne $target.name -or $item.CreationDate.ToUniversalTime().ToString('o') -cne $target.created -or [int]$item.ParentProcessId -ne $target.parentPid) { throw 'Changed process identity' }
$service=@(Get-CimInstance Win32_Service | Where-Object { $_.ProcessId -eq [int]$target.pid })
if($service.Count -gt 0) { throw 'Selected process is a service' }
$proc=Get-Process -Id $target.pid -ErrorAction Stop
$null=$proc.SafeHandle
if($proc.StartTime.ToUniversalTime().ToString('o') -cne $target.started) { throw 'Changed process start time' }
if($env:AGENT_CODEX_PROCESS_ACTION -eq 'close') {
  $sent=$proc.CloseMainWindow()
  if($sent) { $exited=$proc.WaitForExit(5000); $state=if($exited){'exited'}else{'close-requested'} }
  else { $state='close-not-sent' }
} else { $proc.Kill(); $exited=$proc.WaitForExit(5000); $state=if($exited){'exited'}else{'stop-pending'} }
ConvertTo-Json @{state=$state} -Compress
`, { spawn, timeout: 15000, env: { AGENT_CODEX_PROCESS_TARGET: JSON.stringify(item), AGENT_CODEX_PROCESS_ACTION: action } });
  if (!['absent', 'exited', 'close-requested', 'close-not-sent', 'stop-pending'].includes(result.state)) fail('Process operation returned an unsupported response; inspect status before proceeding.');
  return result.state;
}

async function askTerminal(prompt) {
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try { return await reader.question(prompt); } finally { reader.close(); }
}

export async function runProcesses(args, {
  platform = process.platform, spawn = spawnSync, log = console.log, ask = askTerminal,
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY), inspect = () => inspectProcesses({ platform, spawn }),
} = {}) {
  let acted = false;
  try {
    if (!args.length || (args.length === 1 && ['help', '--help', '-h'].includes(args[0]))) { log(HELP); return 0; }
    const [action, ...rest] = args;
    let pid = null, json = false;
    if (!['status', 'close', 'stop'].includes(action)) { log('Use agent codex process help.'); return 2; }
    if (action === 'status' && rest.length === 1 && rest[0] === '--json') json = true;
    else if (action !== 'status' && rest.length === 2 && rest[0] === '--pid' && /^[1-9]\d*$/.test(rest[1]) && Number.isSafeInteger(Number(rest[1]))) pid = Number(rest[1]);
    else if (rest.length || action === 'stop') { log('Use status [--json], close [--pid NUMBER], or stop --pid NUMBER.'); return 2; }
    if (action !== 'status' && !interactive) fail('Process shutdown requires an external interactive terminal and explicit confirmation.');
    const items = inspect();
    const blockers = items.filter(blocksMaintenance);
    if (json) { log(JSON.stringify({ clear: blockers.length === 0, blockers: blockers.length, processes: items.map(item => ({ ...item, blocking: blocksMaintenance(item) })) })); return blockers.length ? 3 : 0; }
    if (!items.length) { log('No matching Codex/ChatGPT processes detected.'); return 0; }
    log(`Detected processes: ${items.length}; blocking processes: ${blockers.length}. ${blockers.length ? 'Session archive/delete remain blocked.' : 'No blocking session clients detected; the provisioning service can remain running.'}`);
    items.forEach(item => log(processDescription(item)));
    if (action === 'status') return blockers.length ? 3 : 0;
    if (action === 'close' && !pid && !blockers.length) { log('No session-client windows need closing. The provisioning service is kept running.'); return 0; }
    const selected = pid ? items.filter(item => item.pid === pid) : items.filter(item => canStop(item) && item.window);
    if (pid && !selected.length) fail('The requested PID is not a detected Codex/ChatGPT process.');
    if (selected.some(item => !canStop(item))) fail('The selected PID is a helper/service, hosts this command, or has unavailable identity information. It cannot be stopped here. Use the owning app or IDE to exit, then inspect status again.');
    if (!selected.length || (action === 'close' && selected.some(item => !item.window))) fail('No eligible desktop window to close. Inspect the blocking process roles in status. Services/helpers cannot be stopped by close or stop; only identified app/CLI PIDs can be explicitly stopped.');
    log(`${action === 'close' ? 'Request normal window closure' : 'Force termination; unsaved work may be lost'}: ${selected.map(item => `${item.name} PID ${item.pid}`).join(', ')}.`);
    const confirmation = `${action.toUpperCase()} ${pid ?? selected.map(item => item.pid).join(',')}`;
    if ((await ask(`Type ${confirmation} to continue (Enter cancels): `))?.trim() !== confirmation) { log('Cancelled; nothing changed.'); return 0; }
    const fresh = inspect();
    for (const item of selected) {
      const current = fresh.find(value => value.pid === item.pid);
      if (!current) { log(`PID ${item.pid}: already exited.`); continue; }
      if (!sameProcess(item, current) || !canStop(current)) fail('A selected process changed while awaiting confirmation; review status again.');
      acted = true;
      log(`PID ${item.pid}: ${operate(current, action, spawn)}.`);
    }
    const remaining = inspect();
    const remainingBlockers = remaining.filter(blocksMaintenance);
    log(`Remaining detected processes: ${remaining.length}; blocking processes: ${remainingBlockers.length}.`);
    remaining.forEach(item => log(processDescription(item)));
    return remainingBlockers.length ? 3 : 0;
  } catch (error) {
    log(`Error: ${error instanceof ProcessError ? error.message : 'Process operation failed; inspect status in an external terminal.'}`);
    if (acted) log('Some close/stop requests may have completed. Inspect status before another operation.');
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await runProcesses(process.argv.slice(2));
