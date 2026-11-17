# cli-install Specification

## Purpose

TBD — 此新能力的主规格由 change `npm-install-tokens-cli` 的增量创建，增量未提供 `## Purpose` 正文。请补充描述：该能力做什么、为何存在。

## Requirements

### Requirement: 安装命令统一为 npm 包 @fitor/tokens-cli

README.md、README_zh.md、docs/deploy/tokens-cli-usage.md、docs/deploy/tokens-cli-usage.en.md、前端 docs 页与 `/local` 页安装引导中的 CLI 安装命令必须是 `npm i -g @fitor/tokens-cli`。各入口给出的命令必须一致。settings 提示不显示安装命令。settings 提示给出的 `tokens` 命令必须带 `TOKENS_API_URL=<本站源>` 站点绑定。settings 命令按查看者平台渲染对应 shell 形态：POSIX 用环境变量前缀，Windows PowerShell 用 `$env:` 赋值。文档不得再引导使用者走 brew 配方、站点 `install.sh`、`s.ee/tokens` 或旧上游包 `tokens-cli` 安装 CLI。

#### Scenario: docs 页各平台页签给出 npm 安装命令

- **GIVEN** 部署完成的站点
- **WHEN** 打开 `/docs`，依次查看 macOS、Linux、Windows 页签
- **THEN** 每个页签的命令块含 `npm i -g @fitor/tokens-cli`。macOS 与 Linux 页签的命令块首行是 `export TOKENS_API_URL=<本站源>`。Windows 页签的命令块首行是 `$env:TOKENS_API_URL='<本站源>'`。页面 HTML 不含 `brew install`、`install.sh | sh`、`npm i -g tokens-cli`

#### Scenario: README 与手册给出同一安装命令

- **GIVEN** 仓库根 README.md、README_zh.md、docs/deploy/tokens-cli-usage.md、docs/deploy/tokens-cli-usage.en.md
- **WHEN** 扫描四份文档的安装章节
- **THEN** 四份文档都含 `npm i -g @fitor/tokens-cli`，且都不含 `brew install owo-network/brew/tokens`、`install.sh | sh`、`curl -fsSL https://s.ee/tokens | bash`、`npm i -g tokens-cli`

#### Scenario: settings 提示命令带站点绑定

- **GIVEN** 部署完成的站点，settings 页没有任何设备与任何 token
- **WHEN** 查看 settings 页各提示里的命令文本
- **THEN** 命令文本按查看者平台渲染。POSIX 平台的空态提示命令文本是 `TOKENS_API_URL=<本站源> tokens submit`，Windows 平台是 `$env:TOKENS_API_URL='<本站源>'; tokens submit`。两处 `tokens login` 提示同样按平台渲染：POSIX 平台是 `TOKENS_API_URL=<本站源> tokens login`，Windows 平台是 `$env:TOKENS_API_URL='<本站源>'; tokens login`。`<本站源>` 等于部署站点 origin。页面不含 `bunx tokens-cli`

#### Scenario: /local 页安装引导显示 npm 命令

- **GIVEN** 部署完成的站点
- **WHEN** 打开 `/local` 页的安装引导区块
- **THEN** 区块里的命令文本是 `npm i -g @fitor/tokens-cli`，区块不显示 `brew install`

### Requirement: 旧仓库链接与旧安装命令清零

面向使用者的文档与前端提示不得出现 `raw.githubusercontent.com/KunoLu/tokens` 链接，也不得出现 `github.com/KunoLu/tokens/blob` 链接。`web/src` 源码不得保留旧仓库地址常量。历史记录类文档对 fork 渊源的事实陈述不受此限。测试文件允许把禁用字符串写成反向断言。

#### Scenario: 文档与前端源码扫描零命中

