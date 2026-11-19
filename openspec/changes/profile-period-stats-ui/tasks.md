## 1. e2e 基线与失败测试(更新时间)

- [x] 1.1 新建 `tests/e2e/profile-period-stats.spec.ts`,搭合成账号、经 `/api/submit` 造覆盖本周与上月的提交数据、afterAll 清理;写失败测试:e2e updated time shows hours and minutes without seconds、e2e no "Updated" text for user without submissions(按 test-plan 断言正则;确认失败原因是当前只渲染日期)
- [x] 1.2 实现:`ProfileView.tsx` 页头"更新于"改用 `toLocaleString(intlTag(locale), { dateStyle: "medium", timeStyle: "short" })`,沿用 `suppressHydrationWarning`,使 1.1 通过
- [x] 1.3 重构;`bun test`(web)与受影响 e2e 保持绿

## 2. 周期筛选下隐藏会话数提示行

- [x] 2.1 写失败测试:e2e session hint hidden under week period、e2e session hint shown under all-time period、e2e genuine zero session count still displayed under all-time(确认失败原因是当前周期下渲染"0 个会话")
- [x] 2.2 实现:`ProfileView.tsx` 中活跃天数 `Stat` 的 `hint` 改为 `period === "all"` 时才传,使 2.1 通过
- [x] 2.3 重构;全量测试保持绿

## 3. 周期筛选下标注提交次数为全量数据

- [x] 3.1 写失败测试:e2e submission count shows 全部时间 hint under month period、e2e no hint under submissions stat for all-time、e2e "All time" hint renders under en locale(确认失败原因是当前无任何周期标注)
- [x] 3.2 实现:周期非 all 时给提交次数 `Stat` 传 `hint={t("profile.periodAll")}`(复用既有 key,不新增、不改 t.ts),使 3.1 通过
- [x] 3.3 重构;全量测试保持绿

## 4. 收尾验证

- [x] 4.1 运行完整 e2e(`bun run test:e2e`)与 web 单元测试,把 test-plan.md 各行从 🔴 翻 🟢
- [x] 4.2 目测 zh/en 两种 locale 下三个改动点的截图或手动核对,确认样式与活跃天数 hint 一致、无裸 key
