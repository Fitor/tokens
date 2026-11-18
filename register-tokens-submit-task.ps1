# register-tokens-submit-task.ps1 — 在已指向自建站的 Windows 机器上注册定时提交任务。
#
# 做的事：
#   1. 用 Get-Command 解析 tokens 的绝对路径并收敛为单一可执行路径（npm 在
#      Windows 会生成多个入口，与 pre-install-tokens.ps1 同一查找，不依赖计划
#      任务继承 PATH）；
#   2. 写常驻 runner（%LOCALAPPDATA%\tokens\tokens-submit.ps1）：内设
#      TOKENS_API_URL，再调绝对路径 submit；
#   3. 注册计划任务（默认每 30 分钟），任务不加载 PowerShell profile，所以
#      TOKENS_API_URL 必须写在 runner 里。
#
# 不做的事：不登录（device flow 必须用户本人授权）、不 logout——本脚本假设
# 你已按使用手册完成 preinstall + login，凭据直接复用。
#
# 用法（站点地址必须显式传，脚本没有默认域名）：
#   powershell -ExecutionPolicy Bypass -File register-tokens-submit-task.ps1 -Site https://tokens.example.com
#   可选：-IntervalMinutes 30（默认）/ -DryRun 先看后跑 / -Remove 卸载任务与 runner
# 本地联调可用 loopback：-Site http://localhost:3000
param(
    [string]$Site = $env:TOKENS_SITE,
    [int]$IntervalMinutes = 30,
    [switch]$DryRun,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$TaskName = 'TokensSubmit'
$RunnerDir = Join-Path $env:LOCALAPPDATA 'tokens'
$RunnerPath = Join-Path $RunnerDir 'tokens-submit.ps1'

if ($Remove) {
    if ($DryRun) {
        Write-Host "[dry-run] 将注销计划任务 $TaskName 并删除 $RunnerPath"
        exit 0
    }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    if (Test-Path $RunnerPath) { Remove-Item $RunnerPath -Force }
    Write-Host "✓ 已卸载 $TaskName 与 runner"
    exit 0
}

# --- 站点地址：与 pre-install-tokens.ps1 同款校验（纯 origin 或精确 loopback）。
if ([string]::IsNullOrWhiteSpace($Site)) {
    Write-Error "缺少站点地址。用法：powershell -ExecutionPolicy Bypass -File register-tokens-submit-task.ps1 -Site https://<线上域名>"
    exit 1
}
$Site = $Site.TrimEnd('/')
if ($Site -notmatch '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' -and $Site -notmatch '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?$') {
    Write-Error "站点地址只接受 https://<域名>[:端口]（本地联调仅 http://localhost / 127.0.0.1 / [::1]），收到：$Site"
    exit 1
}
if ($IntervalMinutes -lt 5) {
    Write-Error "-IntervalMinutes 不能小于 5，收到：$IntervalMinutes"
    exit 1
}

Write-Host "==> 目标站点：$Site（每 $IntervalMinutes 分钟提交一次）"

# --- 把 Get-Command 的多结果收敛为单一可执行路径（与 pre-install-tokens.ps1 同款） ---
# npm 在 Windows 上会生成多个入口（tokens.cmd、无扩展名 shim、tokens.ps1），
# Get-Command 一次返回多个结果；必须收敛为单一路径再写进 runner。
function Select-TokensCommand {
    param($Commands)
    $list = @($Commands)
    $picked = $list | Where-Object { $_.Name -like '*.cmd' } | Select-Object -First 1
    if ($picked) { return $picked }
    return $list[0]
}

$tokensCmd = Select-TokensCommand (Get-Command tokens -CommandType Application -ErrorAction SilentlyContinue)
if (-not $tokensCmd) {
    Write-Error "未找到 tokens CLI——先跑 pre-install-tokens.ps1"
    exit 1
}
Write-Host "✓ tokens CLI：$($tokensCmd.Source)"

# 路径会嵌进 runner 的单引号字符串：撇号（如 C:\Users\O'Brien）必须加倍转义。
$escapedTokensPath = $tokensCmd.Source.Replace("'", "''")
$runner = @"
`$env:TOKENS_API_URL = '$Site'
& '$escapedTokensPath' submit
"@

if ($DryRun) {
    Write-Host "[dry-run] 将写入 runner：$RunnerPath，内容："
    Write-Host $runner
    Write-Host "[dry-run] 将注册计划任务 $TaskName：powershell.exe -NoProfile -WindowStyle Hidden -File `"$RunnerPath`"，1 分钟后首跑、之后每 $IntervalMinutes 分钟，并立即手动触发一次"
    exit 0
}

New-Item -ItemType Directory -Force -Path $RunnerDir | Out-Null
Set-Content -Path $RunnerPath -Value $runner -Encoding UTF8
Write-Host "✓ 已写入 $RunnerPath"

# -Force：重跑幂等覆盖既有任务（换站点/改频率直接重跑即可）。
# 启动边界放在 1 分钟后（注册耗时会让 -At now 落进过去）；显式给 10 年
# RepetitionDuration，避免旧系统省略 duration 时的兼容差异。
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -File `"$RunnerPath`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Description "Submit AI usage to $Site" -Force | Out-Null
Write-Host "✓ 已注册计划任务 $TaskName（1 分钟后首跑，之后每 $IntervalMinutes 分钟）"
Start-ScheduledTask -TaskName $TaskName
Write-Host "==> 已手动触发一次——这只证明任务能启动；是否提交成功以任务历史记录和本站榜单为准"

# 凭据检查：没有凭据，任务跑了也只会 401。
$credPath = Join-Path $env:APPDATA 'tokens\credentials.json'
if (Test-Path $credPath) {
    Write-Host "✓ 找到登录凭据"
} else {
    Write-Host "==> 未找到登录凭据（$credPath）——任务已注册，但请先重开 PowerShell 跑 tokens login，否则提交会 401"
}
Write-Host "✓ 完成。验证：任务计划程序 → $TaskName → 历史记录；或直接看本站榜单。"
