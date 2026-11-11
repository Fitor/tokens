Feature: 团队管理
  用户需要把开发者组织成团队，以便按团队维度查看用量并管理成员。
  创建团队的人是该团队的 admin。

  Background:
    Given 用户 "songlin" 已登录

  Rule: 创建者成为团队的 admin

    Scenario: 创建团队
      When "songlin" 创建名为 "Neon Ravens" 的团队
      Then "Neon Ravens" 创建成功且状态为 active
      And "songlin" 在该团队中的角色是 admin
      And 该团队的成员数为 1

    Scenario: 一个用户只能属于一个团队
      Given "songlin" 已属于团队 "Neon Ravens"
      When "songlin" 尝试创建另一个团队
      Then 操作被拒绝并提示需要先退出当前团队

  Rule: 只有 admin 和 subadmin 可以修改团队资料与邀请成员

    Scenario Outline: 按角色区分资料修改权限
      Given "songlin" 在团队 "Neon Ravens" 中的角色是 <角色>
      When "songlin" 修改团队名称为 "Neon Ravens 2"
      Then 该操作<结果>

      Examples:
        | 角色     | 结果   |
        | admin    | 成功   |
        | subadmin | 成功   |
        | member   | 被拒绝 |

    Scenario: 普通成员不能邀请他人
      Given "songlin" 在团队 "Neon Ravens" 中的角色是 member
      When "songlin" 尝试邀请他人加入该团队
      Then 该操作被拒绝

  Rule: 团队可见性由 admin 在建团时选择，admin 与 subadmin 可修改

    Scenario: 建团时选择公开
      Given "songlin" 在建团表单中把可见性选为 "public"
      When "songlin" 提交表单
      Then 该团队的可见性是 "public"
      And 该团队出现在其他人的团队榜筛选项中

    Scenario: 未选择可见性时按私有落库
      Given "songlin" 提交建团表单时没有选择可见性
      When 团队被创建
      Then 该团队的可见性是 "private"

    Scenario: subadmin 可以修改可见性
      Given "mika" 是团队 "Neon Ravens" 的 subadmin
      When "mika" 把可见性改为 "private"
      Then 该团队的可见性是 "private"

    Scenario: 普通成员不能修改可见性
      Given "rin" 是团队 "Neon Ravens" 的普通成员
      When "rin" 尝试修改团队可见性
      Then 操作被拒绝
      And 该团队的可见性保持不变

  Rule: 邀请通过可搜索的下拉多选完成

    已注册用户从下拉列表中勾选，每个选项左侧有勾选框，选中即计数、可再点取消。
    未注册用户仍可通过输入完整邮箱地址来邀请。归一化、去重、回填的服务端逻辑
    不因交互方式改变而变化。
    下拉只展示用户名与显示名，不回显绑定邮箱；输入完整邮箱时按邮箱精确匹配，命中已注册用户也按其用户名展示，不回显邮箱。

    Scenario: 从下拉列表勾选一位已注册用户
      Given "songlin" 是 "Neon Ravens" 的 admin
      And 存在用户名为 "mikoto" 的账号
      When "songlin" 打开邀请对话框并勾选 "mikoto"
      Then 已选计数变为 1
      And 提交后 "mikoto" 收到一条待处理邀请

    Scenario: 输入内容实时筛选下拉选项
      Given "songlin" 是 "Neon Ravens" 的 admin
      And 存在用户名为 "mikoto" 的账号
      When "songlin" 在邀请对话框中输入 "mik"
      Then 下拉选项中显示 "mikoto"

    Scenario: 下拉列表不展示成员的绑定邮箱
      Given "songlin" 是 "Neon Ravens" 的 admin
      When "songlin" 在邀请对话框中输入 "mik"
      Then 下拉选项只显示用户名与显示名
      And 不显示任何成员的绑定邮箱

    Scenario: 输入完整邮箱匹配到已注册用户时按用户名展示
      Given "mikoto" 的绑定邮箱是 "mikoto@example.com"
      And "songlin" 是 "Neon Ravens" 的 admin
      When "songlin" 在邀请对话框中输入完整邮箱 "mikoto@example.com"
      Then 下拉中显示用户 "mikoto"
      And 不回显其绑定邮箱

    Scenario: 勾选多位成员后一次提交
      Given "songlin" 是 "Neon Ravens" 的 admin
      When "songlin" 在下拉中勾选 3 位成员
      Then 已选计数变为 3
      And 提交后系统创建 3 条待处理邀请

    Scenario: 取消勾选后计数减少
      Given "songlin" 已勾选 2 位成员
      When "songlin" 取消勾选其中 1 位
      Then 已选计数变为 1

    Scenario: 输入完整邮箱且未匹配到任何账户时可邀请该邮箱
      Given "songlin" 是 "Neon Ravens" 的 admin
      When "songlin" 在邀请对话框中输入 "chen.wei@example.com"
      And 没有任何已注册账户匹配该输入
      Then 列表底部出现「邀请该邮箱」选项
      And 选择该选项后系统为 "chen.wei@example.com" 创建待处理邀请

    Scenario: 该邮箱随后完成注册
      Given "songlin" 已邀请邮箱 "chen.wei@example.com" 且该邀请仍待处理
      When 该邮箱完成注册
      Then 新账号可以看到这条待处理邀请

    Scenario: 对同一人重复勾选不会重复创建邀请
      Given "songlin" 已邀请 "mikoto" 且该邀请仍待处理
      When "songlin" 再次通过下拉勾选 "mikoto" 并提交
      Then "mikoto" 在此团队下仍然只有 1 条待处理邀请

    Scenario: 同时勾选用户名路径与邮箱路径指向同一人时只产生一条
      Given "songlin" 是 "Neon Ravens" 的 admin
      And "mikoto" 是已注册用户，其绑定邮箱是 "mikoto@example.com"
      When "songlin" 在下拉中勾选 "mikoto" 并通过「邀请该邮箱」选择 "mikoto@example.com"
      Then 系统只创建 1 条待处理邀请

    Scenario: 输入一个不存在的用户名时下拉显示无匹配
      Given "songlin" 是 "Neon Ravens" 的 admin
      When "songlin" 在邀请对话框中输入 "nobody-here"
      Then 下拉显示无匹配账户
      And 不出现可提交的选项

    Scenario: 普通成员不能打开邀请对话框
      Given "songlin" 在 "Neon Ravens" 中的角色是 member
      When "songlin" 打开团队管理页
      Then 邀请成员按钮不可用或不可见

    Scenario: 非管理员不能调用用户搜索接口
      Given "rin" 在任何团队中都不是 admin 或 subadmin
      When "rin" 直接请求用户搜索接口
      Then 请求返回 403

    Scenario: 邀请过期后不再可用
      Given 存在一条 7 天前发出且未被处理的邀请
      When 受邀人尝试接受该邀请
      Then 操作被拒绝并提示邀请已过期

    Scenario: 接受邀请只会生效一次
      Given 存在一条待处理邀请
      When 受邀人连续两次提交接受
      Then 该用户只被加入团队一次


  Rule: 邀请可指定加入后自动归入的分组

    邀请时可以选择一个本团队的活跃分组。受邀人接受后自动成为该分组成员；
    未选择分组，或接受时该分组已解散 / 已删除，则只加入团队。

    Scenario: 接受邀请后自动加入指定分组
      Given "songlin" 是 "Neon Ravens" 的 admin
      And 存在分组 "frontend"
      And 存在用户名为 "mikoto" 的账号
      When "songlin" 邀请 "mikoto" 并指定加入后归入 "frontend"
      And "mikoto" 接受该邀请
      Then "mikoto" 属于团队 "Neon Ravens"
      And "mikoto" 属于分组 "frontend"

    Scenario: 未选择分组时接受邀请只加入团队
      Given "songlin" 是 "Neon Ravens" 的 admin
      And 存在用户名为 "mikoto" 的账号
      When "songlin" 邀请 "mikoto" 且不指定分组
      And "mikoto" 接受该邀请
      Then "mikoto" 属于团队 "Neon Ravens"
      And "mikoto" 不属于任何分组

    Scenario: 邀请发出后分组被解散则接受后只加入团队
      Given "songlin" 已邀请 "mikoto" 并指定加入后归入 "frontend"
      And 该邀请仍待处理
      When admin 解散分组 "frontend"
      And "mikoto" 接受该邀请
      Then "mikoto" 属于团队 "Neon Ravens"
      And "mikoto" 不属于任何分组

    Scenario: 指定其他团队的分组或无效分组时邀请被拒绝
      Given "songlin" 是 "Neon Ravens" 的 admin
      When "songlin" 邀请他人并指定一个无效分组
      Then 该操作被拒绝

    Scenario: 邀请对话框可选择自动归入分组
      Given "songlin" 是 "Neon Ravens" 的 admin
      And 存在分组 "frontend"
      When "songlin" 打开邀请对话框
      Then 可以看到可选的自动归入分组选择器

  Rule: 受邀人在团队页查看待处理邀请

    邀请区是单容器，每条 pending 且未过期的邀请渲染为一项。
    展示不依赖用户的团队归属状态；目标团队解散的邀请照常展示，不加区分提示。

    Scenario: 有待处理邀请时显示邀请区
      Given "mikoto" 名下有一条 "Neon Ravens" 的 pending 邀请，expiresAt 为当前时间加 3 天
      When "mikoto" 打开 /teams
      Then 页面渲染邀请区，可见文本包含 "Neon Ravens"
      And 该项的到期元素 data-testid="invite-expires" 的 data-expires 等于该 expiresAt 的 ISO UTC 日期
      And 该项含「接受」按钮
      And 该项不含「拒绝」按钮

    Scenario: 已在团队时邀请区仍显示
      Given "mikoto" 已属于团队 "Sky Wolves"
      And "mikoto" 名下另有 "Neon Ravens" 的一条 pending 邀请
      When "mikoto" 打开 /teams
      Then 页面同时渲染 "Sky Wolves" 团队面板和含 "Neon Ravens" 一项的邀请区

    Scenario: 过期邀请不渲染
      Given "mikoto" 名下只有一条已过期的邀请
      When "mikoto" 打开 /teams
      Then 页面不渲染邀请区

  Rule: 受邀人接受待处理邀请

    「接受」调用 POST /api/invitations/{id}/accept。成功后页面刷新，
    该条邀请从邀请区移除；邀请区仅当无剩余待处理邀请时消失。
    失败时显示既有本地化文案，服务端校验逻辑不变。

    Scenario: 接受成功入团
      Given 无团队的 "mikoto" 在邀请区看到 "Neon Ravens" 一项，名下无其他邀请
      When "mikoto" 点「接受」
      Then POST /api/invitations/{id}/accept 返回 200
      And 页面刷新为 "Neon Ravens" 团队面板
      And 整个邀请区消失

    Scenario: 多条邀请时接受其一
      Given "mikoto" 名下有 "Neon Ravens" 和 "Sky Wolves" 两条 pending 邀请
      When "mikoto" 接受 "Neon Ravens"
      Then "Neon Ravens" 一项从邀请区移除
      And "Sky Wolves" 一项仍显示

    Scenario: 已在团队时接受被阻断
      Given "mikoto" 已属于 "Sky Wolves"，名下有 "Neon Ravens" 的 pending 邀请
      When "mikoto" 点「接受」
      Then 界面显示 teams.err.leaveBeforeAccept 对应的本地化提示
      And 邀请区该项保留

    Scenario: 未验证邮箱时接受被阻断
      Given "mikoto" 未验证邮箱，名下有一条按邮箱地址发出的 pending 邀请
      When "mikoto" 点「接受」
      Then 界面显示 teams.err.verifyEmailFirst 对应的本地化提示
      And team_members 表不新增行

    Scenario: 页面停留期间邀请过期
      Given "mikoto" 打开 /teams 时看到一条 pending 邀请，该邀请在其停留期间到达 expiresAt
      When "mikoto" 点「接受」
      Then 界面显示 teams.err.inviteExpired 对应的本地化提示
      And team_members 表不新增行

    Scenario: 目标团队已解散时接受被阻断
      Given "mikoto" 名下有一条 pending 邀请，其目标团队状态为 disbanded
      When "mikoto" 打开 /teams 并点「接受」
      Then 邀请区照常展示该邀请
      And 界面显示 teams.err.notActive 对应的本地化提示
      And team_members 表不新增行

  Rule: 邀请邮件链接携带回跳参数直达团队页

    链接主机取 NEXT_PUBLIC_URL，未设置时回退 http://localhost:3000。
    回跳参数经既有 returnTo 消毒链路，登录或注册成功后落到 /teams。

    Scenario: 已注册账号收到登录回跳链接
      Given 环境设置 NEXT_PUBLIC_URL=https://tokens.example.com
      And "Neon Ravens" 的 admin 邀请已注册账号 "mikoto"
      When 系统发送邀请邮件
      Then 邮件正文中的链接为 https://tokens.example.com/login?returnTo=%2Fteams

    Scenario: 未注册邮箱收到注册回跳链接
      Given 环境设置 NEXT_PUBLIC_URL=https://tokens.example.com
      And admin 按邮箱地址邀请一个未注册地址
      When 系统发送邀请邮件
      Then 邮件正文中的链接为 https://tokens.example.com/register?returnTo=%2Fteams

    Scenario: 未配置站点地址时回退本地默认
      Given 环境未设置 NEXT_PUBLIC_URL
      When 系统发送邀请邮件
      Then 邮件正文中的链接以 http://localhost:3000 开头，路径和查询参数不变

    Scenario: 登录成功后落到团队页
      Given "mikoto" 从邀请邮件进入 /login?returnTo=%2Fteams
      When "mikoto" 登录成功
      Then 浏览器跳转到 /teams，邀请区可见

    Scenario: 注册成功后落到团队页
      Given 一个未注册邮箱持有 pending 邀请，邮件链接为 /register?returnTo=%2Fteams
      When 该邮箱用此链接完成注册
      Then 浏览器落到 /teams，邀请区可见
      And 账号此时未验证邮箱，点「接受」时按「未验证邮箱时接受被阻断」场景被拦截

  Rule: 邮箱行与用户行指向同一个人时，保留创建时间较早的一条

    同一团队下理论上可能同时存在一条未关联用户的邮箱邀请，和一条指向该用户的用户邀请
    （并发提交，或日后引入换绑邮箱功能）。归一化必须给出确定的胜者，且置 superseded 要
    发生在回填之前，否则回填会先撞上 (team_id, invited_user_id) 的部分唯一索引。

    Scenario: 邮箱那条更早时保留邮箱那条并回填
      Given "Neon Ravens" 下存在一条指向邮箱 "chen.wei@example.com" 的待处理邀请，创建于 3 月 1 日
      And 同一团队下存在一条指向用户 "chenwei" 的待处理邀请，创建于 3 月 5 日
      And 邮箱 "chen.wei@example.com" 归属于用户 "chenwei"
      When 系统对该团队执行邀请归一化
      Then 3 月 5 日那条被置为 "superseded"
      And 3 月 1 日那条被回填 invited_user_id 指向 "chenwei"
      And "chenwei" 在此团队下只有 1 条待处理邀请

    Scenario: 用户那条更早时保留用户那条且不做回填
      Given "Neon Ravens" 下存在一条指向用户 "chenwei" 的待处理邀请，创建于 3 月 1 日
      And 同一团队下存在一条指向邮箱 "chen.wei@example.com" 的待处理邀请，创建于 3 月 5 日
      And 邮箱 "chen.wei@example.com" 归属于用户 "chenwei"
      When 系统对该团队执行邀请归一化
      Then 3 月 5 日那条被置为 "superseded"
      And 3 月 1 日那条保持不变，仍指向 "chenwei"
      And "chenwei" 在此团队下只有 1 条待处理邀请

    Scenario: 两条创建时间完全相同时按 id 较小者取胜
      Given "Neon Ravens" 下的邮箱行与用户行指向同一个人且创建时间完全相同
      When 系统对该团队执行邀请归一化
      Then id 较小的那条胜出，另一条被置为 "superseded"

    Scenario: 归一化不会因唯一索引冲突而失败
      Given "Neon Ravens" 下的邮箱行与用户行指向同一个人
      When 系统对该团队执行邀请归一化
      Then 归一化成功完成，不产生唯一索引冲突错误

    Scenario: 回填尚未完成时受邀人仍能看到邀请
      Given 邮箱 "chen.wei@example.com" 有一条待处理邀请且 invited_user_id 仍为空
      And "chen.wei@example.com" 已注册并验证了该邮箱
      When 她查看自己的待处理邀请列表
      Then 该条邀请出现在列表中

    Scenario: 归一化可以重复执行
      Given "Neon Ravens" 下的邀请已经归一化过一次
      When 系统再次对该团队执行邀请归一化
      Then 结果与第一次完全相同

  Rule: admin 最多指派 2 个 subadmin

    Scenario: 指派第一个 subadmin
      Given "Neon Ravens" 当前没有 subadmin
      When admin 把一名成员指派为 subadmin
      Then 该成员的角色变为 subadmin

    Scenario: 指派第三个 subadmin 被拒绝
      Given "Neon Ravens" 已有 2 个 subadmin
      When admin 尝试把第三名成员指派为 subadmin
      Then 操作被拒绝并提示 subadmin 名额已满

    Scenario: 并发指派不会突破名额上限
      Given "Neon Ravens" 已有 1 个 subadmin
      When admin 同时对两名成员发起指派
      Then 该团队的 subadmin 总数不超过 2

    Scenario: subadmin 不能指派其他 subadmin
      Given "songlin" 在 "Neon Ravens" 中的角色是 subadmin
      When "songlin" 尝试把一名成员指派为 subadmin
      Then 该操作被拒绝

  Rule: 团队必须先解散才能删除

    Scenario: 未解散的团队不能删除
      Given "Neon Ravens" 状态为 active 且有 8 名成员
      When admin 尝试删除该团队
      Then 操作被拒绝并提示需要先解散团队

    Scenario: 解散会清空全部成员
      Given "Neon Ravens" 有 8 名成员
      When admin 解散该团队
      Then 该团队状态变为 disbanded
      And 该团队的成员数为 0
      And 原先的 8 名成员都不再属于任何团队

    Scenario: 解散会同时清掉 admin 自己的成员身份
      Given "songlin" 是 "Neon Ravens" 的 admin
      When "songlin" 解散该团队
      Then "songlin" 不再属于任何团队
      And 该团队没有任何 admin 成员行

    Scenario: 解散后创建者仍可删除团队
      Given "Neon Ravens" 已解散且成员数为 0
      And 该团队已经没有任何成员行可用于角色鉴权
      When 创建者删除该团队
      Then 该团队被删除

    Scenario: subadmin 不能解散团队
      Given "songlin" 在 "Neon Ravens" 中的角色是 subadmin
      When "songlin" 尝试解散该团队
      Then 该操作被拒绝

    Scenario: subadmin 不能删除团队
      Given "Neon Ravens" 已解散且成员数为 0
      And "songlin" 曾是该团队的 subadmin
      When "songlin" 尝试删除该团队
      Then 该操作被拒绝

  Rule: 未解散的团队必须恰有一个 admin

    Scenario: admin 不能直接退出团队
      Given "songlin" 是 "Neon Ravens" 的 admin
      When "songlin" 尝试退出该团队
      Then 操作被拒绝并提示需要先移交 admin 或解散团队

    Scenario: 移交 admin 后原 admin 可以退出
      Given "songlin" 是 "Neon Ravens" 的 admin
      When "songlin" 把 admin 移交给另一名成员
      Then "songlin" 的角色变为 member
      And "songlin" 可以退出该团队
