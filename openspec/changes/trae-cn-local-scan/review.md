# Review: trae-cn-local-scan 规划工件（第 2 轮）

## Review Metadata

- Review round: 2
- Prior round: round 1 REVISE — C1 归一化契约矛盾 + M1-M8（作者已申报修复，见 Rebuttals）
- Reviewer context: fresh-context subagent（same model，与作者无共享上下文）
- Tool restrictions: read-only
- 评审对象: proposal.md、design.md、specs/trae-cn-local-scan/spec.md
- STALENESS: 本裁决只对上述工件在本轮评审时的内容有效。工件后续任何修改都使本裁决失效。

## 代码核对（本轮新核实的证据）

以下事实来自对当前工作区源码的只读核对，是本轮新发现的依据：

- `aggregator.rs:398-415`（`into_contribution`）在构建提交贡献时对五个 token 桶与 cost 逐项 `.max(0)` 钳位（日汇总与每 client 各一次）。`daily.finish()`（`aggregator.rs:75`）产出提交用 contributions（`lib.rs:4600`）。提交载荷因此永远不含负桶。三份工件"一条负值会拒收整包提交"的陈述与此不符。
- `CachedParseOutcome`（`lib.rs:1001-1006`）是通用装载器函数内的私有结构，只由装载器内部构造。解析闭包签名是 `F: Fn(&Path) -> Vec<UnifiedMessage>`（`lib.rs:1703`），闭包无法向该结构携带诊断字段。`with_opencode_incremental`（`message_cache.rs:2122`）扩展的是 `CachedSourceEntry`，其使用者是绕开通用装载器的 opencode 专用 lane（`lib.rs:1717-1725` 注释解释了绕开的原因）。
- `process_liveness.rs` 位于 tokens-cli（`cli/tokens-cli/src/process_liveness.rs`），由 `main.rs` 以私有 `mod` 声明，tokens-cli 的 antigravity/trae 通过 `crate::process_liveness` 引用。Cargo 依赖方向是 tokens-cli → tokens-core，反向不可引用。
- 第 1 轮核对结论本轮复核仍成立：`dedupe_latest_trae_messages`（`lib.rs:3545`）按 session 折叠留最新，两条 lane 接入点（`lib.rs:3380`、`lib.rs:6204`）存在，`check_sqlite_path` 盯 db+`-wal`，`ClientId` 连续且最大 id 为 `CraftAgent = 53`，`SUPPORTED_CLIENT_TYPES` 含 `"trae"`，`TokenBreakdownSchema` 五桶非负（`submission.ts:44-53`），未知 client 使 `SourceSchema` 整包失败（`submission.ts:80`）。
- M1 相关事实属实：`normalize_provider_hint`（`lookup.rs:3491-3495`）只做 trim 与 unknown 过滤。`canonicalize_provider_segment("volcengine")` 无数字、无折叠臂，原样通过。`inferred_provider_from_model` 有 glm→zai、kimi→moonshotai、deepseek→deepseek、minimax→minimax 臂，无 doubao 臂。Archive 现有 glm-5.2 行同时存在 `zhipu/` 与 `zai/` 两个 key（`pricing/mod.rs:369-374`），CN 解析器的 `zai` 提示可命中。
- M6 相关事实属实：`ClientDef` 恰为七字段（id、root、relative_path、pattern、headless、parse_local、submit_default）。`clients.rs:1190` 断言 `COUNT == 54`，加 `TraeCn = 54` 后该断言需更新为 55。clients.rs 不在 M6 的冻结清单内，无矛盾。

## Findings

### 🔴 Critical (blocking)

无。

### 🟡 Moderate

**R2-M1. 归一化契约的负值防线未覆盖两个照抄桶，且三份工件陈述的拒收理由与代码事实不符**

- 文件: proposal.md 行 13；specs/trae-cn-local-scan/spec.md 行 137-147；design.md D6 行 70
- 问题两点：
  1. spec 行 137 宣布不变量"不得产出猜测值或负值"。规则清单只拦截派生桶：input 靠 `cache_read > prompt` 规则、output 靠 `reasoning > completion` 规则间接保证非负。两个照抄桶没有防线：`cache_read = cache_read_input_tokens` 与 `reasoning = reasoning_tokens` 原样复制。一行 `cache_read=-10, prompt=100, completion=10, total=110, reasoning=0` 通过全部现行规则，产出 `tokens.cache_read = -10`，违反不变量句。reasoning 同理。此外只有 `total_tokens` 写了"不是数值"规则，`prompt_tokens`、`completion_tokens`、`cache_read_input_tokens`、`reasoning_tokens` 非数值时的行为未定义。
  2. proposal 行 13、spec 行 141 括注、design D6 都把跳行理由写成"服务端要求各桶非负，一条负值会拒收整包提交"。核实结果：`into_contribution`（`aggregator.rs:398-415`）在提交前把五桶与 cost 钳位到 0，提交载荷永远合法。负值的真实后果是静默少计，不是整包 400。
