# 状态机继续复查与覆盖记录

日期：2026-11-10–11。接续[首轮实现](2026-11-10-explicit-state-machines.md)，使用当前工作区源码复查[原始 160 条流程记录](2026-11-10-implicit-state-machines.md)。原始记录是流程索引，不是必须分别创建 160 个枚举的重构任务。

本轮增加 13 个控制器的明确阶段或任务所有权，修复 5 类已确认的边界问题。没有增加依赖、存储字段、网络端点或通用状态机框架。页面仍调用原有公开方法；既有 loading、busy、complete 等展示属性尽量改为只读投影。

## 本轮实现

| 原记录 | 控制器 | 明确的状态与保持的边界 |
| --- | --- | --- |
| B01 | `composables/useStorageLocal.ts` | 初始化只由既有 `loading / loaded / degraded / invalidated` 控制，移除重复的 ready/degraded；初读成功与否只属于启动任务。保留初读前编辑、存储事件覆盖旧快照、退化恢复及销毁守卫。 |
| B06 | `Settings/…/General/SettingsData.vue` | `idle / checking / choosing / enabling / settling / disposed`；每个请求持有操作对象，取消、新界面选择与退出使旧操作失效。后台启用时先发布偏好，再完成初始化，仍须等原请求的最终结果。冲突弹窗的退场挂载是独立的显示状态。 |
| B08 | `components/AppAuthorizationDialog.vue` | 二维码 attempt 持有 `requesting / waiting / scanned / failed / succeeded`、controller、deadline、轮询 timer 与授权 generation；弹窗生命期独立为 active/closing/closed/disposed。继续复用授权协调器与 token 保存规则。 |
| A05 | `composables/usePageModeSwitcher.ts` | 待导航任务携带来源 URL、目标 URL、原偏好和新偏好；pending 从任务是否存在派生。写入成功后只有仍停留在原 URL 才导航。 |
| A07/A09 | `components/IframeDrawer.vue` | 抽屉 `mounting / open / closing / leaving / closed / disposed`；文档 `loading / ready / released`。继续复用文档握手、浏览器历史、Esc 仲裁、媒体释放、焦点及滚动锁。 |
| A12 | `components/PipWindow.vue` | `opening / open / closing / closed`；组件退休与窗口关闭原因独立。迟到的申请结果立即关闭，关闭中的重复事件不重复结算。 |
| G13 | `SearchResults/composables/useLoadMore.ts` | 请求 idle/loading，调度 idle/waiting；补屏任务 rendering/measuring 且 single-flight。多个完成通知共享同一次渲染/测量，reset/dispose 结算全部等待者。分页耗尽与过滤后暂停继续独立。 |
| H04/H05 | `Favorites/useFavoriteFolderManager.ts` | 编辑器 `hidden / loading / editing / failed / closing`；操作 `idle / saving / pinning / cleaning / like / subscribe`。只在 editing 接受保存，保留已确认保存先关闭、再刷新目录的顺序。 |
| H06 | `utils/videoFavoriteSelection.ts` | 活动 `idle / loading / saving / closed`；待验证的目标集合就是 needsVerification 的唯一来源。保留已提交任务锁、账号 lifetime 和精确成员回读。 |
| I10 | `whisper/usePrivateRecipientSearch.ts` | 流水线 `idle / searching / complete`；生命期 `active / paused / disposed`。关注与全站结果独立，仍串行分页、共享缓存，退休后不能恢复订阅。 |
| I11/I12 | `whisper/usePrivateHistorySearch.ts` | 扫描 `idle / debouncing / scanning / waiting / paused / complete / limited / failed`，failed 携带可跳过的游标；上下文 `idle / loading / ready / error`，ready 携带结果。保持每批预算、结果窗口、跨会话公平读取和纯读取不 ACK。 |
| I13/J03 | `whisper/usePrivateSessionActions.ts` | 读取 idle/details/evidence；写入 `idle / sending / verifying / unconfirmed / reported`。验证态携带原 intent；已发送任务的占用独立于已经关闭的菜单。 |
| J04 | `Settings/…/MessagesPage/useMessageServerSettings.ts` | 每字段 `idle / sending / verifying / unconfirmed`，非空状态携带目标值。接受后只回读确认，失败或不匹配保留待确认目标；其他字段继续独立。屏蔽词的现有待确认规则保持。 |

