# 复杂流程状态显式化

日期：2026-11-10。依据[改造前源码盘点](2026-11-10-implicit-state-machines.md)的八组优先边界实施。盘点中的 160 条是流程、子流程与简单模式族，不是 160 项必须重写的实现；这次处理跨上下文、写入确认、恢复和可中断切换的复杂控制边界。

后续对剩余流程的实施、修复和全领域回归见[11 月 11 日继续复查](2026-11-11-state-machine-recheck.md)。

## 状态与代码落点

| 边界 | 现在的状态表达 | 代码 |
| --- | --- | --- |
| 听视频 | 操作 `idle / recovering / preparing / returning`，准备态携带自己的 AbortController、完成 Promise 和检查点保留意图；页面生命期 `active / suspended / disposed`。音源 `loading / ready / exhausted / released` 与播放接管 `preparing / committed` 独立。 | `src/contentScripts/listenControl.ts`、`listenAudio.ts` |
| 设置写入 | `idle / sending / retryable / importing`，所有非空状态携带原始 request；未知回执重试保留 operationId。作用域 `active / draining / invalidated`，普通卸载继续排空已捕获编辑，失效上下文终止。 | `src/composables/useSettingsStorage.ts` |
| 云同步 | 主流程 `disabled / initializing / ready / recovering / incompatible / conflict`；上传 `idle / uploading`；初始化 token 与 Promise 属于同一任务记录。逐字段 pending/quota/failed/synced 仍是独立维度。 | `src/background/settingsCloudSync.ts` |
| 私信与通知读取 | 私信首屏 `idle / initial / refresh`；共享分页 `ready / complete / stalled`；原 `noMore / paginationStalled` 只读派生，不再分别写。通知已读提交 `idle / uncommitted / committed / reconciled`。 | `src/utils/paginationState.ts`、私信 `usePrivateMessages.ts / usePrivateSessions.ts`、通知 `useNotificationFeed.ts / notificationFeedState.ts` |
| 私信轮询 | 生命周期 `inactive / active / disposed`；调度 `idle / waiting / polling`，等待态拥有 timer，执行态拥有 Promise 和一次恢复意图。一个时刻不会同时拥有独立的等待和执行状态。 | `src/contentScripts/views/Notifications/whisper/usePrivateMessagePolling.ts` |
| 私信发送 | 会话操作 `idle / text / image`；文本投递 `sending / accepted / confirmed`；图片任务独立记忆 `unsent / accepted`，重试由服务端接受边界决定。图片草稿用判别联合保证失败态有 failureKind、其他态没有失败原因。 | `src/contentScripts/views/Notifications/whisper/experimental/usePrivateMessageWrites.ts / privateMessageWriteTypes.ts` |
| 宽屏准备与水合 | 每次准备独立拥有 page `loading / ready`、layout `waiting / stabilizing` 和媒体/结构观察结果；水合任务拥有既有 phase、暂停监听、timer 和一次 reload 预算；旧任务不能消费新任务资源。 | `src/utils/bewlyWidescreen.ts`、`src/utils/bewlyWidescreen/sidebar.ts / types.ts` |
| 宽屏骨架 | 表面 `hidden / visible / leaving`；撤销策略 `layout / playing / suppressed`。表面存在、媒体播放与布局完成各有含义。 | `src/utils/bewlyWidescreen/loading.ts` |
| 推荐与动态 | 推荐请求 `initializing / idle / loading / filtering / filling / suspended`；整个递归补屏链持有加载态，删除额外递归锁。动态请求 `boot / idle / initial / older / newer`；阅读缺口、游标和请求失败继续独立。返回最新的滚动任务携带原 feed token、类型和 UP 主。 | `src/contentScripts/views/Home/useForYouRecommendations.ts`、`src/contentScripts/views/Moments/Moments.vue` |
| 页面过渡 | 目标 `initial / preparing / ready / disposed`；退场任务 `waiting / leaving`，携带目标、元素、动画与 done；入场动画同样有明确 owner。 | `src/composables/useReadyPageTransition.ts` |
| Dialog 与 Dock | Dialog `mounting / open / confirming / closing / closed`；Dock `expanded / hiding-content / preparing-collapse / collapsing / collapsed / expanding`。原显示、方向与交互标记从阶段派生。 | `src/components/Dialog.vue`、`src/components/Dock/Dock.vue` |