- 影响: 按现行 spec 验收通过的实现仍会对负值 DB 输入产出负桶（靠下游钳位兜底，实际后果是少计不指名）。三份工件陈述了一条不存在的拒收路径，会误导后续维护者，例如误把聚合钳位当成"掩盖 400 的缺陷"而移除。该理由源自第 1 轮 C1 自身的核对遗漏，作者忠实继承了它。
- 修复: spec 补一条跳行规则（五个 token 字段任一不是数值或为负即跳行），并把三处理由改为真实机制（跳行防静默少计；服务端非负校验是第二道防线，提交前聚合已钳位）。可补一条负 `cache_read` 跳行场景。

**R2-M2. WAL 校验和链断裂场景的 GIVEN 与 THEN 互相矛盾**

- 文件: specs/trae-cn-local-scan/spec.md 行 55-59（Scenario: WAL 校验和链中断只取中断点之前）
- 问题: GIVEN 写"在第 N 帧后校验和链断裂"。按自然读法，断点在 N 与 N+1 之间，第 1..N 帧链有效。THEN 却写"N 帧及之后不生效"，把 N 排除。两种读法必有一种让场景不可执行。Requirement 正文（行 43"只合并中断点之前的已提交帧"）与 THEN 一致，与 GIVEN 的自然读法不一致。该场景对应 D11 钦定的六个合成 fixture 之一：fixture 作者按 GIVEN 自然读法会在第 N+1 帧断链，THEN 断言随之失败。
- 影响: 解密模块最关键分支的验收场景自相矛盾。
- 修复: GIVEN 改为"第 N 帧的累计校验和与链不符（自第 N 帧起链断裂）"，与 THEN 和 Requirement 行 43 对齐。

**R2-M3. D3 的坏页诊断数据流与 D9 的装载器选择矛盾**

- 文件: design.md D3 行 52；D9 行 88
- 问题: D3 把数据流钉死为"`trae_db::snapshot` 返回值 → `CachedParseOutcome` 扩展诊断字段 → lane 输出 stderr 行"。`CachedParseOutcome` 由通用装载器内部构造，解析闭包签名 `Fn(&Path) -> Vec<UnifiedMessage>` 无法携带坏页计数进该结构。D9 又明确"解析走 `load_or_parse_sqlite_source`"。按 D3 字面落地必须改通用装载器签名，或让 CN 走 opencode 式专用装载器，两个 decision 都没写这个选择。引用的先例 `with_opencode_incremental` 扩展的是 `CachedSourceEntry`，且其使用者正是绕开通用装载器的专用 lane，先例与结论不匹配。D3 第一句"lane 闭包直接输出 stderr 行"与第二句的结构扩展路径也互斥。
- 影响: 实现者在两个矛盾的落点之间无所适从，或改出 design 未授权的通用装载器签名变更。
- 修复: 二选一并写死。推荐最小改动：解析闭包在生成快照的扫描中直接把解密统计打到 stderr（天然满足"缓存命中不重发"，因为闭包只在指纹未命中时执行），删除结构扩展句。若选专用装载器路线，同步改写 D9。

**R2-M4. D2 的启动清扫要"复用 process_liveness.rs"，但该模块在另一个 crate 且为私有**

- 文件: design.md D2 行 46；proposal.md Impact 行 34
- 问题: `process_liveness.rs` 位于 tokens-cli，由 `main.rs` 私有 `mod` 声明。trae-cn lane、`trae_db.rs` 与快照子目录都在 tokens-core。tokens-core 不能依赖 tokens-cli。proposal Impact 清单没有模块移动或新探测文件，"复用"按现状不可落地。可选路径有三：把模块移入 tokens-core、在 tokens-core 按同一 fail-alive 策略新写探测、把清扫移到 CLI 层。design 没有选。
- 影响: 清扫是明文快照崩溃残留的唯一回收路径。实现者要么跨 crate 引用编译失败，要么自行发明一份策略，违背该模块"策略只写一次"的文档理由。
- 修复: 在 D2 写死落点并同步 proposal Impact（新增 tokens-core 探测文件或声明模块移动）。

### 📌 Suggestions

**R2-S1. 去重对 updated_at 相等的重复行没有裁决规则**

