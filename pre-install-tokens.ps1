# pre-install-tokens.ps1 — 把用户的 tokens CLI 预装并指向自建站（Windows）。
#
# 做三件事：
#   1. 检测 tokens CLI，没装则用 npm 全局安装（@fitor/tokens-cli 包）；
#   2. tokens logout（无论当前是否登录，直接清掉，简化流程）；
#   3. 往 PowerShell $PROFILE 写入 function tokens，让 tokens 默认带上
#      TOKENS_API_URL 指向本站（PowerShell 的 alias 不能带环境变量，必须用 function）。
#
# 不替用户登录：tokens login 仍需浏览器授权。
#
# 用法（站点地址必须显式传，脚本没有默认域名）：
#   powershell -ExecutionPolicy Bypass -File pre-install-tokens.ps1 -Site https://tokens.example.com
#   $env:TOKENS_SITE = 'https://tokens.example.com'; .\pre-install-tokens.ps1
# 先看会做什么再实跑：加 -DryRun
# 本地联调可用 loopback：-Site http://localhost:3000

param(
    [string]$Site = $env:TOKENS_SITE,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# --- 站点地址：必须显式传；只接受纯 origin（https://host[:port]）或精确的
# --- loopback http。地址会写进 PowerShell profile，绝不能含引号/空白/路径。 ---
if ([string]::IsNullOrWhiteSpace($Site)) {
    Write-Error "缺少站点地址。用法：powershell -ExecutionPolicy Bypass -File pre-install-tokens.ps1 -Site https://<线上域名>"
    exit 1
}
$Site = $Site.TrimEnd('/')
if ($Site -eq 'https://tokens.example.com') {
    Write-Error "不要用占位符域名。请传实际地址：-Site https://<线上域名>"
    exit 1
}
if ($Site -notmatch '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' -and $Site -notmatch '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?$') {
    Write-Error "站点地址只接受 https://<域名>[:端口]（本地联调仅 http://localhost / 127.0.0.1 / [::1]），收到：$Site"
    exit 1
}

# 在任何改动（logout / profile 写入）之前，先让用户看到目标站点。
Write-Host "==> 目标站点：$Site"

# --- 0. 把 Get-Command 的多结果收敛为单一可执行路径 ------------------------
# npm 在 Windows 上会生成多个入口（tokens.cmd、无扩展名 shim、tokens.ps1），
# Get-Command 一次返回多个 ApplicationInfo，直接插值会把多个路径拼成无效串。
# 这里先数组化，优先 *.cmd（Windows PowerShell 5.1 / PowerShell 7 / cmd 都能调）；
# 没有 .cmd（Linux/macOS 的 pwsh）时取数组第一项。只用 PS 5.1 兼容语法。
function Select-TokensCommand {
    param($Commands)
    $list = @($Commands)
    $picked = $list | Where-Object { $_.Name -like '*.cmd' } | Select-Object -First 1
    if ($picked) { return $picked }
    return $list[0]
}

# --- 1. 检测 / 安装 tokens CLI -------------------------------------------
$tokensCmd = Select-TokensCommand (Get-Command tokens -CommandType Application -ErrorAction SilentlyContinue)
if ($tokensCmd) {
    Write-Host "✓ tokens CLI 已安装：$($tokensCmd.Source)"
} elseif ($DryRun) {
    Write-Host "[dry-run] tokens CLI 未安装；实跑将执行 npm i -g @fitor/tokens-cli"
} else {
    Write-Host "==> tokens CLI 未安装，用 npm 全局安装（@fitor/tokens-cli 包，含平台二进制）"
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Error "未找到 tokens CLI，且没有 npm 可用。请先安装 Node.js（https://nodejs.org）后重试。"
        exit 1
    }
    npm i -g @fitor/tokens-cli
    $tokensCmd = Select-TokensCommand (Get-Command tokens -CommandType Application -ErrorAction SilentlyContinue)
    if (-not $tokensCmd) { Write-Error "安装后仍找不到 tokens，请重开终端后重试"; exit 1 }
    Write-Host "✓ tokens CLI 安装完成：$($tokensCmd.Source)"
}

# --- 2. 退出既有登录（未登录也无害） --------------------------------------
if ($DryRun) {
    Write-Host "[dry-run] 将执行 tokens logout（清掉当前凭据）"
} else {
    try { & $tokensCmd.Source logout | Out-Null } catch {}
    Write-Host "✓ 已退出既有登录"
}

# --- 3. 写入 PowerShell function（覆盖默认 tokens 命令） -------------------
# 注意：function 里固化的是当前解析到的二进制路径；以后 npm 重装换了路径，
# 重跑本脚本即可刷新。
$targetBinary = if ($tokensCmd) { $tokensCmd.Source } else { 'tokens' }
$funcLines = @(
    '# tokens CLI 默认指向自建站（pre-install-tokens.ps1 写入）',
    'function tokens {',
    "    `$env:TOKENS_API_URL = '$Site'",
    "    & '$targetBinary' @args",
    '}'
)
$funcBlock = $funcLines -join "`n"

if ($DryRun) {
    Write-Host "[dry-run] 将写入/更新 $PROFILE："
    Write-Host $funcBlock
} else {
    $profileDir = Split-Path $PROFILE -Parent
    New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
    if (-not (Test-Path $PROFILE)) { New-Item -ItemType File -Force -Path $PROFILE | Out-Null }

    $existing = Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue
    if ($existing -and ($existing -match '(?ms)^function tokens \{.*?\r?\n\}')) {
        # 幂等：已有 function tokens 就整块替换（换域名/路径重跑脚本即可更新）
        $updated = [regex]::Replace($existing, '(?ms)^function tokens \{.*?\r?\n\}', ($funcLines[1..4] -join "`n"))
        Set-Content -Path $PROFILE -Value $updated -NoNewline
        Write-Host "✓ 已更新 $PROFILE 里的 tokens function"
    } else {
        Add-Content -Path $PROFILE -Value "`n$funcBlock"
        Write-Host "✓ 已写入 $PROFILE"
    }
}

Write-Host ""
Write-Host "完成。接下来："
Write-Host "  1. 重开 PowerShell（或执行 `. `$PROFILE`），让 function 生效；"
Write-Host "  2. tokens login     # 浏览器会打开 $Site/device 授权；"
Write-Host "  3. tokens submit    # 上报用量，$Site 的榜单上就能看到你。"
Write-Host ""
Write-Host "注意：function 只管交互式 PowerShell 里的 tokens 命令；脚本/计划任务里请显式设置 `$env:TOKENS_API_URL = '$Site'。"