不引入状态机依赖，不更改持久化协议、网络端点、动画时长或样式。继续使用现有账号/generation 守卫、AbortController、原生媒体桥、motionPriority、scrollIntent、页面过渡及已有 API/存储控制器。原版 BTR 的保留暂停 owner 路径保持原样。

云同步初始化必须同步开始读取持久化冷却，再发布新状态；把初始化额外延到微任务会使旧配额错误先被状态发布覆盖。现有“从旧错误恢复冷却”行为检查保护这一顺序。

## 确认并修复的边界问题

1. 听视频的恢复请求晚于用户启动并取消的新操作返回时，原先只检查是否有当前 session/pending，可能重新打开旧检查点。现在只有仍持有 recovering 操作的回调能恢复。
2. 音频 metadata 已就绪后被取消，原 commit 仍可应用播放意图。released 是终态，不能再 commit；原有预载、CDN 切换和暂停定位保持。
3. 私信文本已收到 code=0 后，历史对账抛错会落入通用发送失败分支，恢复草稿并允许再次发送。现在 accepted 边界不会倒退到发送失败，只保留未确认状态。
4. 宽屏骨架退场期间开始新准备，原先因 overlay 仍存在而直接复用，旧 fade 完成后会删除它。现在新准备取得独立表面 owner，旧完成回调不能删除新表面。
5. 页面入场动画在作用域销毁时取消，原拒绝回调仍可能调用 done。销毁先释放 owner，再取消动画，退休视图不再收到完成回调。
6. 推荐等待异步滚动条测量后未重新检查请求身份，可能给已经离开的 Feed 写入分页耗尽或发起旧补屏。现在 Web/APP 路径都在测量返回后重新核对 owner。
7. 动态“返回最新”在平滑滚动结束后无条件刷新，可能刷新已经切换的分类、UP 主或离开的页面。现在完成回调验证最初的 Feed 身份，旧完成也不能解锁新的滚动任务。

这些结论来自源码与受控网络/媒体/时钟夹具，不是实站写入或视觉验收结果。

## 验证与测试维护

- 听视频原有 6 项行为检查保留，补充取消后迟到恢复、已取消音轨不能提交。
- 私信 128 项通过，新增“服务端接受后对账拒绝不能重发”，保留图片上传失败、发送失败、确认失败的分阶段重试检查。
- 通知夹具通过；共享分页与已读提交保持既有 UI/控制器结果。
- 宽屏加载、迟到原生媒体、水合暂停/恢复、一次 reload 预算等现有 DOM/受控时钟检查通过；补充旧骨架退场不能删除新准备。
- 页面连续性 8 项通过，补充销毁中的入场取消；推荐 owner 检查补充迟到几何测量不得提交耗尽；动态导航补充跨分类及卸载后的迟到滚动。
- 完整 `pnpm test` 用于定位回归；大型 selected-p2 完整运行得到 682 通过、2 失败，云同步时序与测试依赖修复后分别重跑 cloud 4 项、user profile 5 项通过。新增动态导航单项另外执行；不是再次完整运行整组后的统计。
- `verify-targeted-fixes` 修复后完整通过；整组中的通知、颜色、图标、样式失效、界面缩放与许可检查通过。
- `pnpm lint`、`pnpm typecheck`、`pnpm knip` 与 diff 空白检查通过；最后新增的动态导航和 Home 夹具已定向重跑，末次改动的 lint 与完整类型检查通过。

删除了只绑定旧布尔变量写法的扫描断言；对应准备就绪、可见性、水合预算和导航等待由已有真实控制器检查覆盖。Dock 的夹具改为读取源码中的状态与派生声明，避免另造一组独立布尔值。测试加载器登记共享分页模块，Home 连续性夹具补齐无关子组件依赖。

没有运行生产构建或操作浏览器。视觉与真实 B 站页面交接仍需用户在现有开发产物更新后验收；本次没有启动、重启开发 watcher，也没有提交或推送。