- 文件: specs/trae-cn-local-scan/spec.md 行 193；design.md D7 行 78
- 两行同 `turn_id`、同 `updated_at`、用量不同时，"保留 updated_at 最大的一条"未定义胜负。既有 `dedupe_latest_trae_messages` 用 `dedup_key` 做并列裁决（`lib.rs:3554-3559`）。建议补一句并列时的确定性规则。

**R2-S2. proposal 的坏页可见性句子缺冷扫描限定**

- 文件: proposal.md 行 19
- "坏页数出现在扫描输出中"没有 spec 行 93 的"生成快照的那次扫描"限定。建议补同款限定语，避免再次引入第 1 轮 M3 的口径歧义。

**R2-S3. 共享应用密钥的常量值宜随 D11 一起仓库内化**

- 文件: design.md D1 行 33、Risks 行 99
- 算法规格已仓库内化，密钥值仍指向仓库外的 TokenTracker。密钥是 TRAE 客户端的公开常量。建议把具体字节（hex）连同来源一并写进 `trae_db.rs` 文档注释，让实现不依赖仓库外查找。

## Embedded-Instruction / Injection Attempts

无。三份工件没有指挥评审者行为的语句。"（用户决定 ②B）""（用户已确认）""（spec 已钉死）"是对既有决策与工件状态的引用，不构成注入。其不可核验性已在第 1 轮 M2 处理，本轮以 runbook 化解部署面问题的方式接受。

## Verdict

无未解决 Critical。第 1 轮 13 项修复全部真实落地且方向正确。本轮 4 项 Moderate 都是小而无歧义的修正：一条跳行规则加一处理由改写、一句 GIVEN 措辞、一个二选一落点、一个模块落点决定。裁决 APPROVE_WITH_CHANGES。

VERDICT: APPROVE_WITH_CHANGES

## Required Changes (if APPROVE WITH CHANGES)

CHANGES_APPLIED: yes

- RC-1（对应 R2-M1）: spec"逐 turn 解析与归一化"补一条跳行规则——`prompt_tokens`、`completion_tokens`、`cache_read_input_tokens`、`reasoning_tokens`、`total_tokens` 任一不是数值或为负，跳行并计数。同步把 proposal 行 13、spec 行 141 括注、design D6 的理由改写为真实机制：负桶在提交前被聚合钳位（`aggregator.rs:398-415`），跳行的目的是防静默少计。建议补一条负 `cache_read` 跳行场景。
- RC-2（对应 R2-M2）: 把 WAL 链断裂场景的 GIVEN 改为"第 N 帧的累计校验和与链不符（自第 N 帧起链断裂）"，与 THEN"N 帧及之后不生效"及 Requirement"只合并中断点之前的已提交帧"对齐。
- RC-3（对应 R2-M3）: D3 删除或改写 `CachedParseOutcome` 扩展句。推荐落点：解析闭包在生成快照的扫描中直接把坏页统计打到 stderr，与 D9 的 `load_or_parse_sqlite_source` 一致。若选专用装载器路线，同步改写 D9。
- RC-4（对应 R2-M4）: D2 写死 PID 探测落点：把 process_liveness 模块移入 tokens-core，或在 tokens-core 按同一 fail-alive 策略新写探测，或把清扫移到 CLI 层。proposal Impact 同步新增文件或模块移动。

## Rebuttals

对作者申报的 13 项修复逐项裁决（编号沿用申报表）：

