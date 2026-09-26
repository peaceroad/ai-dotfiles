# @ai-dotfiles agent-dev-runtime managed
# Activate the registered application so Windows supplies its package identity.
param([Parameter(Mandatory = $true)][string]$LaunchArguments)
$ErrorActionPreference = 'Stop'
try {
    if (Get-Process -Name ChatGPT -ErrorAction SilentlyContinue) { exit 2 }
    $package = Get-AppxPackage -Name OpenAI.Codex |
        Sort-Object { [version]$_.Version } -Descending | Select-Object -First 1
    if (-not $package) { exit 3 }
    $manifest = Get-AppxPackageManifest -Package $package.PackageFullName
    $apps = @($manifest.Package.Applications.Application | Where-Object {
        ($_.Executable -replace '/', '\') -ieq 'app\ChatGPT.exe'
    })
    if ($apps.Count -ne 1) { exit 4 }
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace CodexAppLaunch {
    [ComImport, Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IApplicationActivationManager {
        [PreserveSig]
        int ActivateApplication(
            [MarshalAs(UnmanagedType.LPWStr)] string appId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments,
            uint options, out uint processId);
    }
    public static class Launcher {
        public static uint Activate(string appId, string arguments) {
            object instance = Activator.CreateInstance(Type.GetTypeFromCLSID(
                new Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")));
            try {
                uint processId;
                // AO_NONE: ordinary activation, no design or debugging mode.
                int result = ((IApplicationActivationManager)instance)
                    .ActivateApplication(appId, arguments, 0, out processId);
                Marshal.ThrowExceptionForHR(result);
                return processId;
            } finally { Marshal.ReleaseComObject(instance); }
        }
    }
}
'@
    $appId = $package.PackageFamilyName + '!' + $apps[0].Id
    $processId = [CodexAppLaunch.Launcher]::Activate($appId, $LaunchArguments)
    if (-not $processId) { exit 5 }
    [Console]::Out.Write($processId)
} catch {
    # Exceptions may contain private installation paths; report only a code.
    [Console]::Error.WriteLine('Packaged activation failed (HRESULT {0}).', $_.Exception.HResult)
    exit 1
}
