# dsh-alist 本地安装 / 卸载脚本（Windows PowerShell）
#
# 背景：DSH Desktop 自带的 CLI 不在 PATH 里，且默认 DSH_HOME 指向 %USERPROFILE%\.dsh，
# 而桌面端实际用的是 harness 目录。直接敲 `dsh plugin add` 会失败或改错 profile。
# 本脚本负责把这三件事做对：DSH_HOME、pnpm shim 的 PATH、内置 Node 位置。
#
# 用法（不会自动执行，需要你手动跑）：
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-local.ps1            # 本地 link 安装
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-local.ps1 -Uninstall # 卸载
# 装完记得重启 DSH Desktop（或在设置页重启 profile）。

param(
    [switch]$Uninstall,
    [string]$Profile = "web",
    [string]$PackageName = "dsh-alist"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$dshHome = Join-Path $env:APPDATA "dsh-desktop\harness"
# 注意：打包后磁盘上只有 app.asar（+ app.asar.unpacked）。asar 内部路径只有 Electron 能读，
# PowerShell / 系统 node 访问不到，所以 CLI 与 node 必须从 app.asar.unpacked 取。
$resources = "C:\Program Files\DSH Desktop\resources"
$appRoot = @(
    (Join-Path $resources "app.asar.unpacked"),
    (Join-Path $resources "app")
) | Where-Object { Test-Path $_ } | Select-Object -First 1
$nodeExe = Join-Path $appRoot "node_modules\node\bin\node.exe"
$dshBin = Join-Path $appRoot "node_modules\@deepseek-ai\dsh\lib\bin.js"
$binShim = Join-Path $dshHome ".desktop-bin"

foreach ($required in @($dshHome, $appRoot, $nodeExe, $dshBin, $binShim)) {
    if (-not (Test-Path $required)) {
        Write-Error "Missing prerequisite: $required`nIs DSH Desktop installed and has it run at least once?"
    }
}

$env:DSH_HOME = $dshHome
$env:PATH = "$env:PATH;$binShim"

function Invoke-Dsh {
    param([string[]]$Arguments)
    Write-Host "> dsh $($Arguments -join ' ')" -ForegroundColor Cyan
    & $nodeExe $dshBin @Arguments
    if ($LASTEXITCODE -ne 0) { Write-Error "dsh exited with code $LASTEXITCODE" }
}

if ($Uninstall) {
    Write-Host "Removing $PackageName from profile '$Profile'..." -ForegroundColor Yellow
    Invoke-Dsh @("plugin", "--profile", $Profile, "remove", $PackageName)
    Write-Host "Removed. Restart DSH Desktop to unload it." -ForegroundColor Green
    exit 0
}

Write-Host "Installing $PackageName from $repoRoot into profile '$Profile'..." -ForegroundColor Yellow
Invoke-Dsh @("plugin", "--profile", $Profile, "add", "link:$repoRoot")
Write-Host @"

Done. Next steps:
  1. Restart DSH Desktop (or restart the '$Profile' profile).
  2. Settings -> Plugins -> AList file control: fill in Base URL, username, auth mode and password/token.
  3. Ask in chat: 'list the AList root directory'.
"@ -ForegroundColor Green
