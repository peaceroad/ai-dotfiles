#Requires -Version 7.0
<#
Run the evaluation suite and, on EPERM during rename, compare a fresh temp location.
Logs stay outside the repository. Existing files are never moved or deleted.
The exit code preserves the first failure even if the comparison run succeeds.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$npmCommand = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
if (-not $env:LOCALAPPDATA) {
    throw 'LOCALAPPDATA is required to store diagnostic logs outside the repository.'
}

$diagnosticRoot = Join-Path $env:LOCALAPPDATA ('ai-dotfiles-eval-check/' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $diagnosticRoot | Out-Null
$baselineLog = Join-Path $diagnosticRoot 'baseline.log'
$comparisonLog = Join-Path $diagnosticRoot 'alternate-temp.log'
$summaryPath = Join-Path $diagnosticRoot 'summary.txt'
$previousEvalTemp = $env:TEMP
$previousEvalTmp = $env:TMP
$summary = [System.Collections.Generic.List[string]]::new()
$diagnosticExitCode = 1

function Invoke-EvaluationCheck {
    param([string]$LogPath)

    & $npmCommand run check:eval-tools 2>&1 |
        Tee-Object -FilePath $LogPath |
        ForEach-Object { Write-Host $_ }
    return $LASTEXITCODE
}

Write-Host "Diagnostic folder: $diagnosticRoot"
Push-Location -LiteralPath $repositoryRoot
try {
    Write-Host 'Running with the current temporary directory...'
    $baselineExitCode = Invoke-EvaluationCheck -LogPath $baselineLog
    $diagnosticExitCode = $baselineExitCode
    $summary.Add("Baseline exit code: $baselineExitCode")

    if ($baselineExitCode -eq 0) {
        $summary.Add('This run passed. An intermittent failure is not ruled out.')
    }
    elseif (Select-String -LiteralPath $baselineLog -Pattern '\bEPERM\b.*\brename\b' -Quiet) {
        $alternateTemp = Join-Path $diagnosticRoot 'temp'
        New-Item -ItemType Directory -Path $alternateTemp | Out-Null
        $env:TEMP = $alternateTemp
        $env:TMP = $alternateTemp

        Write-Host 'EPERM during rename detected. Comparing a fresh temporary directory...'
        $comparisonExitCode = Invoke-EvaluationCheck -LogPath $comparisonLog
        $summary.Add("Alternate-temp exit code: $comparisonExitCode")
        if ($comparisonExitCode -eq 0) {
            $summary.Add('The comparison passed. Location dependence or an intermittent failure remains possible.')
        }
        else {
            $summary.Add('The comparison also failed. Inspect both logs; the causes may differ.')
        }
        $summary.Add('The script retains the baseline failure exit code; this is not an all-pass result.')
    }
    else {
        $summary.Add('No EPERM during rename was found. No alternate-temp run was attempted.')
    }
}
catch {
    $diagnosticExitCode = 1
    $summary.Add("Diagnostic execution error: $($_.Exception.Message)")
}
finally {
    $env:TEMP = $previousEvalTemp
    $env:TMP = $previousEvalTmp
    Pop-Location
    $summary | Set-Content -LiteralPath $summaryPath -Encoding utf8
    $summary | ForEach-Object { Write-Host $_ }
    Write-Host "Results: $summaryPath"
    Write-Host 'Keep these local logs for diagnosis. They may contain private paths.'
}

exit $diagnosticExitCode
