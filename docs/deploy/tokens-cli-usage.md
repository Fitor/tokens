# Tokens CLI 使用手册（自建站）

[English](./tokens-cli-usage.en.md)

本手册面向两个场景：开发者在本地把 CLI 接到 `localhost:3000` 自测；以及站点上线后，最终用户接入线上站。最后一章是给部署方用的预安装脚本说明。

CLI 的铁律：**它只认 `TOKENS_API_URL`，默认上游 `https://tokens.ci`；凭据 `credentials.json` 不记站点，换站先 `tokens logout`。**

---

## 1. 本地开发环境接入（localhost:3000）

前置：本地 Compose 栈已起（见 `docs/deploy/local-orbstack-compose.md`），浏览器能开 `http://localhost:3000`。

```bash
# 0. 浏览器打开 http://localhost:3000/register，用邮箱注册一个本地账号
#    （本地不配 Resend 不发验证邮件；不影响注册和上报）

# 1. 清掉可能存在的上游凭据
tokens logout

# 2. 指向本地登录（localhost 是 CLI 唯一允许的 http 例外）
TOKENS_API_URL=http://localhost:3000 tokens login
#    终端会打印 http://localhost:3000/device 链接和授权码，浏览器打开输码

# 3. 上报并看榜
TOKENS_API_URL=http://localhost:3000 tokens submit
#    浏览器开 http://localhost:3000/leaderboard 就能看到自己的用量

# 4. 可选：对公开排名隐藏这个账号，并打印一次性读令牌
TOKENS_API_URL=http://localhost:3000 tokens login --private
```

可选：

- 要测「已验证邮箱」的下游行为（比如按邮箱邀请的接受），本地直接置位：
  ```bash
  docker compose -f /Users/lusonglin/docker-compose/tokens/docker-compose.yml exec postgres \
    psql -U tokens -d tokens \
    -c "UPDATE users SET email_verified_at = now() WHERE lower(email) = lower('你的注册邮箱');"
  ```
- 要回上游：`tokens logout`，然后不带环境变量 `tokens login`。
- 每次都敲前缀嫌烦：当前 shell 里 `export TOKENS_API_URL=http://localhost:3000` 一次即可；别开新终端就忘。

---

## 2. 部署上线后，用户操作步骤

前置（部署方提供）：站点已在 `https://<线上域名>` 跑起来，HTTPS 有效。

**第一步：装 CLI**（已装跳过）

| 平台 | 安装方式 |
|---|---|
| macOS | `brew install owo-network/brew/tokens` |
| Linux | 官方 install.sh（命令见下方代码块；默认会装一个常驻自动上报服务，见下方注意） |
| Windows | `npm i -g tokens-cli`（需要 Node.js；npm 包 `tokens-cli` 会拉对应平台二进制） |

```bash
curl -fsSL https://s.ee/tokens | bash
```

**第二步：清掉旧凭据**

```bash
tokens logout
```

哪怕你没登录过也照跑——它可能只是上游的旧凭据，不清掉会把上游 token 发到本站然后 401。

**第三步：在网站上注册**

浏览器开 `https://<线上域名>/register`，邮箱注册。CLI 的登录授权页需要你先在网站有账号。

**第四步：CLI 登录本站**

```bash
TOKENS_API_URL=https://<线上域名> tokens login
```

终端打印 `https://<线上域名>/device` 链接和授权码 → 浏览器打开输码 → 授权完成。

**第五步：上报**

```bash
TOKENS_API_URL=https://<线上域名> tokens submit
```

榜单 `https://<线上域名>/leaderboard` 就能看到你的用量。Team / Teamboard 在网站里操作。

**注意事项：**

- `tokens` 的每条命令都读 `TOKENS_API_URL`；嫌每次敲前缀，当前 shell 里 `export TOKENS_API_URL=https://<线上域名>` 一次，或直接跑第 3 章的预安装脚本（它会把 alias 写进 shell 配置，长期生效）。
- tokens.ci 的历史用量和 token 不会迁过来；本站是独立新库，重新注册、重新登录。
- Linux 用官方 `install.sh` 安装时默认会起一个常驻自动上报服务（`tokens.service`），它**不读** shell alias，会一直报上游。要么安装时 `TOKENS_NO_SERVICE=1`，要么往 `~/.config/systemd/user/tokens.service` 的 `[Service]` 段加 `Environment=TOKENS_API_URL=https://<线上域名>` 后 `systemctl --user daemon-reload && systemctl --user restart tokens`。macOS 的 `brew services start tokens` 同理。

---

## 3. 预安装脚本说明（pre-install-tokens）

