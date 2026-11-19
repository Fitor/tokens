## Why

个人主页(`web/src/components/profile/ProfileView.tsx`)的三处展示与数据语义不一致:

1. 页头的"更新于"只显示日期,丢失了 `updatedAt` 时间戳中已有的时分信息,用户无法判断最近一次提交发生在当天什么时间。
2. 周期选择为"本周"或"本月"时,活跃天数卡片下的会话数显示为"0 个会话"。服务端因会话数只存储在 submission 级、无法按周期切片而有意识地返回 0,但前端无条件渲染该行,把"不可得"暴露成了"为 0"。
3. 提交次数在任意周期下始终显示全量累计值。`submissions` 表每用户一行、`submit_count` 为累计计数器,`daily_breakdown` 不含每日提交次数,周期内提交次数从现有数据中无法算出,而界面未向用户区分这一差异。

## What Changes

- 页头"更新于 {date}"的时间格式从仅日期改为日期加时分,沿用现有 `suppressHydrationWarning` 处理方式;`updatedAt` 数据链路不变。
- 周期不为"全部时间"时,活跃天数卡片下的会话数提示行整体隐藏,不再显示"0 个会话"。
- 周期不为"全部时间"时,提交次数卡片在数字下方追加一行 hint 文案"全部时间",复用既有 i18n key `profile.periodAll` 与活跃天数 hint 相同的样式,表明该值为全量累计;不引入新的持久化数据。

## Capabilities

### New Capabilities
- `web-profile-stats-display`: 个人主页头部统计区的展示规则——更新时间精度、周期筛选下不可按周期切片的指标(会话数、提交次数)的呈现方式。

### Modified Capabilities

(无。现有 specs 中没有覆盖个人主页展示的条目。)

## Impact

- `web/src/components/profile/ProfileView.tsx`:页头时间格式、活跃天数 hint 的条件渲染、提交次数卡片的周期态。
- `web/src/lib/i18n/t.ts`:不新增 key,复用既有 `profile.periodAll`。
- 不改后端查询、不改数据库 schema、不影响 embed 卡片(`getUserEmbedStats` 系列)与排行榜。
