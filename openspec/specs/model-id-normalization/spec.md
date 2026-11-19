# model-id-normalization Specification

## Purpose

TBD — 此新能力的主规格由 change `fix-multibyte-model-id-panic` 的增量创建，增量未提供 `## Purpose` 正文。请补充描述：该能力做什么、为何存在。

## Requirements

### Requirement: 非 ASCII model_id 不得导致归一化 panic

`normalize_syntactic` 及其全部公开上层入口（`canonical_model_id`、`normalize_model_for_grouping`、`model_name_for_grouping`，以及经由该函数构建索引的 `model_alias` 解析）处理含多字节字符（中文、emoji 等任意 UTF-8）的 model_id 时，MUST 正常返回结果，MUST NOT panic。`model_name_for_grouping` 本身只是转发到 `normalize_model_for_grouping`，无独立归一化逻辑。

#### Scenario: 含中文的 model_id 正常归一化
- **GIVEN** 一个含中文字符的 model_id，其字节长度大于 9，且 `len - 8` 落在多字节字符中间（如含「正」的名字）
- **WHEN** 调用 `canonical_model_id` 与 `normalize_model_for_grouping`
- **THEN** 两者均正常返回小写化的原名，不剥离任何后缀，进程不 panic

#### Scenario: 含 4 字节 emoji 的 model_id 正常归一化
- **GIVEN** 一个含 emoji（4 字节 UTF-8 序列）的 model_id，其字节长度大于 9，且 `len - 8` 落在该 4 字节序列中间
- **WHEN** 调用 `canonical_model_id`
- **THEN** 返回小写化的原名，不剥离任何后缀，进程不 panic

#### Scenario: 边界对齐但尾部非数字的多字节名不剥后缀
- **GIVEN** 一个多字节 model_id，`len - 8` 恰为字符边界，但末 8 字节不全为 ASCII 数字（如 `正正正-模型ABCDE` 类构造，尾部含非数字字节）
- **WHEN** 调用 `canonical_model_id`
- **THEN** 返回小写化的原名，不剥离任何后缀，进程不 panic

#### Scenario: 长度不足的多字节短名正常返回
- **GIVEN** 一个字节长度小于等于 9 的多字节 model_id（如 `模型a`）
- **WHEN** 调用 `canonical_model_id`
- **THEN** 返回小写化的原名，进程不 panic

#### Scenario: 结尾为 `-` 加 8 数字的中文名按 ASCII 规则剥离
- **GIVEN** 一个含中文且以 `-` 加 8 个 ASCII 数字结尾的 model_id（如 `模型A-20260101`），尾部 8 字节全为 ASCII 数字、第 9 字节为 `-`
- **WHEN** 调用 `canonical_model_id`
- **THEN** 返回剥离 `-20260101` 后的小写名（`模型a`），与既有 ASCII 规则一致，进程不 panic

### Requirement: ASCII model_id 的归一化结果保持不变

修复只改安全边界检查方式，MUST NOT 改变任何纯 ASCII model_id 的归一化输出，包括日期剥离、前缀剥离、`(reasoning-tier)` 剥离与 claude `.`→`-` 重写。下述场景的期望值即既有行为的固化基线。

#### Scenario: 既有 ASCII 归一化行为回归
- **GIVEN** ASCII model_id `GATEWAY-A/GPT-5.4-20261001(HIGH)`（在 `GATEWAY-A/` 前缀已配置的状态下）
- **WHEN** 调用 `canonical_model_id`
- **THEN** 返回 `gpt-5.4`

#### Scenario: 既有 claude 日期与点号重写行为回归
- **GIVEN** ASCII model_id `claude-opus-4.6-20260101`
- **WHEN** 调用 `normalize_model_for_grouping`
- **THEN** 返回 `claude-opus-4-6`

#### Scenario: 尾部非日期的 ASCII 名不剥后缀
- **GIVEN** 一个长度大于 9 但尾部 8 字节不全为 ASCII 数字，或第 9 字节不是 `-` 的 ASCII model_id（如 `gpt-5.4-high`）
- **WHEN** 调用 `canonical_model_id`
- **THEN** 返回小写原名 `gpt-5.4-high`，不剥离任何后缀