仓库根目录的 `pre-install-tokens.sh`（macOS / Linux）和 `pre-install-tokens.ps1`（Windows）把第 2 章的前置步骤自动化，降低用户理解和操作成本。它们与 `install.sh` 同级；站点 build 时会被复制到 `public/`，即用户也可以从 `https://<线上域名>/pre-install-tokens.sh` 直接下载。

**脚本做三件事：**

1. **检测 / 安装 tokens CLI**：已装就跳过；没装按平台装（macOS 走 brew，Linux 走官方 `install.sh` 但带 `TOKENS_NO_SERVICE=1` 不起常驻服务，Windows 走 `npm i -g tokens-cli`）。Linux/macOS 上若检测到已有的常驻上报服务（`tokens.service` / `brew services` 的 tokens），会停掉它——常驻服务不读 shell alias，不停就会一直报上游。
2. **`tokens logout`**：无论当前登录的是上游还是别的站，直接清掉，后续统一重新登录。
3. **写入全局 alias / function**：覆盖默认 `tokens` 命令，让它永远带上 `TOKENS_API_URL=https://<线上域名>`。macOS/Linux 写进 `~/.zshrc` 或 `~/.bashrc`；Windows 写进 PowerShell `$PROFILE`（PowerShell 的 alias 不能带环境变量，所以用的是 function）。

**用法：**

脚本支持先看后跑：`--dry-run`（sh）/ `-DryRun`（ps1）只打印将要做的安装、logout 和配置写入，不改动任何东西。

**推荐：无需 clone 仓库，直接远程执行钉住版本的脚本**

```bash
# macOS / Linux（钉住 commit，不跟随分支漂移）
curl -fsSL https://raw.githubusercontent.com/KunoLu/tokens/v1.0.5/pre-install-tokens.sh | bash -s -- https://<线上域名>

# Windows
iex "& { $(irm https://raw.githubusercontent.com/KunoLu/tokens/v1.0.5/pre-install-tokens.ps1) } -Site https://<线上域名>"
```

脚本 URL 指向不可变 ref（tag 或钉版 commit，永不跟随分支）。发版时 `scripts/set-version.sh <version>` 会先把 `web/src/lib/scriptsRef.ts` 的 `PINNED_SCRIPTS_REF` 推进为即将创建的 `v<version>`，并同步替换本手册与 README 的旧 ref——顺序固定为 set-version → commit → tag → deploy。不做 tag 扫描：历史 tag（v27.0.0/v27.0.1）不含 pre-install 脚本，扫到就是 404。部署侧紧急覆盖可用 `TOKENS_SCRIPTS_REF` env（只接受 `vX.Y.Z[-prerelease]` 或 40 位 SHA，非法值回退钉版）。脚本也会被站点 build 复制到 `https://<线上域名>/pre-install-tokens.sh` 作为备选下载路径。

**本地文件形式：**

```bash
# macOS / Linux（站点地址作为参数显式传入，脚本无默认域名、拒绝占位符）
bash pre-install-tokens.sh https://<线上域名>

# Windows（管理员或普通 PowerShell 均可）
powershell -ExecutionPolicy Bypass -File pre-install-tokens.ps1 -Site https://<线上域名>
```

**脚本不做的事：**

- 不替用户登录——`tokens login` 的浏览器授权必须用户自己来。
- 不管非交互环境——alias/function 只对交互式终端生效；用户自己的脚本或定时任务里仍要显式写 `TOKENS_API_URL`。
- 不动系统服务的内容——只是把（可能存在的）常驻上报服务停掉；用户若想要常驻自动上报，需按第 2 章注意事项给服务配上 `TOKENS_API_URL` 再手动启用。

脚本是幂等的：域名变了用新地址重跑一遍，alias/function 会被原地更新。

**常驻自动化脚本（完成 preinstall + login 之后）：**

```bash
# Linux：systemd 用户服务常驻上报（写 drop-in override.conf 指向本站，不动 base unit）
curl -fsSL https://<线上域名>/enable-tokens-service.sh | bash -s -- https://<线上域名>
```

```powershell
# Windows：计划任务定时提交（默认每 30 分钟；runner 内显式设 TOKENS_API_URL）
iex "& { $(irm https://<线上域名>/register-tokens-submit-task.ps1) } -Site https://<线上域名>"
```

两个脚本都只配置常驻提交与站点指向：不登录、不 logout，凭据直接复用。Linux 上 `tokens serve` 与常驻服务二选一，别同时跑。卸载：Linux `systemctl --user disable --now tokens`；Windows 重跑脚本加 `-Remove`。
