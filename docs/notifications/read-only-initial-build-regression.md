# 消息页只读初始版本回归门禁

本文记录 `message_feature` 的 Native Read-Only Initial Build 人工回归范围。它是测试清单，不是通过记录；每次验收必须单独记录浏览器、账号状态和实际结果。

## 正式能力边界

- Reply / At / Love：Native 首屏、分页、刷新、服务端已读与 `topBarStore` 权威未读同步。
- Whisper：Hybrid workspace。普通用户和官方助手可读取 Native 会话与历史并执行 ACK；未关注、拦截、粉丝团和未知会话回退原版。
- System：完整原版 iframe。
- Message Settings：Bewly 本地阅读选项位于全局“Bewly 页面 → 消息页”；服务端设置打开原版 `#/config`。
- 文字、图片、表情发送和其他私信写操作：仅由原版页面负责。Native 页面产生 `send_msg` 或 `upload_bfs` 请求：不得出现。

## 浏览器核心路径

Chrome 与 Firefox 都必须实际检查：

1. Reply / At / Love 首屏、一次分页、刷新、已读和原版入口。
2. Whisper 会话首屏、旧会话分页、搜索筛选、普通用户与官方助手只读历史、旧消息分页、图片查看、未知消息降级和 ACK。
3. 会话 URL 的前进/后退、非法参数清理、账号切换和登出后旧响应不落地。
4. 桌面双栏与窄屏 Master–Detail；返回后列表滚动与焦点恢复；reduced motion 无位移。
5. System iframe、NotificationsDrawer、原版消息入口与主题同步不回归。
6. 全局消息设置的八项本地阅读配置和原版服务端设置入口可达。
7. 离开 Notifications 后 iframe 与私信消息缓存释放；重新进入可重新加载；同一时间无隐藏 visibility listener 或 Observer。
8. Console 无新增阻断级 uncaught error；断网失败保留旧数据且不输出原始 Error。

## 资源与写入检查

- 会话缓存超过设置上限时，淘汰最近最少访问的非当前、非 ACK-in-flight 会话。
- 单会话消息超过设置上限时，仅保留最新消息；后续旧页继续使用独立 `historyBoundarySeqno`。
- Native 页面不渲染 textarea、发送按钮或图片选择器。
- Network 中 Native 页面不得出现 `web_im/send_msg` 或 `draw/upload_bfs`。
- 原版发送入口必须仍然可达。

## 环境矩阵

至少覆盖 light、dark、OLED、disableFrostedGlass、disableShadow，左/右/底 Dock，以及 1536、1280、1024、768 和 mobile 宽度。四套 locale（cmn-CN、cmn-TW、English、jyut）不得出现 raw key 或 `undefined`。

无法实际运行的浏览器或账号态路径必须标记“未验证”，不得从静态检查推断为通过。
