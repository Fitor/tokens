## Context

个人主页页头与统计区由 `web/src/components/profile/ProfileView.tsx` 渲染,数据来自 `web/src/lib/publicProfileData.ts` 的服务端查询。关键事实:

- `updatedAt` 已是完整 ISO 时间戳,仅展示层用 `toLocaleDateString` 截断为日期;渲染处已有 `suppressHydrationWarning`。
- `submissions` 表每用户一行,`submit_count`、`session_count` 均为累计计数器;`daily_breakdown` 按天只存 tokens/cost/messages。因此周期内会话数与提交次数无法从现有数据算出。
- 服务端在周期筛选下已将会话数置 0(L631-632,注释言明"hide"),但前端无条件渲染 hint;`rank` 在周期筛选下置 null 是现成的"不可得则不显示"先例。
- `Stat` 组件(`ProfileView.tsx` L89-106)已支持 `hint` 属性,渲染为数字下方一行 `text-xs text-muted-foreground`,活跃天数的"n 个会话"即用此机制。

## Goals / Non-Goals

**Goals:**
- 页头"更新于"显示到分钟。
- 周期筛选下,会话数提示行隐藏。
- 周期筛选下,提交次数卡片标明为全量数据。

**Non-Goals:**
- 不新增持久化数据、不改数据库 schema、不改服务端查询。
- 不处理周期内提交次数的真实计算(需记录每次提交时间戳,代价不成比例)。
- 不改动 embed 卡片(`getUserEmbedStats` 系列)与排行榜页面。

## Decisions

1. **时间格式**:`toLocaleString(intlTag(locale), { dateStyle: "medium", timeStyle: "short" })` 一次调用产出"日期+时分",避免手工拼接两种格式;沿用外层已有的 `suppressHydrationWarning`。
   - 备选:分别调用 date/time 再拼接——被否,两次 locale 格式化产物顺序不保证符合语言习惯。
2. **会话数隐藏**:在 `ProfileView` 中当 `period !== "all"` 时不传 `hint`。判断放展示层而非服务端,因为服务端已用 0 表达"不可得",展示层持有 `period` prop,职责清晰。
3. **提交次数标注**:周期非 all 时给提交次数 `Stat` 传 `hint`,文案取既有 i18n key `profile.periodAll`(中文"全部时间"),复用与活跃天数相同的 hint 样式。
   - 备选一:置灰数值——被否,弱化后用户更难读到数字,且需要新的样式钩子。
   - 备选二:整个卡片隐藏——被否,提交次数对用户是核心全量指标,隐藏损失信息。
   - 备选三:记录提交时间戳以支持周期切片——被否,见 Non-Goals。
4. **i18n**:复用既有 key `profile.periodAll`(中文"全部时间",英文"All time"),不新增 key。hint 与周期选择器共用同一字面量是有意的:两处指向同一语义("全部时间"),共享文案保证措辞一致。若未来发现歧义,再拆分为带上下文的独立 key。t.ts 已有英文回退机制兜底。

## Risks / Trade-offs

- [服务端与浏览器时区/ locale 不一致导致 hydration 告警] → 已有 `suppressHydrationWarning` 包裹,沿用。
- [用户仍把"34 全部时间"误读为周期数据] → hint 与活跃天数 hint 同层级同样式,语义为脚注;比现状(无任何区分)严格改进。
- [其他语言缺 `profile.periodAll` 翻译] → t.ts 现有回退机制兜底到英文;该 key 已存在中英条目,实际风险为零。

## Migration Plan

纯前端展示改动,一次部署即生效;回滚即还原 `ProfileView.tsx`(t.ts 不改动)。

## Open Questions

(无——三个决策均已在探索阶段与用户确认。)
