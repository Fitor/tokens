# cli-install Specification

## Purpose

cli-install 统一 tokens CLI 的安装通道与安装引导。README、手册、docs 页、settings 提示与 pre-install 脚本都以 `npm i -g @fitor/tokens-cli` 安装 CLI。脚本默认把 tokens 指向自建站。脚本把 `Get-Command` 解析出的多个结果收敛为单一路径。本能力消除旧仓库链接与安装入口不一致的混乱。每个安装入口给出同一命令。

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

### Requirement: 脚本解析 tokens 路径必须收敛为单一路径

`pre-install-tokens.ps1` 与 `register-tokens-submit-task.ps1` 解析 `tokens` 可执行路径时，必须把 `Get-Command` 返回的多个结果收敛为一个：结果先转数组，优先选取文件名以 `.cmd` 结尾的项；没有 `.cmd` 项时取数组第一项。每个 `Get-Command` 解析点之后、任何使用路径的动作（展示、`tokens logout` 调用、Profile function 路径、计划任务 runner 路径）之前，都必须完成收敛，后续动作只引用收敛后的单值。仓库根的两个脚本与 `web/public/` 下的分发副本必须保持内容一致；副本由 web 构建从仓库根拷贝，Git 不跟踪。本机无 Windows 环境时，ps1 行为用机械文本断言验证。

#### Scenario: 两份 ps1 含优先 .cmd 与回退首项的单选逻辑（机械检查）

- **GIVEN** 仓库根 `pre-install-tokens.ps1` 与 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查 `tokens` 路径的单选逻辑
- **THEN** 两份文本都含 `Get-Command` 结果的数组化，都含 `*.cmd` 优先筛选，都含筛选未命中时取数组第一项的回退分支

#### Scenario: 回退分支覆盖无 .cmd 的环境（机械检查）

- **GIVEN** 两份 ps1 的单选逻辑文本
- **WHEN** 检查 `.cmd` 筛选未命中时的分支
- **THEN** 文本含取数组第一项的回退分支

#### Scenario: 每个 Get-Command 解析点都完成收敛（机械检查）

- **GIVEN** 两份 ps1 的文本
- **WHEN** 统计 `Get-Command tokens -CommandType Application` 的出现次数与单选收敛的接入次数，并检查 `$targetBinary`、`$escapedTokensPath` 的赋值来源
- **THEN** 两个次数相等，每个解析点在展示、`logout` 调用或写 Profile function、写 runner 之前已收敛为单值

#### Scenario: 根目录副本与 web/public 分发副本一致

- **GIVEN** 仓库根与 `web/public/` 下的同名两个 ps1
- **WHEN** 逐字节比较每对文件（任一副本缺失时跳过该对）
- **THEN** 存在的每对文件内容一致，出现差异时机械断言失败

### Requirement: 计划任务触发不得创建可见窗口

`register-tokens-submit-task.ps1` 注册计划任务时，必须用无窗口宿主启动 runner。计划任务的 Action 可执行文件必须是 `wscript.exe`。Action 参数必须含 `//B //Nologo` 与 launcher 路径。launcher 路径在 Action 参数中必须用双引号包裹。脚本必须把 launcher 写到 `%LOCALAPPDATA%\tokens\tokens-submit-hidden.vbs`。launcher 必须以带 BOM 的 UTF-16 LE 写入。launcher 必须用 `WshShell.Run` 启动 runner，窗口样式参数必须是 `0`。launcher 必须等待 runner 结束，并把 powershell 进程的退出码经 `WScript.Quit` 回传给计划任务。runner 内容、`tokens submit` 调用结构、提交间隔、登录类型保持不变。`-Remove` 必须同时删除 launcher 文件。`-DryRun` 不得写入或删除任何文件。本机无 Windows 环境时，ps1 与 vbs 行为用机械文本断言验证。

#### Scenario: Action 由 wscript 启动（机械检查）

- **GIVEN** 仓库根 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查计划任务注册处的 Action
- **THEN** 文本含以 `wscript.exe` 为 Execute 的 Action。参数含 `//B //Nologo`。launcher 路径以双引号包裹。Action 的 Execute 不再是 `powershell.exe`

#### Scenario: launcher 内容以隐藏窗口启动 runner（机械检查）

- **GIVEN** 仓库根 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查 launcher 的写入动作与写入内容
- **THEN** 文本含 `tokens-submit-hidden.vbs` 的写入动作。写入编码写法含 `UnicodeEncoding]::new($false, $true)`。写入内容含字面串 `WshShell.Run`、`, 0, True`、`powershell.exe`、`$RunnerPath`（runner 路径变量）

#### Scenario: 退出码回传任务历史（机械检查）

- **GIVEN** 仓库根 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查 launcher 的退出码处理
- **THEN** 写入内容含 `WshShell.Run` 返回值赋给变量的字面形态，含 `WScript.Quit` 以该变量为参数的字面形态

#### Scenario: 路径含空格时命令行仍正确（机械检查）

- **GIVEN** 仓库根 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查 launcher 命令行的引号处理
- **THEN** launcher 的 Run 命令行把 `powershell.exe` 与 runner 路径（`$RunnerPath`）都用双引号包裹。文本对嵌入 vbs 字符串的双引号做加倍转义

#### Scenario: -Remove 同步清理 launcher（机械检查）

- **GIVEN** 仓库根 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查 `-Remove` 分支
- **THEN** 分支含 `Remove-Item` 与 `tokens-submit-hidden.vbs` 的删除动作。删除动作与既有 runner 删除动作位于同一分支

#### Scenario: 注册分支的 -DryRun 不触碰文件系统（机械检查）

- **GIVEN** 仓库根 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查注册路径的 `-DryRun` 分支
- **THEN** `exit 0` 出现在 `Set-Content` 之前。输出含 `wscript.exe` 与 `tokens-submit-hidden.vbs`

#### Scenario: -Remove 分支的 -DryRun 不触碰文件系统（机械检查）

- **GIVEN** 仓库根 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查 `-Remove` 分支的 `-DryRun` 子分支
- **THEN** `exit 0` 出现在 `Remove-Item` 之前。该子分支不要求输出 Action 描述

#### Scenario: 弹窗不再出现（Windows 实机人工门禁）

- **GIVEN** Windows 机器已完成 preinstall 与 login，注册脚本以默认参数运行成功
- **WHEN** 等待计划任务连续触发两次
- **THEN** 用户桌面全程不出现 PowerShell 或控制台窗口。任务历史显示 `wscript.exe` 启动且 LastTaskResult 为 0。榜单显示两次提交成功
