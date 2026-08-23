# 消息页原生能力回归门禁

本文记录 `message_feature` 的 Native Message Center 人工回归范围。它是测试清单，不是通过记录；每次验收必须单独记录浏览器、账号状态和实际结果。

## 正式能力边界

- Reply / At / Love / System：Native 首屏、分页、刷新、服务端已读与 `topBarStore` 权威未读同步。
- Whisper：Hybrid workspace。普通用户、官方助手、未关注和拦截的一对一会话可读取 Native 历史；粉丝团和未知会话进入 Native fallback。
- System：独立文本/链接模型，使用双首屏数据源、单一 legacy cursor 与 `update_cursor`；原版 URL 只作显式失败 fallback。
- Message Settings：Bewly 本地阅读选项与当前原版可见的 Bilibili 服务端设置均位于全局“Bewly 页面 → 消息页”。
- 普通用户和 transient recipient 在开发与打包构建中显示已验证的文本 Composer；图片上传、图片发送及其他未验证写操作不开放。

## 浏览器核心路径

Chrome 必须实际检查：

1. Reply / At / Love / System 首屏、一次分页、刷新、已读和原版 fallback。
2. Whisper 会话首屏、旧会话分页、搜索筛选、普通用户与官方助手只读历史、旧消息分页、图片查看、未知消息降级和 ACK。
3. 会话 URL 的前进/后退、非法参数清理、账号切换和登出后旧响应不落地。
4. 桌面双栏与窄屏 Master–Detail；返回后列表滚动与焦点恢复；reduced motion 无位移。
5. System 不创建 iframe，单 cursor 分页与 `update_cursor` 失败均不伪造成功；NotificationsDrawer 和直接原版页保持独立。
6. 全局消息设置中的 Bewly 本地阅读配置与 Bilibili 服务端设置均可用，服务端值不进入本地 settings。
7. 离开 Notifications 后私信消息缓存释放；重新进入可重新加载；同一时间只有当前 Native Feed 的 visibility listener 和 Observer。
8. Console 无新增阻断级 uncaught error；断网失败保留旧数据且不输出原始 Error。

## 资源与写入检查

- 会话缓存超过设置上限时，淘汰最近最少访问的非当前、非 ACK-in-flight 会话。
- 单会话消息超过设置上限时，仅保留最新消息；后续旧页继续使用独立 `historyBoundarySeqno`。
- 普通用户与 transient recipient 渲染文本 Composer，但不得显示图片选择器；官方助手及 fallback 会话不显示 Composer。
- 只有用户明确提交文本后才允许出现 `web_im/send_msg`；`draw/upload_bfs` 仍不得出现。
- 文本发送只有在 API `code=0` 且服务端历史对账确认后才算成功；HTTP `412` 必须显示为 `risk-control`，不能伪造成功。
- 原版发送入口必须仍然可达。

## 环境矩阵

至少覆盖 light、dark、OLED、disableFrostedGlass、disableShadow，左/右/底 Dock，以及 1536、1280、1024、768 和 mobile 宽度。四套 locale（cmn-CN、cmn-TW、English、jyut）不得出现 raw key 或 `undefined`。

无法实际运行的浏览器或账号态路径必须标记“未验证”，不得从静态检查推断为通过。
