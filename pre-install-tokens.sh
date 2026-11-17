#!/usr/bin/env bash
#
# pre-install-tokens.sh — 把用户的 tokens CLI 预装并指向自建站（macOS / Linux）。
#
# 做三件事：
#   1. 检测 tokens CLI，没装则用 npm 全局安装（@fitor/tokens-cli，需要 Node.js）；
#   2. `tokens logout`（无论当前是否登录，直接清掉，简化流程）；
#   3. 往 shell rc 写入全局 alias，让 `tokens` 默认带上 TOKENS_API_URL 指向本站。
#
# 不替用户登录：`tokens login` 仍需浏览器授权，脚本只把前置条件备好。
#
# 用法（站点地址必须显式传，脚本没有默认域名）：
#   bash pre-install-tokens.sh https://tokens.example.com
#   TOKENS_SITE=https://tokens.example.com bash pre-install-tokens.sh
# 先看会做什么再实跑：bash pre-install-tokens.sh --dry-run https://...
# 本地联调可用 loopback：bash pre-install-tokens.sh http://localhost:3000

set -euo pipefail

info() { printf "==> %s\n" "$*"; }
ok()   { printf "✓ %s\n" "$*"; }
die()  { printf "✗ %s\n" "$*" >&2; exit 1; }

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; shift; fi

# --- 站点地址：必须显式传；只接受纯 origin（https://host[:port]）或精确的
# --- loopback http。地址会写进 shell 配置，绝不能含引号/空白/路径。 ---
TOKENS_SITE="${1:-${TOKENS_SITE:-}}"
TOKENS_SITE="${TOKENS_SITE%/}"   # 容忍一个结尾斜杠

if [ -z "$TOKENS_SITE" ] || [ "$TOKENS_SITE" = "https://tokens.example.com" ]; then
  die "缺少站点地址。用法：bash pre-install-tokens.sh https://<线上域名>"
fi
if ! printf '%s' "$TOKENS_SITE" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' \
  && ! printf '%s' "$TOKENS_SITE" | grep -Eq '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?$'; then
  die "站点地址只接受 https://<域名>[:端口]（本地联调仅 http://localhost / 127.0.0.1 / [::1]），收到：$TOKENS_SITE"
fi

# 在任何改动（logout / rc 写入）之前，先让用户看到目标站点。
info "目标站点：$TOKENS_SITE"

OS="$(uname -s)"

# --- 1. 检测 / 安装 tokens CLI -------------------------------------------
if command -v tokens >/dev/null 2>&1; then
  ok "tokens CLI 已安装"
elif [ "$DRY_RUN" = 1 ]; then
  info "[dry-run] tokens CLI 未安装；实跑将执行 npm i -g @fitor/tokens-cli"
else
  info "tokens CLI 未安装，开始安装"
  command -v npm >/dev/null 2>&1 \
    || die "未找到 npm。npm 安装通道需要 Node.js：请先安装 Node.js（https://nodejs.org）后重试"
  npm i -g @fitor/tokens-cli || die "npm 安装失败（退出码 $?）。本机未做任何修改，请排查 npm 后重试"
  command -v tokens >/dev/null 2>&1 || die "安装后仍找不到 tokens，请检查 PATH"
  ok "tokens CLI 安装完成"
fi

# 已有常驻上报服务会直接绕过 shell alias 打上游，停掉它。
if [ "$OS" = "Linux" ] && command -v systemctl >/dev/null 2>&1; then
  if systemctl --user is-enabled tokens.service >/dev/null 2>&1; then
    if [ "$DRY_RUN" = 1 ]; then
      info "[dry-run] 将停用既有 tokens.service"
    else
      systemctl --user disable --now tokens.service >/dev/null 2>&1 || true
      info "已停用既有 tokens.service（它不会读 shell alias，见使用手册第 2 章）"
    fi
  fi
elif [ "$OS" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
  if brew services list 2>/dev/null | grep -q '^tokens.*started'; then
    if [ "$DRY_RUN" = 1 ]; then
      info "[dry-run] 将停用 brew services 的 tokens 常驻服务"
    else
      brew services stop tokens >/dev/null 2>&1 || true
      info "已停用 brew services 的 tokens 常驻服务（它不会读 shell alias）"
    fi
  fi
fi

# --- 2. 退出既有登录（未登录也无害） --------------------------------------
if [ "$DRY_RUN" = 1 ]; then
  info "[dry-run] 将执行 tokens logout（清掉当前凭据）"
else
  tokens logout >/dev/null 2>&1 || true
  ok "已退出既有登录"
fi

# --- 3. 写入全局 alias（覆盖默认 tokens 命令） -----------------------------
ALIAS_LINE="alias tokens='TOKENS_API_URL=${TOKENS_SITE} tokens'"

write_alias() {
  local rc="$1"
  if [ "$DRY_RUN" = 1 ]; then
    info "[dry-run] 将写入/更新 ${rc}：${ALIAS_LINE}"
    return
  fi
  touch "$rc"
  if grep -q '^alias tokens=' "$rc"; then
    # 幂等：已存在就整行替换（换域名重跑脚本即可更新）
    sed -i.bak "s|^alias tokens=.*|${ALIAS_LINE}|" "$rc" && rm -f "${rc}.bak"
    ok "已更新 ${rc} 里的 tokens alias"
  else
    printf '\n# tokens CLI 默认指向自建站（pre-install-tokens.sh 写入）\n%s\n' "$ALIAS_LINE" >> "$rc"
    ok "已写入 ${rc}"
  fi
}

case "$(basename "${SHELL:-/bin/bash}")" in
  zsh)  write_alias "$HOME/.zshrc" ;;
  bash) write_alias "$HOME/.bashrc" ;;
  *)    die "暂不支持的 shell：${SHELL:-未知}（请手动把 ${ALIAS_LINE} 写进你的 shell 配置）" ;;
esac

cat <<EOF

完成。接下来：

  1. 重开终端（或 source 一下你的 rc 文件），让 alias 生效；
  2. tokens login     # 浏览器会打开 ${TOKENS_SITE}/device 授权；
  3. tokens submit    # 上报用量，${TOKENS_SITE} 的榜单上就能看到你。

注意：alias 只管交互式终端里的 tokens 命令；脚本/定时任务里请显式写
TOKENS_API_URL=${TOKENS_SITE}。
EOF