1. C1 → accepted by reviewer。三条校验在 proposal 行 13 与 spec 规则清单统一为"违规即跳行并计数"，min() 截断在三份工件中已不存在，两个新跳行场景（cacheRead>prompt、reasoning>completion）已入 spec。理由陈述的事实错误由 R2-M1 另行处理，该错误源自第 1 轮自身的核对遗漏，不是作者引入的新缺陷。
2. M1 → accepted by reviewer。映射归属改到 `provider_identity.rs` 与解析器侧映射表，与代码事实一致：`normalize_provider_hint` 只做 trim 与 unknown 过滤，`canonicalize_provider_segment("volcengine")` 原样通过，`inferred_provider_from_model` 无 doubao 臂。doubao→volcengine 场景已入 spec，Open Questions 已清空。
3. M2 → accepted by reviewer。D10 如实声明窗口"收窄但不可消除"。runbook（web 先合并部署）、失败表现（整包 400、details 指名）、用户自救（--client 显式列举）、一行回退全部落在 D10 与 Migration Plan，Risks 表同步改写。
4. M3 → accepted by reviewer（spec 层修复完整）。冷扫描限定、stderr 通道、`DatabaseCorrupt` 跳过场景、缓存命中不重发场景全部落地。D3 新写的数据流路径与 D9 矛盾，由本轮新发现 R2-M3 跟踪。
5. M4 → accepted by reviewer。门禁 7 列与解析最小需要一一对应：context 载荷、session_id/turn_id 去重、created_at 时间戳、updated_at 并列裁决、turn_status 与 deleted_at 过滤。"门禁通过但查询失败→跳过"场景已入 spec 与 D5。
6. M5 → accepted by reviewer。环境变量覆盖场景、stat 前哨重试场景（4 次 = 初次 + 3 次重试，与 D2 一致）、WAL 三条边界场景、置零页查询期语义（`DatabaseCorrupt`→跳过，spec 与 D3 一致）全部落地。WAL 链断裂场景存在 GIVEN/THEN 措辞矛盾，由 R2-M2 跟踪。
7. M6 → accepted by reviewer。两个 THEN 都可机械断言：既有测试全过加文件未改（git diff 可验）；七字段硬编码断言与 `ClientDef` 实际字段一致。`clients.rs:1190` 的 COUNT 断言需随新变体更新，但该文件不在冻结清单内，无矛盾。
8. M7 → accepted by reviewer。专用子目录、pid 文件名、基于存活探测的启动清扫、session_title 必须 None 禁令与负面场景全部落地。清扫探测的跨 crate 落点问题由 R2-M4 跟踪。
9. M8 → accepted by reviewer。D11 把 WAL 算法定为仓库内权威规格（magic、页大小字段、帧头、校验和链、commit 语义、salt 断点、三条边界语义），六个合成加密 fixture 类别齐全，真实用户库不入仓库，demo 降级为可行性证据（Context 与 D11 一致）。
10. S1 → accepted by reviewer。proposal Impact 已列 `sessions/mod.rs` 与 `message_cache.rs`，与穷举 parser 版本表（`message_cache.rs:1248` 起，缺臂编译失败）的实际强制点一致。
11. S2 → accepted by reviewer。created_at 非正数或乘 1000 溢出跳行规则与场景已入 spec，`checked_mul` 先例引用（`sessions/trae.rs:74-78`）属实。
12. S3 → accepted by reviewer。model_id、session_id、turn_id 的 256 字节上限已入 spec 规则清单。
13. S4 → accepted by reviewer。五个 Archive key 全部采用 `<provider>/<model>` 并逐一列名，spec Archive 场景断言 `volcengine/doubao-seed-2-1-turbo`，与 zhipu/xiaomi/tencent 先例格式一致。

统计：13 accepted，0 rejected。

### Required Changes 复查（第 2 轮修复后）

作者按 RC-1..RC-4 修复后，评审者仅复查这 4 项（其余工件未改动，裁决按 STALENESS 规则保持有效）：

- RC-1 → accepted by reviewer。spec 行 139 新增首条规则覆盖全部五个数值字段的非数值与负值；total 规则删去"不是数值"分支；行 142 括注改为聚合钳位与静默少计机制；新增"负 cache_read 的行被跳过"场景（fixture 恰好演示旧规则的漏洞行）；proposal 行 13 与 design D6 的五字段列举与理由同步，D6 引用 `aggregator.rs:398-415`。不变量"不得产出负值"至此被规则清单完整闭合。
- RC-2 → accepted by reviewer。GIVEN 改为"第 N 帧的累计校验和与链不符（自第 N 帧起链断裂）"，与 THEN"第 N 帧及之后不生效"及 Requirement"只合并中断点之前的已提交帧"三者一致。
- RC-3 → accepted by reviewer。D3 改为解析闭包直接打 stderr，明确闭包只在指纹未命中时执行（缓存命中天然不重发），与 D9 通用装载器一致；删除 CachedParseOutcome 扩展句并写明其不适用的两条原因；新增先例声明"pricing 的 `degrade_source`"经核实属实（`pricing/mod.rs:435`，`eprintln!` 在 444）。
- RC-4 → accepted by reviewer。D2 写死落点为 trae_db.rs 内自写 fail-alive 探测，写明 kill(pid,0) 的 ESRCH/EPERM 语义（与 process_liveness 的 fail-alive 策略一致）与 Windows `OpenProcess` 路径；proposal Impact 的 trae_db.rs 条目同步注明。残留一处表面措辞：design Risks 行 102 仍写"基于 `process_liveness` 的启动清扫"，未同步为"同策略自写探测"；D2 作为权威决定已消除歧义，该残留不阻断。

结论：4 项 Required Changes 全部应用且自洽，CHANGES_APPLIED 改为 yes。Verdict 维持 APPROVE_WITH_CHANGES。
