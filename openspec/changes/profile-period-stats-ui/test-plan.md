## Test Plan

所有场景为 `ProfileView` 的渲染行为,项目无组件级 DOM 测试设施(bun:test 无 testing-library),统一映射到 Playwright e2e,沿用 `tests/e2e/profile-membership.spec.ts` 的合成账号(t5e2e-*)与清理模式。新建 spec:`tests/e2e/profile-period-stats.spec.ts`。数据通过 `/api/submit` 造一次带 `date_start/date_end` 覆盖本周与上月的提交。

| Requirement | Scenario | Test File | Test Name | Initial State |
|-------------|----------|-----------|-----------|---------------|
| specs/web-profile-stats-display/spec.md → 更新时间显示到时分 | 有提交记录时显示到分钟 | tests/e2e/profile-period-stats.spec.ts | e2e: updated time shows hours and minutes without seconds | 🔴 red |
| specs/web-profile-stats-display/spec.md → 更新时间显示到时分 | 无提交记录时不显示更新时间 | tests/e2e/profile-period-stats.spec.ts | e2e: no "Updated" text for user without submissions | 🔴 red |
| specs/web-profile-stats-display/spec.md → 周期筛选下隐藏不可切片的会话数 | 周期为本周时隐藏会话数 | tests/e2e/profile-period-stats.spec.ts | e2e: session hint hidden under week period | 🔴 red |
| specs/web-profile-stats-display/spec.md → 周期筛选下隐藏不可切片的会话数 | 周期为全部时间时显示会话数 | tests/e2e/profile-period-stats.spec.ts | e2e: session hint shown under all-time period | 🔴 red |
| specs/web-profile-stats-display/spec.md → 周期筛选下隐藏不可切片的会话数 | 全量会话数真实为 0 | tests/e2e/profile-period-stats.spec.ts | e2e: genuine zero session count still displayed under all-time | 🔴 red |
| specs/web-profile-stats-display/spec.md → 周期筛选下标明提交次数为全量数据 | 周期为本月时标注全量语义 | tests/e2e/profile-period-stats.spec.ts | e2e: submission count shows 全部时间 hint under month period | 🔴 red |
| specs/web-profile-stats-display/spec.md → 周期筛选下标明提交次数为全量数据 | 周期为全部时间时维持现状 | tests/e2e/profile-period-stats.spec.ts | e2e: no hint under submissions stat for all-time | 🔴 red |
| specs/web-profile-stats-display/spec.md → 周期筛选下标明提交次数为全量数据 | 英文语言下使用既有回退文案 | tests/e2e/profile-period-stats.spec.ts | e2e: "All time" hint renders under en locale | 🔴 red |

## Coverage Notes

- 时分断言不锚定具体钟点(提交时间即"现在"),断言形态:时间文本匹配 `/\d{1,2}:\d{2}/` 且不匹配秒(`/\d{2}:\d{2}:\d{2}/`);12/24 小时制由 locale 决定,两种形态均接受该正则。
- en locale 场景沿用 `tests/e2e/i18n-locale.spec.ts` 的 locale 切换方式,断言提交次数卡片下出现字面量 "All time" 且无裸 key `profile.periodAll`。
- "真实为 0 的会话数"场景用仅提交过一次、`session_count` 为 0 的合成数据,断言 all-time 下仍渲染"0 个会话"行(与周期筛选下的隐藏形成对照)。
- 本计划为下限:实现时可补充 `ProfileView` 相关单元测试,无需在此登记。