## 已确认的问题

1. **补页完成通知会丢失等待者。** 多次调用在 nextTick 后分别写入同一个 RAF 完成回调，后一次覆盖前一次；重置或销毁不能结算所有等待。现共享完整的补屏任务，旧任务结束也不会清除新任务。
2. **举报证据验证失败仍留下可提交数组。** 读取先赋给 messageKeys，再验证格式；失败后 perform 只看到非 null。现只在验证成功后发布证据，重读前撤销旧证据。
3. **消息设置接受后的确认边界不足。** code=0 后回读仍是旧值也会返回成功；回读失败则释放 pending，后续可再次发送。现必须读到目标值才确认，未确认时后续调用只读取、不再发送原写入。
4. **页面模式的迟到落盘会覆盖新导航。** flush 返回后只检查设置值，没有检查当前页面。现保留用户的偏好，同时阻止旧来源任务把已经离开的页面导航回来。
5. **云同步设置的迟到检查可继续开启。** 界面退出或取消后，availability 返回仍可能发送 enable 或打开冲突框。现由当前操作对象决定是否能继续，退休回调不能发送后续请求、关闭新弹窗或显示旧错误。

回归使用真实控制器及组件，网络、窗口和时钟使用夹具；没有执行真实账号操作。新增/扩展了补页并发结算、非法举报证据、设置接受后回读、迟到页面导航、退出/取消云同步检查，以及替换二维码后旧成功响应不可保存的检查。

## 原清单的覆盖与保留决定

本轮重新检索运行时代码中的代次、在途任务、终态、资源句柄和生命周期入口；状态模式检索得到 194 个候选文件，并与原清单及回归组交叉核对。这是候选索引，不是新增状态机或缺陷数量。下表覆盖原清单全部编号，说明不同审查深度；不表示每一行的每个执行排列都已测试。

| 领域/原编号 | 本轮复查方式及当前决定 |
| --- | --- |
| A01–A12 启动/导航 | 展开模式切换、抽屉、PiP、文档握手；启动/遮罩/导航恢复由现有实际模块回归覆盖。文档 ID、session、revision 和 history entry 是协议身份，保持独立。 |
| B01–B15 存储/共享状态 | 展开本地初始化、云同步 UI、二维码授权、顶栏 broker、待看投影和本地历史 owner；完整回归包括设置 epoch、初读恢复、云同步配额、租约、账号及 worker 重启。 |
| C01–C23 播放 | 复查首轮听视频/宽屏改造；回归覆盖准备取消、BTR owner、媒体键、CDN、模式交接、水合、控制栏、质量记忆、自动移除和响度资源。用户意图、媒体身份、DSP 图资源是正交维度，保留各自 owner。 |
| D01–D12 预览/图片 | 展开共享预览会话的恢复预算；回归覆盖卡片装载、直播有界换源、图片查看器、懒图片、封面/头像及元信息 single-flight。现有每资源任务记录承担阶段，不为每个缓存增加枚举。 |
| E01–E15 浮层/搜索/设置 | 复查首轮页面/Dialog 改造，展开确认队列、顶栏 hover 控制器；回归覆盖 IME、搜索取消、历史锁、主题/设置退出及定向定位。鼠标、焦点和键盘持有可同时发生，保留为独立输入。 |
| F01–F16 手势/动效 | 首轮 Dock、页面过渡及共享动效继续回归；涵盖取消/反向、选择锚点、图片手势、弹簧、删除与共享占用。位移、速度、指针、动画 owner 是上下文，不能压成一个 phase。 |
| G01–G16 Feed/搜索 | 首轮推荐/动态 owner 回归，本轮补齐搜索补屏 single-flight；其余 Feed 的迟到账号响应、重复游标、空批次、缓存租约和隐藏取消由已有真实模块检查覆盖。 |
| H01–H13 资料库 | 展开收藏编辑、成员选择、批量选择与已确认写入；回归覆盖目录/筛选/分页、历史清空、待看刷新、批量任务恢复和停止。不同列表读取与用户写入继续独立。 |
| I01–I15 消息读取 | 本轮展开剩余用户搜索、历史扫描/上下文、会话操作；首轮分页/ACK/轮询及工作区路由、选择/卸载、缓存释放一起回归。 |
| J01–J14 写入/评论 | 首轮文本/图片接受边界与本轮会话/设置确认共同回归；评论、转发、投票、关系写入及 MAIN 桥由现有实际控制器/组件检查覆盖。已发事务不因视图退休而伪装成未发。 |
| K01–K09 基础设施 | 展开确认队列、regex host、共享资源/租约的结算；回归覆盖端口取消、共用读取、最后消费者释放、几何帧与焦点/滚动占用。小型 Promise/Map、引用计数和 AbortController 保留集中结算。 |

