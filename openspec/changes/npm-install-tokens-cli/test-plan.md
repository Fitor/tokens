## Test Plan

每个 `specs/cli-install/spec.md` 的 Scenario 映射一个命名测试。覆盖账本在实施期逐行由 🔴 翻 🟢。verify 检查全绿。

| Requirement | Scenario | Test File | Test Name | Initial State |
|-------------|----------|-----------|-----------|---------------|
| specs/cli-install/spec.md → 安装命令统一为 npm 包 @fitor/tokens-cli | docs 页各平台页签给出 npm 安装命令 | tests/e2e/t9-acceptance.spec.ts | docs 页各平台页签给出 npm 安装命令 | 🔴 red |
| specs/cli-install/spec.md → 安装命令统一为 npm 包 @fitor/tokens-cli | README 与手册给出同一安装命令 | tests/scripts/install-via-npm.test.ts | README 与手册给出同一安装命令 | 🔴 red |
| specs/cli-install/spec.md → 安装命令统一为 npm 包 @fitor/tokens-cli | settings 提示命令带站点绑定 | tests/e2e/t9-acceptance.spec.ts | settings 提示命令带站点绑定 | 🔴 red |
| specs/cli-install/spec.md → 安装命令统一为 npm 包 @fitor/tokens-cli | /local 页安装引导显示 npm 命令 | tests/e2e/t9-acceptance.spec.ts | /local 页安装引导显示 npm 命令 | 🔴 red |
| specs/cli-install/spec.md → 旧仓库链接与旧安装命令清零 | 文档与前端源码扫描零命中 | tests/scripts/install-via-npm.test.ts | 文档与前端源码扫描零命中 | 🔴 red |
| specs/cli-install/spec.md → 旧仓库链接与旧安装命令清零 | docs 页不含旧链接 | tests/e2e/t9-acceptance.spec.ts | docs 页不含旧链接 | 🔴 red |
| specs/cli-install/spec.md → pre-install 脚本经 npm 安装 CLI | sh 脚本缺 CLI 时经 npm 安装 | tests/scripts/install-via-npm.test.ts | sh 脚本缺 CLI 时经 npm 安装 | 🔴 red |
| specs/cli-install/spec.md → pre-install 脚本经 npm 安装 CLI | sh 脚本缺 npm 时中止 | tests/scripts/install-via-npm.test.ts | sh 脚本缺 npm 时中止 | 🔴 red |
| specs/cli-install/spec.md → pre-install 脚本经 npm 安装 CLI | sh 脚本在 npm 安装失败时中止 | tests/scripts/install-via-npm.test.ts | sh 脚本在 npm 安装失败时中止 | 🔴 red |
| specs/cli-install/spec.md → pre-install 脚本经 npm 安装 CLI | sh 脚本在 tokens 已存在时不要求 npm | tests/scripts/install-via-npm.test.ts | sh 脚本在 tokens 已存在时不要求 npm | 🟢 green（护栏） |
| specs/cli-install/spec.md → pre-install 脚本经 npm 安装 CLI | ps1 脚本缺 CLI 时经 npm 安装（机械检查） | tests/scripts/install-via-npm.test.ts | ps1 脚本缺 CLI 时经 npm 安装（机械检查） | 🔴 red |
| specs/cli-install/spec.md → pre-install 脚本经 npm 安装 CLI | ps1 脚本缺 npm 时中止（机械检查） | tests/scripts/install-via-npm.test.ts | ps1 脚本缺 npm 时中止（机械检查） | 🟢 green（护栏） |
| specs/cli-install/spec.md → pre-install 脚本经 npm 安装 CLI | sh 脚本文本无旧安装入口（机械检查） | tests/scripts/install-via-npm.test.ts | sh 脚本文本无旧安装入口（机械检查） | 🔴 red |
| specs/cli-install/spec.md → pre-install 脚本保留站点指向行为 | sh 脚本清登录并写 alias | tests/scripts/install-via-npm.test.ts | sh 脚本清登录并写 alias | 🟢 green（护栏） |
| specs/cli-install/spec.md → pre-install 脚本保留站点指向行为 | sh 脚本 dry-run 不修改本机 | tests/scripts/install-via-npm.test.ts | sh 脚本 dry-run 不修改本机 | 🔴 red |
| specs/cli-install/spec.md → 前端提示不再引导下载脚本 | docs 页无脚本下载命令 | tests/e2e/t9-acceptance.spec.ts | docs 页无脚本下载命令 | 🔴 red |
| specs/cli-install/spec.md → 前端提示不再引导下载脚本 | 手册链接指向新仓库钉版 ref | tests/e2e/t9-acceptance.spec.ts | 手册链接指向新仓库钉版 ref | 🔴 red |
| specs/cli-install/spec.md → 前端提示不再引导下载脚本 | 非法 ref 覆盖回退钉版 | web/src/lib/scriptsRef.test.ts | 非法 ref 覆盖回退钉版 | 🟢 green（护栏） |
| specs/cli-install/spec.md → 发版脚本与新文档形态一致 | ref 预检只检查仍含 ref 的文件 | tests/scripts/install-via-npm.test.ts | ref 预检只检查仍含 ref 的文件 | 🔴 red |
| specs/cli-install/spec.md → 发版脚本与新文档形态一致 | scriptsRef 缺失时发版脚本中止 | tests/scripts/install-via-npm.test.ts | scriptsRef 缺失时发版脚本中止 | 🟢 green（护栏） |

## Coverage Notes

- 运行方式。e2e 用 `bunx playwright test tests/e2e/t9-acceptance.spec.ts`。它沿用 tests/e2e 既有站点与数据库 fixture。脚本与文档契约用 `bun test tests/scripts/install-via-npm.test.ts`。scriptsRef 单测在 web 目录运行 `bun test src/lib/scriptsRef.test.ts`。
- stub 设施。tests/scripts/install-via-npm.test.ts 内置 stub `npm` 与 stub `tokens`（记录参数与子命令），配临时 HOME 与受控 PATH 驱动真实脚本。set-version 测试用合成 fixture 目录：`scripts/set-version.sh` 原样拷贝、两个 pre-install 脚本占位文件、最小 `cli/Cargo.toml` workspace 与 `Cargo.lock`、`packages/` 下一个 package.json。运行环境 PATH 需含 cargo 与 node。
- 护栏行说明。「tokens 已存在时不要求 npm」「ps1 缺 npm 时中止」「sh 清登录并写 alias」「非法 ref 覆盖回退」「scriptsRef 缺失时中止」。这五行是行为保持护栏。改动前基线即绿，无红阶段，按仓库惯例如实记录差异。改动后必须保持绿。
- 测试文件把禁用串写成反向断言。「文档与前端源码扫描零命中」的扫描范围不含测试文件。
- e2e 断言随契约改写：`tests/e2e/t9-acceptance.spec.ts` 的「Docs 页安装入口指向本站」用例改为新契约断言。旧断言（旧 raw 链接可见、`brew install` 排序）删除。