- **GIVEN** 安装引导已更新的仓库
- **WHEN** 扫描 README.md、README_zh.md、docs/**/*.md、web/src/**/*.{ts,tsx}、pre-install-tokens.sh、pre-install-tokens.ps1、scripts/*.sh
- **THEN** 模式 `raw.githubusercontent.com/KunoLu`、`github.com/KunoLu/tokens`、`brew install owo-network`、`npm i -g tokens-cli`、`bunx tokens-cli`、`install.sh | sh`、`s.ee/tokens` 全部零命中

#### Scenario: docs 页不含旧链接

- **GIVEN** 部署完成的站点
- **WHEN** 读取 `/docs` 页面 HTML
- **THEN** HTML 不含 `raw.githubusercontent.com`、`KunoLu`、`brew install`、`install.sh | sh`、`npm i -g tokens-cli`

### Requirement: pre-install 脚本经 npm 安装 CLI

pre-install-tokens.sh 与 pre-install-tokens.ps1 在检测不到 `tokens` 命令时必须运行 `npm i -g @fitor/tokens-cli` 安装。npm 检查只在安装分支触发。`tokens` 已存在时不要求 npm。安装分支缺 npm 时脚本必须报错退出。安装命令非零退出时脚本必须报错退出。两种报错退出前脚本不做任何本机修改。脚本不得再调用 brew 配方、`s.ee/tokens` 或站点 `install.sh`。

#### Scenario: sh 脚本缺 CLI 时经 npm 安装

- **GIVEN** PATH 上没有 `tokens`，有一个记录参数并创建假 `tokens` 的 stub `npm`，HOME 指向临时目录
- **WHEN** 运行 `bash pre-install-tokens.sh https://example.com`
- **THEN** stub `npm` 记录的参数为 `i -g @fitor/tokens-cli`，脚本退出码 0

#### Scenario: sh 脚本缺 npm 时中止

- **GIVEN** PATH 上既没有 `tokens` 也没有 `npm`，HOME 指向临时目录
- **WHEN** 运行 `bash pre-install-tokens.sh https://example.com`
- **THEN** 脚本退出码非 0，stderr 提示先安装 Node.js，脚本未写入临时 HOME 下的 rc 文件

#### Scenario: sh 脚本在 npm 安装失败时中止

- **GIVEN** PATH 上没有 `tokens`，stub `npm` 以非零码退出，HOME 指向临时目录
- **WHEN** 运行 `bash pre-install-tokens.sh https://example.com`
- **THEN** 脚本退出码非 0，脚本未写入临时 HOME 下的 rc 文件

#### Scenario: sh 脚本在 tokens 已存在时不要求 npm

- **GIVEN** PATH 上有记录子命令的 stub `tokens`，PATH 上没有 `npm`，HOME 指向临时目录，`SHELL` 指向 bash
- **WHEN** 运行 `bash pre-install-tokens.sh https://example.com`
- **THEN** 脚本退出码 0，脚本未运行安装，`~/.bashrc` 含 `alias tokens='TOKENS_API_URL=https://example.com tokens'`

#### Scenario: ps1 脚本缺 CLI 时经 npm 安装（机械检查）

- **GIVEN** pre-install-tokens.ps1 文本
- **WHEN** 检查安装分支
- **THEN** 文本含 `npm i -g @fitor/tokens-cli`，不含 `npm i -g tokens-cli`，不含 `s.ee`、`brew`、`install.sh` 安装入口

#### Scenario: ps1 脚本缺 npm 时中止（机械检查）

- **GIVEN** pre-install-tokens.ps1 文本
- **WHEN** 检查缺 npm 分支
- **THEN** 文本含缺 npm 时的报错退出分支，报错文案提示先安装 Node.js

#### Scenario: sh 脚本文本无旧安装入口（机械检查）

- **GIVEN** pre-install-tokens.sh 文本
- **WHEN** 检查安装入口
- **THEN** 文本不含 `s.ee`、`brew install`、`install.sh` 安装入口

### Requirement: pre-install 脚本保留站点指向行为

安装通道改变后，两个脚本的其余行为必须保持。脚本必须调用 `tokens logout` 清理旧登录。pre-install-tokens.sh 必须往 shell rc 写入 `alias tokens='TOKENS_API_URL=<站点> tokens'`。pre-install-tokens.ps1 必须往 `$PROFILE` 写入带 `TOKENS_API_URL` 的 function。Linux 上必须停用既有 `tokens.service`，macOS 上必须停用 brew services 的 tokens。`--dry-run` 与 `-DryRun` 必须只报告动作、不做修改。

#### Scenario: sh 脚本清登录并写 alias

- **GIVEN** PATH 上有记录子命令的 stub `tokens`，HOME 指向临时目录，`SHELL` 指向 bash
- **WHEN** 运行 `bash pre-install-tokens.sh https://example.com`
- **THEN** stub 记录到 `logout` 子命令，`~/.bashrc` 含 `alias tokens='TOKENS_API_URL=https://example.com tokens'`

#### Scenario: sh 脚本 dry-run 不修改本机

- **GIVEN** PATH 上没有 `tokens`，stub `npm` 在 PATH 上，HOME 指向临时目录，`SHELL` 指向 bash
- **WHEN** 运行 `bash pre-install-tokens.sh --dry-run https://example.com`
- **THEN** 脚本退出码 0，脚本未写入 rc 文件，dry-run 未调用 stub `npm`，输出含 `npm i -g @fitor/tokens-cli`

### Requirement: 前端提示不再引导下载脚本

docs 页不得显示 curl / iex 从 GitHub 下载 pre-install 脚本的一行命令。手册链接必须指向 `Fitor/tokens` 仓库的不可变 ref（tag 或钉版 commit），不得指向分支。`TOKENS_SCRIPTS_REF` 覆盖机制必须保留 fail-closed 语义。

#### Scenario: docs 页无脚本下载命令

- **GIVEN** 部署完成的站点
- **WHEN** 读取 `/docs` 页面 HTML
- **THEN** HTML 不含 `pre-install-tokens.sh` 与 `pre-install-tokens.ps1` 的下载命令，不含 `curl` 与 `pre-install-tokens` 的组合，不含 `iex` 与 `pre-install-tokens` 的组合

#### Scenario: 手册链接指向新仓库钉版 ref

- **GIVEN** `web/src/lib/scriptsRef.ts` 的 `PINNED_SCRIPTS_REF` 为合法钉版值
- **WHEN** 渲染「见 CLI 手册」链接
- **THEN** href 等于 `https://github.com/Fitor/tokens/blob/<ref>/docs/deploy/tokens-cli-usage.md`，`<ref>` 匹配 `vX.Y.Z[-prerelease]` 或 40 位十六进制 SHA

#### Scenario: 非法 ref 覆盖回退钉版

- **GIVEN** 环境变量 `TOKENS_SCRIPTS_REF` 的值为 `main`
- **WHEN** 计算手册链接的 ref
- **THEN** ref 回退为 `PINNED_SCRIPTS_REF`，进程输出告警

### Requirement: 发版脚本与新文档形态一致

`scripts/set-version.sh` 必须继续把 `PINNED_SCRIPTS_REF` 推进为即将创建的 `v<version>`。它的 ref 预检只检查仍含 ref 的文件，不得要求 README 与手册保留旧仓库 raw URL。`web/src/lib/scriptsRef.ts` 必须继续导出 `PINNED_SCRIPTS_REF`。

#### Scenario: ref 预检只检查仍含 ref 的文件

- **GIVEN** 合成 fixture 目录：`scripts/set-version.sh` 原样拷贝，两个 pre-install 脚本占位文件在根，最小 `cli/Cargo.toml` workspace 与 `Cargo.lock`，`packages/` 下一个 package.json，`web/src/lib/scriptsRef.ts` 含 `v1.0.5`，README 与手册不含该值。运行环境 PATH 含 cargo 与 node
- **WHEN** 运行 `bash scripts/set-version.sh 1.0.6`
- **THEN** 预检通过，`web/src/lib/scriptsRef.ts` 的 `PINNED_SCRIPTS_REF` 变为 `v1.0.6`，退出码 0

#### Scenario: scriptsRef 缺失时发版脚本中止

- **GIVEN** 同一 fixture，但 `web/src/lib/scriptsRef.ts` 不含 `PINNED_SCRIPTS_REF`
- **WHEN** 运行 `bash scripts/set-version.sh 1.0.6`
- **THEN** 脚本退出码非 0，报错信息指出无法读取 `PINNED_SCRIPTS_REF`，脚本未修改任何 package.json