补记容易从主入口清单里忽略的从属实现：`background/contentScriptRefreshPrompt.ts` 的启动 ping/提示/批量刷新归入 A01/H11；`inject/nativeCommentWake.ts` 归入 C08 的原生唤醒；`inject/movedPgcReact.ts` 归入 C07/C12 的已迁移原生节点事件所有权。它们有独立源码与回归入口，不另虚增三份完整业务状态机。

仍保留原表示的复杂模块并非遗漏：

- `topBarStateBroker.ts` 的持久化租约由串行 key 队列、refreshId 与 version 原子仲裁；改变其存储形状会扩大协议范围，本轮保留并验证失效与接管。
- `videoVisitHistory.ts` 已将发送内容、operationId、epoch、ACK revision 和 Promise 绑定到同一个 inFlight owner；待写编辑与已发待确认允许并存，继续分开。
- `useTopBarInteraction.ts` 的触发器悬停、弹窗悬停、键盘持有及当前显示不是互斥阶段；计时器和清理已集中。将它们合并会丢失输入信息。
- 原生播放器/响度处理及评论桥仍用实际 DOM/媒体 owner、generation、AbortSignal 与集中 cleanup 表达所有权；本轮没有重写外部播放器协议。
- 已有状态枚举与任务记录足够表达的筛选扫描、批量标签任务，以及简单缓存、观察器和局部反馈继续复用，避免只为统一写法增加第二套状态。

## 验证

- 完整 `pnpm test` 通过：selected-p2 **687/687**，私信 **129/129**，以及 targeted-fixes、通知、颜色、图标、样式失效、界面缩放和许可证检查。
- 完整测试后，进一步核对云同步后台“先发布偏好、再初始化”顺序；当前组件的取消、退出、启用成功和初始化失败四条路径定向重跑通过，保留最终失败反馈。其余生产代码未再改动。
- `pnpm lint`、`pnpm typecheck`、`pnpm knip` 与 `git diff --check` 通过；末次云同步补充也重新执行 lint 与类型检查。

第一轮 selected-p2：685 通过、1 失败；唯一失败是 WatchLater 列表夹具在固定 60ms 后查询 CSS 退场尚未结束的按钮，单独重跑通过。该列表行为检查现以微任务结算退场，保持 Vue 的异步交接，仍保留真实退场钩子与外层 Transition；动画行为由专门回归验证。中间一次将退场同步化造成 Vue 重入的夹具错误也已修复。最后完整运行全部通过，没有通过延长任意等待或修改生产动效来消除失败。

没有运行生产构建或浏览器视觉验收，没有启动/重启开发 watcher，没有提交或推送。静态盘点加行为回归不能证明所有可能的网络/文档/设备交错绝对无遗漏；可以确认本轮发现的问题已纳入可重复检查，原清单全部领域都有明确覆盖和保留决定。
