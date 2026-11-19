## Context

`normalize_syntactic()`（`cli/tokens-core/src/lib.rs` 第 132–174 行）负责把各种 model_id 归一到分组名。其中日期后缀剥离分支（第 142–149 行）先切片再验证：

```rust
if name.len() > 9 {
    let potential_date = &name[name.len() - 8..];
    if potential_date.chars().all(|c| c.is_ascii_digit())
        && name.as_bytes()[name.len() - 9] == b'-'
    { ... }
}
```

`String` 切片按字节索引。当 `len - 8` 落在多字节字符中间时，切片在读取 `chars()` 之前就 panic（实测含「正」的 model_id，`len = 25`，`len - 8 = 17` 落在字节 16..19 内）。第 147 行 `&name[..name.len() - 9]` 同样可能 panic。该函数被 `canonical_model_id`、`normalize_model_for_grouping`、`model_alias` 解析共同使用，panic 会终止整个 `tokens submit` 扫描。同函数的 claude `.`→`-` 分支（第 151–167 行）已经用 `chars()` 遍历，正确处理了多字节输入，说明问题只在这一个分支。

## Goals / Non-Goals

**Goals:**
- 消除 `normalize_syntactic` 对任意 UTF-8 输入的 panic。
- 纯 ASCII 输入的归一化输出逐字节不变。
- 修复覆盖全部上层入口（`canonical_model_id`、`normalize_model_for_grouping`、`model_alias`）。

**Non-Goals:**
- 不改任何归一化规则（前缀、日期、`(reasoning-tier)`、claude 重写、`anthropic/` 折叠）。
- 不在扫描层对 model_id 做合法性过滤或跳过。
- 不改上传格式、API、依赖。

## Decisions

**决定 1：先按字节校验，再切片。**

把分支改为：

```rust
if name.len() > 9
    && name.as_bytes()[name.len() - 9] == b'-'
    && name.as_bytes()[name.len() - 8..]
        .iter()
        .all(|b| b.is_ascii_digit())
{
    name.truncate(name.len() - 9);
}
```

理由：尾部 8 字节全为 ASCII 数字时，`len - 8` 与 `len - 9` 必为字符边界，切片/截断天然安全；条件不满足时不发生任何切片。`u8::is_ascii_digit` 与 `char::is_ascii_digit` 对 ASCII 输入等价，对多字节输入返回 false，行为正确。`truncate` 替代重新分配 `to_string()`，少一次拷贝。

被否方案：
- **仅前置 `is_char_boundary(len-8)` / `is_char_boundary(len-9)` 两个检查**：diff 最小、语义等价，但把边界推理分散在原切片代码两侧，读者仍需自行论证「检查通过则两处切片都安全」；统一字节校验把这个论证折叠进条件本身，一次读通。
- **`name.get(len-8..)` 安全切片**：能防 panic，但把「切在字符中间」静默当成「非日期」，语义相同却要多一次 `Option` 分支；且不解决第 147 行同类问题，需两处都改，不如统一字节校验直接。
- **整个函数改 `chars()` 向量**：改动面大，容易碰坏紧密依赖字节序的既有测试（如 claude 数字判断），回归风险与收益不成比例。

**决定 2：回归测试放在 `cli/tokens-core/tests/model_normalization.rs`。**

该文件已覆盖归一化行为，且通过公开 API 断言（不测私有函数），与既有风格一致。注意：`set_prefixes_to_strip` 是 first-call-wins 的进程级 `OnceLock`，同文件既有测试会抢先配置前缀且测试并行运行；新用例的输入不命中任何已配置前缀（含中文/emoji，非 `GATEWAY-A/` 等形态），断言因此与 prefix 配置态无关，测试内需注释说明这一点。

## Risks / Trade-offs

- [尾部含 8 个 ASCII 数字但整体非 ASCII 的名字（`模型A-20260101`）会被剥日期] → 与既有 ASCII 规则一致，spec 场景 2 明确接受该行为，属预期而非回归。
- [`truncate` 改变属主行为] → `name` 是本地 `String`，`truncate` 后继续走 claude 分支与 `anthropic/` 折叠，逻辑顺序不变；既有测试全部跑通即证等价。
- [其他调用点存在类似字节切片隐患] → 本 change 只修已崩溃的这一处；如审查发现同类模式，另行记录，不扩大范围。

## Migration Plan

1. 修改 `normalize_syntactic` 单一分支。
2. 追加测试并运行 `cargo test -p tokens-core`（含 `tests/model_normalization.rs` 全量回归）。
3. 回滚策略：revert 该单点提交即可，无数据或格式迁移。

## Open Questions

无。原始 panic 样本的 model_id 未知（只知道含「正」、`len = 25`），但测试用同构构造（多字节字符使 `len - 8` 落在字符中间）即可覆盖根因，不依赖原样本。
