# 隐式状态机源码盘点

此文保留改造前的盘点快照。优先边界的实施、修复与验证见[复杂流程状态显式化](2026-11-10-explicit-state-machines.md)。

日期：2026-11-10。范围：当前工作区 `src/` 中的扩展运行时代码，包括 Vue 组件、composable、store、background、content script、MAIN world 注入与共享工具。以本次读取的源码为准。

这份清单包含 **160 条流程审查记录：137 条隐式表示（I），23 条混合表示（M）**，分为 11 个领域。记录单位是可讨论的流程、子流程或同形态的小流程族，不是互不重叠的独立状态机数量。一个大型业务会被拆成多个正交维度；一组简单重复流程会归并，并列出实例。

判定标准：流程保留了控制历史，同一事件在不同阶段会走不同分支；阶段由多个字段、资源句柄、Promise/Map 是否存在、计时器、DOM 状态或回调顺序共同表达。本文使用扩展状态机的视角：账号、游标、版本、位置、计数是上下文，未把每个可能数值当作一个离散状态。

- **I（隐式）**：没有一个足以描述流程阶段的集中状态表示，需要组合字段与控制流还原。
- **M（混合）**：已经有 phase/status/mode 或消息阶段，但完整行为还依赖额外标记、任务所有权或其他模块。列入不表示其现有实现错误。
- 普通偏好开关、纯派生 computed、静态配置、一次无额外控制历史的 await、数学/DSP 累加器、纯解析器不作为独立工作流计数。
- 不包含依赖库、生成的 extension 产物、其他 worktree、测试脚本或 B 站/BTR 内部状态机；只列本应用与它们交互时拥有的状态。

方法：全量文件索引和多轮状态声明、赋值、generation/epoch、请求、计时器、监听器与生命周期检索；对复杂控制器逐段阅读，对简单重复模式按流程族整理。不是仅搜变量名后把每个 boolean 算一个状态机。以下箭头是源码控制流程的抽象命名，不代表源码已有对应枚举，也不是逐条运行验证过的执行轨迹。

## 优先梳理的八个边界

| 记录 | 建议明确的状态边界 | 原因与关键不变量 |
| --- | --- | --- |
| C01–C05 | 听视频准备、原生 owner 交接、音频持有、返回与恢复 | 只有当前 attempt/gate 能提交或释放；播放意图、会话阶段和舞台退场是不同维度。 |
| B01–B03 | 设置读取、可展示、可持久化、patch 在途、epoch 重置 | 能展示本地快照不等于可以回写默认值；旧 epoch 的确认不能消费新修改。 |
| B04–B06 | 同步生命周期与逐字段上传 | enabled/initializing/ready 与 pending/quota/failed/synced 必须分层；不能压成一个总 loading。 |
| I05–I09 | 会话目录、正文窗口、阅读位置、ACK、轮询资格 | 读历史、刷新最新、是否位于最新区域和是否可 ACK 是正交状态；应保留各自 owner。 |
| J01–J04 | 未发送、已发送、已接受未确认、对账完成 | 传输失败与确认失败影响重试规则；图片的 failed 还要结合 failureKind，不能单看 status。 |
| C07–C13 | 宽屏等待结构、节点迁移、水合、揭示、切稿件、退出 | DOM 存在、原生组件拥有节点、布局稳定、内容已加载不是同一件事。 |
| G01/G08/G09/H02 | Feed 请求、游标提交、过滤扫描、阅读缺口 | 耗尽、无进展、预算暂停、过滤后为空、请求失败有不同后续事件，不能互换。 |
| E01/E02/F01 | 页面/弹窗/Dock 进出与中途反向 | UI 意图和当前绘制阶段需要分开；done、close、焦点恢复和资源释放有明确结算点。 |

优先级依据是跨模块协调、取消与恢复路径、持久化/写入后果、共享影响面，不是已证实的缺陷严重级别。这次没有把任一可疑组合判定为已复现 bug。

## 领域索引

| 编号 | 领域 | 流程记录 |
| --- | --- | ---: |
| A01–A12 | 启动、页面导航与跨上下文 | 12 |
| B01–B15 | 设置、存储、授权与共享状态 | 15 |
| C01–C23 | 播放接管、原生页面与音频 | 23 |
| D01–D12 | 预览、图片与媒体资源 | 12 |
| E01–E15 | 浮层、搜索与设置交互 | 15 |
| F01–F16 | 手势、可中断动画与布局 | 16 |
| G01–G16 | 推荐、动态与搜索读取 | 16 |
| H01–H13 | 收藏、历史与稍后再看 | 13 |
| I01–I15 | 通知、私信阅读与搜索 | 15 |
| J01–J14 | 发送、写入与原生评论 | 14 |
| K01–K09 | 共享基础设施 | 9 |

## 源码清单

主链接定位到状态声明或关键转换入口。表中提到的同类实例属于该条流程族；调用同一共享控制器的组件不重复算一份实现。

### 启动、页面导航与跨上下文

| 编号/表示 | 流程与源码入口 | 状态承载 | 主要转换与边界 |
| --- | --- | --- | --- |
| A01 · I | [内容脚本启动与卸载](/Users/young/个人项目/bewlyCat/src/contentScripts/index.ts:93) | contentScriptAbortController / mountedVueApp / contentScriptReady；设置、样式和挂载就绪标记 | 启动 → 等设置/样式 → 挂载 → ready；上下文失效或清理 → 终止。原生页入口 nativeAppearance.ts 也有 started/startupAttempted。 |
| A02 · I | [启动遮罩与原页可见性交接](/Users/young/个人项目/bewlyCat/src/contentScripts/pageLoadingGuard.ts:33) | active / contentVisible / headerVisible；bewlyBootOverlay.ts 的 removed/removalTimer | 隐藏原页 → 内容/页头分别就绪 → 退遮罩 → dispose；失败路径恢复可见性。 |
| A03 · I | [播放器模式应用的外层调度](/Users/young/个人项目/bewlyCat/src/contentScripts/index.ts:429) | playerModeSettingsReady / playerModeGeneration / awaitingNavigationMedia / pendingNavigationVideoInfo / retryTimer | 等待设置与媒体 → 发起模式应用 → 等确认/重试 → 应用或放弃；换视频废弃旧 generation。 |
| A04 · I | [主页面与首页 Tab 交换](/Users/young/个人项目/bewlyCat/src/contentScripts/views/App.vue:157) | activatedPage / displayedPage / isPageSwitching / pendingPageScroll；Home.vue 的 homeActive/pendingTabScrollTop | 导航意图 → 退出旧页 → 交换 displayedPage/恢复滚动 → 进入新页；新导航可覆盖未完成意图。底层转换另见 useReadyPageTransition。 |
| A05 · I | [页面模式持久化后导航](/Users/young/个人项目/bewlyCat/src/composables/usePageModeSwitcher.ts:35) | pageModeChangePending / switchingPageMode / widescreenEngaged / previousPageMode | 选模式 → 更新偏好 → flush → 导航；flush 失败恢复旧偏好；播放页另走宽屏进入/退出与 DOM 确认。 |
| A06 · I | [iframe 页面加载与命令交接](/Users/young/个人项目/bewlyCat/src/components/IframePage.vue:27) | iframeGeneration / showLoading / commandTimer / iframeScrollSyncFailed / documentHost | 新导航 → 加载 → 文档绑定 → 命令/滚动同步 → 就绪；换地址使旧 load/应答失效，卸载释放媒体。 |
| A07 · I | [iframe 抽屉、浏览器历史与 Esc 仲裁](/Users/young/个人项目/bewlyCat/src/components/IframeDrawer.vue:42) | show / showIframe / renderIframe / closing / disposed / iframeGeneration / historyEntryDeparted / escapeArbitrationTimers | 打开/压入历史 → 装载 → 可交互；Esc 先处理内部优先态，再关抽屉；退场后释放 iframe 并恢复来源 URL/焦点。 |
| A08 · M | [iframe 文档身份握手](/Users/young/个人项目/bewlyCat/src/utils/iframeDocument.ts:13) | request/hello/challenge/ready 消息；binding / sessionId / revision / challenges | 未绑定 → hello → challenge → ready/绑定；load、reconnect、clear 使旧会话失效。消息 phase 已命名，主客两侧的整体状态仍由字段推断。 |
| A09 · M | [iframe 播放上下文握手](/Users/young/个人项目/bewlyCat/src/logic/iframePageState.ts:26) | playerBinding / parentGeneration / requestId；IframeDrawer.vue 的 playerContextRequest | ready/request → 父级 context → 子级绑定与 mode 回报；按文档、会话、generation、请求身份拒绝旧消息。 |
| A10 · I | [播放历史前后导航与返回恢复](/Users/young/个人项目/bewlyCat/src/composables/usePlaybackTrail.ts:17) | navigationTimer / needsRestore；utils/videoPlaybackHistory.ts 的 pending、generation、游标 | 记录访问 → 发起前进/后退 → 等原页切换或新文档 → 恢复；超时/新导航/销毁结束旧任务。 |
| A11 · I | [动态详情 iframe 与父级图片查看器交接](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Moments/useMomentDetail.ts:24) | selectedMoment / detailFrameLoaded / detailFrameGeneration / detailFocusGeneration；opusDetailDrawerLayout.ts 的 viewerHostedByParent/ACK timer | 选择动态 → 装载/布局就绪 → 聚焦 → 关闭释放；图库请求父级托管，ACK 后等关闭回传，超时走本地查看器。 |
| A12 · I | [文档画中画窗口](/Users/young/个人项目/bewlyCat/src/components/PipWindow.vue:26) | disposed / closing / closed / window 与 iframe 引用 | 申请窗口 → 建宿主/装载 → 打开 → 关闭 → 释放 iframe 与监听；关闭到达时仍可能处于异步创建阶段。 |

### 设置、存储、授权与共享状态

| 编号/表示 | 流程与源码入口 | 状态承载 | 主要转换与边界 |
| --- | --- | --- | --- |
| B01 · M | [通用本地存储初始化与恢复](/Users/young/个人项目/bewlyCat/src/composables/useStorageLocal.ts:218) | initializationState + ready/initialReadSucceeded/dirtyBeforeReady/degraded/hasDegradedEdits/disposed；自身写回队列 | loading → loaded/degraded/invalidated；初读前编辑、存储事件、失败后恢复分别改变合并与写回规则。 |
| B02 · M | [设置 canonical 副本与本地 patch](/Users/young/个人项目/bewlyCat/src/composables/useSettingsStorage.ts:175) | initializationState；currentEpoch/retiredEpochs/revision；inFlightPatch/failedPatchRequest；ready/persistenceReady/importingOperation | 读取权威快照 → 合并本地改动 → 发 patch → 确认；失败保留待写，epoch 重置使旧读写失效；展示就绪与持久化就绪独立。 |
| B03 · I | [后台设置写入、导入与重置仲裁](/Users/young/个人项目/bewlyCat/src/background/settingsStorageCoordinator.ts:34) | 写入 Promise 链 / pendingResets / resetGeneration / epoch / revision / fieldVersions | 排队 → 校验 epoch/operation → 原子更新权威版本 → 回执；重置阻断旧操作，云端合并保留并发本地编辑。 |
| B04 · I | [云同步主生命周期](/Users/young/个人项目/bewlyCat/src/background/settingsCloudSync.ts:45) | initialized / enabled / ready / generation / initializationPromise / restartAfterInitialization / preferenceRead* | 读开关 → 停用或初始化 → ready；初始化失败退避/活动恢复；停用或新意图使旧初始化失效。 |
| B05 · M | [云同步逐字段上传与配额退避](/Users/young/个人项目/bewlyCat/src/background/settingsCloudSync.ts:63) | flushInProgress / pendingUploads / blockedUploads / uploadStates / incompatibleFields / retryAttempt | pending → 上传 → synced；配额阻塞 → 等 alarm/退避 → pending；失败/不兼容单独保留。settingsCloudSyncWrites.ts 另维护 blockedUntil/nextCycleAt。 |
| B06 · I | [云同步启用与冲突选择 UI](/Users/young/个人项目/bewlyCat/src/components/Settings/PluginComponentsAndPages/General/SettingsData.vue:36) | cloudSyncRequestPending / showCloudSyncConflictDialog / availabilityError / controlRevision | 检查空/兼容/不兼容快照 → 直接启用或等待 push/pull 选择 → 提交 → 完成/错误；新选择使旧回执失效。 |
| B07 · I | [设置跨上下文存储中继](/Users/young/个人项目/bewlyCat/src/background/settingsContextRelay.ts:22) | processing Set / request-response 记录 / timer / handler 注册 | 发布请求 → 等响应 → 成功/失败/超时清理；同一记录处理期间不重复执行。 |
| B08 · I | [APP 二维码授权 UI](/Users/young/个人项目/bewlyCat/src/components/AppAuthorizationDialog.vue:30) | authorizationTimer / generation / succeeded / closing / controller / authCode | 取二维码 → 轮询扫码/确认 → 保存令牌 → 成功关闭；过期/错误/取消/替换二维码结束旧轮询。授权协调器本身另列为显式实现。 |
| B09 · I | [APP token 刷新事务](/Users/young/个人项目/bewlyCat/src/utils/authProvider.ts:129) | 旧令牌快照 / auth generation / 持久化身份 / single-flight | 发现将过期或失效 → 刷新 → 再核对原令牌归属 → 提交新令牌或作废；并发刷新复用任务。 |
| B10 · I | [登录状态与账号切换](/Users/young/个人项目/bewlyCat/src/stores/topBarStore.ts:169) | loginStateGeneration / fetchUserInfoPromise / fetchUserInfoGeneration / 用户资料与登录状态 | 未知/读取中 → 登录或未登录；cookie 变化重查；换号清理账号数据并拒绝旧响应。loginStateWatcher.ts 合并 cookie 事件。 |
| B11 · I | [跨标签页刷新租约](/Users/young/个人项目/bewlyCat/src/background/topBarStateBroker.ts:200) | refreshStartedAt / refreshId / refreshVersion / version / snapshotVersion / updatedAt | 新鲜缓存 → 使用；过期 → claim → 刷新持有 → publish/release；失效递增 version，租约超时才允许接管。topBarSharedRefresh.ts 负责恰好一次结算。 |
| B12 · I | [共享主题消费者的活跃与 stale](/Users/young/个人项目/bewlyCat/src/background/stateConsumers.ts:53) | consumers 中的文档/topic/active/stale/隐私上下文；dirty/persistQueued | 注册 → 活跃投递；隐藏 → 标 stale；重新活跃 → 对账；释放/关闭标签页 → 移除消费者。utils/stateConsumer.ts 是页面端。 |
| B13 · I | [稍后再看权威快照与页面投影](/Users/young/个人项目/bewlyCat/src/background/watchLaterStateBroker.ts:32) | 每账号 Entry、in-flight reads、confirmed changes、epoch/revision；logic/watchLaterState.ts 的 pendingMembers/pendingCount/generation/contextInvalidated | 恢复/拉取 → 合并已确认写入 → 发布新快照；过期或失效再读；换号/上下文失效终止旧投影；成员读取与数量读取有各自需求。 |
| B14 · I | [本地观看记录写入确认](/Users/young/个人项目/bewlyCat/src/utils/videoVisitHistory.ts:35) | pending / inFlight / epoch / historyGeneration / invalidated；后台 resetGeneration 与串行队列 | 编辑缓冲 → 批量写入 → ACK/版本确认 → 清除；重置、关闭、失效与重读参与合并。后端见 videoVisitHistoryCoordinator.ts/database.ts。 |
| B15 · I | [顶栏共享资源刷新调度](/Users/young/个人项目/bewlyCat/src/stores/topBarStore.ts:98) | pendingResources / sharedStateMessagingUnavailable / updateTimerGeneration / topic 需求 / invalidation | 有消费者且可见 → 领取租约/读取 → 发布 → 定时再刷新；隐藏、失效、换号停止；动态/未读/稍后再看使用不同资源版本。 |

### 播放接管、原生页面与音频

| 编号/表示 | 流程与源码入口 | 状态承载 | 主要转换与边界 |
| --- | --- | --- | --- |
| C01 · I | [听视频会话总控](/Users/young/个人项目/bewlyCat/src/contentScripts/listenControl.ts:44) | state / pending / media / playingAudio / failed / leaving / unloading / recovering / suspendedNative | 原生视频 → 取音源/预载 → 获得 gate → 挂起原生 owner → 独立音频；返回、换视频、pagehide、恢复与失败重试都能改变此流程。 |
| C02 · I | [独立音轨预备与 CDN 切换](/Users/young/个人项目/bewlyCat/src/contentScripts/listenAudio.ts:7) | committed / loaded / index / exhausted / AbortSignal | 预载候选 → metadata 就绪 → commit 后恢复播放意图；error 切下一来源；候选耗尽失败；abort 清空媒体。预载完成与正式接管是两个阶段。 |
| C03 · I | [后台听视频 gate 与检查点](/Users/young/个人项目/bewlyCat/src/background/listenPlayback.ts:14) | gates / units / checkpoints / 串行队列 | 授予当前 tab 的网络规则 → 保存会话 → 恢复/续期 → 按 gate 释放；路由改变或关 tab 清理，旧 gate 不能释放新 owner。 |
| C04 · I | [原生媒体挂起、恢复与媒体键所有权](/Users/young/个人项目/bewlyCat/src/inject/videoMetadata.ts:342) | native/BTR owner、listenOwner、挂起/恢复请求；listenMediaSession.ts 的 owner token 与旧 metadata | 校验当前稿件与媒体 → 暂停/移交 → 音频持有 → 恢复原生/释放；桥接请求与返回值共同决定接管是否成功。 |
| C05 · I | [听视频返回检查点恢复与舞台退场](/Users/young/个人项目/bewlyCat/src/contentScripts/listenReturn.ts:18) | 恢复快照、signal、原生媒体就绪；listenControl.ts 的 leave/controller/stageHost | 保存返回意图 → 等原生媒体 → 应用位置/倍速/音量/播放 → 清理；旧舞台等画面后退场，新会话可收回尚在退场的舞台。 |
| C06 · I | [听视频控制栏与歌词/唱片交互](/Users/young/个人项目/bewlyCat/src/contentScripts/listenNativeBar.ts:26) | dragRatio / native/audio 绑定；ListenPlayer 的 playing/buffering/异步 metadata；ListenLyrics 的滚动跟随资源 | 普通播放 → 进度拖动预览 → 释放提交；音频事件同步控件；歌词读取/切轨与手动滚动跟随、唱片起停各自有独立生命周期。 |
| C07 · I | [宽屏进入、就绪门槛与退出](/Users/young/个人项目/bewlyCat/src/utils/bewlyWidescreen.ts:48) | pageReadyForLayout / playerReadyForLayout / contentReadyForLayout / structureReadyForLayout / pendingApplication / session.current | 等待原生结构 → 迁移并建壳 → 布局确认 → 揭示；退出恢复节点；导航期间可暂停并重建。不能把四个 ready 布尔当四个互斥阶段。 |
| C08 · M | [宽屏侧栏水合与恢复预算](/Users/young/个人项目/bewlyCat/src/utils/bewlyWidescreen/sidebar.ts:342) | hydratedTabs / timedOut / reloadRequested / timer；resolveWidescreenSidebarHydrationPhase | hydrating/pending → complete；超时 → recovering → stopped；页面隐藏暂停，重新显示重开预算，迟到节点仍可补齐。 |
| C09 · I | [宽屏加载覆盖层](/Users/young/个人项目/bewlyCat/src/utils/bewlyWidescreen/loading.ts:17) | overlay / fadeTimer / preparationFallbackTimer / exitTimer / loadingMayDismissOnPlaying / loadingSuppressedUntilExit | 准备显示 → 骨架可见 → 可撤销门槛满足 → 退场；用户退出后抑制重现；自动连播 playing 与初始布局就绪是不同条件。 |
| C10 · I | [宽屏 DOM 发现与稳定观察](/Users/young/个人项目/bewlyCat/src/utils/bewlyWidescreen.ts:171) | discovering / discoveryTimer / 已锚定播放器及祖先观察器 | 有界全局发现 → 找到可用宿主 → 稳定局部观察；宿主被原站重建/导航 → 重新发现；退出统一释放。 |
| C11 · M | [宽屏分栏/铺满可中断转换](/Users/young/个人项目/bewlyCat/src/utils/bewlyWidescreen/displayMode.ts:111) | displayMode / zoom / heldRestMode / motion / shape | card ↔ 运行中的几何转换 ↔ fill；途中反向保留当前画面；落定后才交接静态样式、inert 和控件可见性。 |
| C12 · I | [宽屏标签、弹幕视图与节点激活](/Users/young/个人项目/bewlyCat/src/utils/bewlyWidescreen/shell.ts:51) | tabChoice / activeTab / hydratedTabs；danmakuViews 的 viewChoice；pendingSource/activatedSource | 点标签 → 指示器先走 → 等自身 motion → 切内容/激活原生节点；后续选择淘汰旧等待，换 CID 重绑弹幕源。 |
| C13 · I | [播放器控制栏空闲隐藏与折叠](/Users/young/个人项目/bewlyCat/src/utils/bewlyWidescreen/nativeControls.ts:49) | idleTimer / lastActivity / playerControlsActive；shell 的 folding；playerControlFit 的 resizeVersion/quietFrames | 活动 → 显示 → 空闲等待 → 隐藏；输入/听视频保持可见；尺寸变化等待测量稳定再折叠或还原按钮。 |
| C14 · I | [播放器默认偏好与用户意图仲裁](/Users/young/个人项目/bewlyCat/src/utils/player.ts:666) | loop/autoPlay/handoff request generations；userManuallyChangedAutoPlay / isProgrammaticChange / nativeEndPlaybackSnapshot | 读取偏好 → 等原生控件 → 应用；用户主动改变后停止覆盖；结束策略在原生与自定义之间接管/归还。倍速监听同样绑定当前媒体。 |
| C15 · I | [随机/自定义顺序播放与结束处理](/Users/young/个人项目/bewlyCat/src/utils/randomPlay.ts:15) | enabled / initialized / lifecycleGeneration / visitedEpisodes / activePlayOrder / listenerVideo / isProcessing | 初始化/找媒体 → 监听 → ended 选择下一项 → 等原生切换；切稿件重置；编辑顺序另有拖动与提交/恢复过程。 |
| C16 · I | [清晰度、比例记忆与结束退出全屏](/Users/young/个人项目/bewlyCat/src/contentScripts/videoQualityMemory.ts:51) | pending quality/context/mediaReady / awaitingMedia / confirmationTimer；videoAspectRatioMemory 的 initializationGeneration；player.ts 的 autoExitFullscreenGeneration | 用户选择 → 等媒体确认 → 记录；新稿件 → 等待应用；ended → 验证仍是当前媒体 → 退出全屏；导航/停用取消。三个独立、同类的媒体身份流程。 |
| C17 · M | [本地响度与音频延迟处理](/Users/young/个人项目/bewlyCat/src/inject/audio/localLoudness.ts:16) | LocalLoudnessState + captured/panel/suspended/disposed/preparation/context/outputs | off/waiting → 等手势或建图 → active/paused；原生处理、媒体源占用、不支持、错误、需重载各有分支；响度需求与延迟需求共享一个媒体源所有权。 |
| C18 · I | [播放完成自动移出稍后再看](/Users/young/个人项目/bewlyCat/src/utils/watchLaterCompletion.ts:40) | session / previous / handled / source / account owner | 媒体 ready 建会话 → ended 校验最终分 P/时长 → 只提交一次移除；重新从头播放可重置 handled；导航/广告/换号使旧会话失效。 |
| C19 · I | [原生评论/工具栏/弹窗增强生命周期](/Users/young/个人项目/bewlyCat/src/contentScripts/playerDomLifecycle.ts:4) | bootstrap/player/parent observer；watchLaterButton.ts 的 discovery/stable；favoriteDialog.ts 的 currentDialog/observer | 未发现宿主 → 发现并绑定 → 稳定观察 → 宿主替换时解绑重找；偏好停用/页面退出恢复节点。三者是相同形态的独立实现。 |
| C20 · I | [原生动态详情分栏与图库](/Users/young/个人项目/bewlyCat/src/contentScripts/features/opusDetailDrawerLayout.ts:78) | appliedSuccessfully / disabledSplit / stableTimer / teardownCount；图库 isAnimating/index/dragging | 等待结构 → 应用分栏 → 观察稳定 → 停止或重试；图库滚动/拖动/换图/父级托管另成子流程。 |
| C21 · I | [原生增强的按需启停与恢复](/Users/young/个人项目/bewlyCat/src/contentScripts/features/originalMomentsFeed.ts:89) | pending 节点 / listening / blankListening / disposed；blockUselessFeedCards 的 pendingRoots/fullScanPending | 启用 → 发现节点/批处理 → 监听用户或 DOM 变化 → 释放/恢复。相邻实现包括 nativePageKeyboard、hiddenHomepageImages、iframePhotoViewerDetector、videoScreenshotControl、fullscreenWheelVolume。 |
| C22 · I | [原生播放列表“播放全部”的异步拦截](/Users/young/个人项目/bewlyCat/src/utils/nativeFavoriteSeasonPlayAll.ts:19) | interceptInstalled / lifecycle / resolving token / navigationId | 拦截点击 → 解析播放目标 → 验证导航仍有效 → 跳转；再次操作或停用使旧解析无效。 |
| C23 · I | [竖屏视频缩放、拖动与小地图资源](/Users/young/个人项目/bewlyCat/src/utils/verticalVideoZoom.ts:26) | currentHost/observedVideo、refreshAttempts、controlsVisibleUntil、render/hide timers | 识别媒体 → 激活缩放/平移 → 展示控件/小地图 → 空闲隐藏；媒体更换、关闭缩放、停用恢复变换并释放。 |

### 预览、图片与媒体资源

| 编号/表示 | 流程与源码入口 | 状态承载 | 主要转换与边界 |
| --- | --- | --- | --- |
| D01 · I | [普通视频卡片预览意图](/Users/young/个人项目/bewlyCat/src/components/VideoCard/composables/useVideoCardLogic.ts:93) | previewRequestGeneration / isHover / enter/leave timeout / URL / fullscreen / scrubbing / disposed | 移入 → 延迟 → 取源 → 预览；移出、离屏、手势、菜单、全屏、销毁共同决定继续或释放。 |
| D02 · I | [卡片实际媒体装载](/Users/young/个人项目/bewlyCat/src/components/VideoCard/components/VideoCardCover.vue:42) | isPreviewLoading / previewSetupGeneration / media session / videoRef | 获得 URL → 建传输/监听 → 首帧/播放 → 错误或停止；换 URL 与卸载使旧 setup 回调失效。 |
| D03 · M | [动态与私信共用预览](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Moments/useMomentPreviews.ts:22) | previewState idle/waiting/loading/ready/error + hoveredMediaId / generation / cacheGeneration / enter/start timers | 悬停/主动预览 → 等待 → 解析/拉流 → ready/error；离开、隐藏、账户/内容更换 release/reset。私信 usePrivateMessagePreviews 是调用方，不重复计数。 |
| D04 · I | [预览 HLS 恢复预算](/Users/young/个人项目/bewlyCat/src/utils/previewMediaSession.ts:18) | hls/flv / events / recovery.player / attempts / timer / playedFrom | 正常 → 媒体错误 → 有界退避恢复；稳定推进一段媒体时间后重置预算；耗尽交给调用方失败，关闭/换源立即清理。 |
| D05 · I | [动态预览首帧、失败与全屏](/Users/young/个人项目/bewlyCat/src/components/MomentCard/MomentVideoPreview.vue:16) | frameReady / frameFailed / fullscreen / 当前 watch 的 current 标记 | 装载 → 等首帧 → 显示；error → 失败；全屏/退出与手势绑定实际 video；换资源使旧异步操作失效。 |
| D06 · I | [懒图片排队、换源与离屏释放](/Users/young/个人项目/bewlyCat/src/components/LazyPicture.vue:165) | isLoaded / usePreferredSources / active / loadVersion / queue handle / pendingImageReleases | 等待可见 → 入队 → 加载/decode → 揭示；优先源错误切回原源；离屏取消或延时释放，重新出现撤销释放。 |
| D07 · M | [图片查看器图片资源](/Users/young/个人项目/bewlyCat/src/components/ImageViewer/ImageViewer.vue:68) | images Map 的 loading/ready/error 与 pending Promise Map | 未知 → loading → ready/error；失败手动 retry；切图/预载相邻图共享同 URL 任务。 |
| D08 · I | [图片查看器会话进出与图片切换](/Users/young/个人项目/bewlyCat/src/components/ImageViewer/ImageViewer.vue:230) | entered / closing / request/open/index；切图动画、origin 与当前图片 | 请求打开 → 缩略图入场 → 可交互 → 切图或退出 → 还原焦点/调用 onClose；退出完成前保留媒体。 |
| D09 · I | [多图层交叉淡入与揭示记忆](/Users/young/个人项目/bewlyCat/src/components/MomentCard/MomentMediaStage.vue:80) | requestedImage / shownImage / layers / 每层动画；pictureRevealMemory | 请求下一图 → 等图片就绪 → 新旧层从当前透明度交叉过渡 → 清理旧层；快速反向重用仍在绘制的层。crossfadeLayers.ts 只是纯计算辅助。 |
| D10 · I | [头像/封面等局部失败回退](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/PrivateMessageContent.vue:22) | mediaRequested/mediaFailed；UserCard/通知项等的 failedImage；About 的 contributorRemoteFallbackUsed | 未请求 → 请求 → 内容或失败回退；来源变化重置。作为简单资源族归并：私信媒体、头像、通知图片、观看队列封面、贡献者图片。 |
| D11 · I | [图片取色、封面及头像读取缓存](/Users/young/个人项目/bewlyCat/src/composables/useImageTone.ts:20) | 当前请求有效性、缓存及 pending；favoriteFolderCovers 的 generation/调度通道；favoriteAvatar 的队列/active/disposed | 缓存命中直接使用；否则排队/读取 → 当前来源提交；换源、换号、reset/dispose 或取消使旧结果无效。收藏封面双通道详见 H03；这里归并其他同形态资源。 |
| D12 · I | [视频/剧集/预览元信息 single-flight](/Users/young/个人项目/bewlyCat/src/utils/playbackVideoInfo.ts:10) | pending Map、消费者与 signal；pgcEpisode.ts / videoPreviewCache.ts 的请求缓存 | 缺失 → 进行中并合并同键请求 → 缓存/失败；最后消费者取消或身份改变释放任务。 |

### 浮层、搜索与设置交互

| 编号/表示 | 流程与源码入口 | 状态承载 | 主要转换与边界 |
| --- | --- | --- | --- |
| E01 · I | [页面切换的异步准备与动效](/Users/young/个人项目/bewlyCat/src/composables/useReadyPageTransition.ts:26) | generation / ready / leavingGeneration / finishLeave / leaveAnimation / enterAnimation | prepare 目标 → 等退出钩子 → 旧页退场 → 等 motion scope → swap → 入场；准备中改目标、入退场取消都有独立转换。 |
| E02 · I | [Dialog 确认、关闭与焦点恢复](/Users/young/个人项目/bewlyCat/src/components/Dialog.vue:57) | showDialog / isClosing / closeEmitted / isConfirmPending / focusRestored | 打开 → 等确认/异步回调 → 允许关闭 → 退场 → 发 close/恢复焦点；pending 与 closing 决定重复操作是否有效。 |
| E03 · I | [确认框请求排队](/Users/young/个人项目/bewlyCat/src/composables/useConfirmDialogHost.ts:15) | 当前请求、队列、disposed、Promise resolver；ConfirmDialog 的 visible/result | 入队 → 当前展示 → 确认/取消 → 完成/下一条；AbortSignal 可取消排队项或当前项；cancelAll 释放全部。 |
| E04 · I | [共享面板进出动画](/Users/young/个人项目/bewlyCat/src/composables/useGlassPanelMotion.ts:14) | 每元素动画/清理记录、entering 与 done 所有者 | 进入或离开 → 动画中 → 完成；反向/取消从当前绘制状态接续，dispose 清理。useSourcePanelMotion/useSettingsMotion 是配置与来源层，不另算完整状态机。 |
| E05 · I | [顶栏弹窗互斥与悬停/键盘所有权](/Users/young/个人项目/bewlyCat/src/components/TopBar/composables/useTopBarInteraction.ts:163) | triggerHovered / popupHovered / keyboardOpen / instantOpen / enterTimer / leaveTimer + popupVisible | 关闭 → 延迟打开 → 悬停持有/键盘持有 → 延迟关闭；跨按钮立即替换，Esc/失焦/外部点击关闭。 |
| E06 · I | [搜索框折叠、展开与面板存在性](/Users/young/个人项目/bewlyCat/src/components/SearchBar/SearchBar.vue:84) | isFocus / dismissed / hoverExpanded / panelShown / collapsed（宿主） | 收起 → 悬停展开 → 聚焦/面板打开 → Esc 或失焦关闭 → 动画后卸载；关键词保留与焦点状态独立。 |
| E07 · I | [搜索历史与联想请求](/Users/young/个人项目/bewlyCat/src/components/SearchBar/SearchBar.vue:90) | historyLoading/historyChanging/historyError/suggestionsLoading；focusRequestId/suggestionController | 聚焦加载历史；输入取消旧联想再请求新联想；清除历史是独立写入；收起或新查询阻止旧结果提交。 |
| E08 · I | [热搜与默认推荐的消费者调度](/Users/young/个人项目/bewlyCat/src/logic/searchExperience.ts:26) | hotSearch/recommendation Request、consumerCount、generation、refreshTimer、extensionContextInvalidated | 首个消费者 → 读取/共享缓存 → 可见时刷新；无消费者/隐藏暂停；换号或失效取消。 |
| E09 · I | [搜索历史 iframe/锁事务](/Users/young/个人项目/bewlyCat/src/components/SearchBar/searchHistoryProvider.ts:77) | iframeLoadPromise / settled / timer / 跨上下文消息 / Web Lock | 建立宿主 → 等 load/应答 → 持锁读改写 → 返回；超时或宿主失效结束；并发历史修改按锁串行。 |
| E10 · I | [Select 与分集选择的焦点/延后提交](/Users/young/个人项目/bewlyCat/src/components/Select.vue:50) | showOptions / keyboardOpened / pendingSelection / focused index | 打开 → 键盘预览 → 选中/关闭 → leave 完成提交并恢复焦点。MediaEpisodeSelect.vue 是同类独立实现。 |
| E11 · I | [日期选择与输入编辑](/Users/young/个人项目/bewlyCat/src/contentScripts/views/SearchResults/components/DatePicker.vue:29) | showPicker / keyboardOpened / focusedDay / isInputMode / inputValue | 关闭 → 日历选择或文本输入 → 校验/提交 → 关闭恢复焦点；Esc 放弃当前交互。 |
| E12 · I | [菜单、Tooltip 与延迟悬停](/Users/young/个人项目/bewlyCat/src/components/Tooltip.vue:24) | visible / instant / pointerInside / enterTimer；useDelayedHover 的 enter/leave timers/hoverActive | 离开 → 延迟进入 → 可见 → 延迟离开；重新进入撤销关闭；ContextMenu/VideoCardContextMenu 另维护焦点恢复与 closeThen 后续动作。 |
| E13 · I | [设置窗口与定向跳转](/Users/young/个人项目/bewlyCat/src/components/Settings/Settings.vue:28) | requestedNavigation / settingsContentReady / modalActive / settingNavigationController；useSettingsPanel 的 settingsDockHeld | 开窗 → 等内容/动效就绪 → 展开目标分组/定位/高亮；新请求取消旧定位；关闭退场后释放 Dock 和焦点占用。 |
| E14 · I | [可视编辑与预览事务](/Users/young/个人项目/bewlyCat/src/logic/layoutEdit.ts:53) | isLayoutEditing / activeTarget / activePreviewSetting / previewValues / pendingSettingNavigation / registry generation | 进入编辑 → 选元素 → 开预览 → 更新预览 → commit/cancel；元素卸载、关闭编辑、跳转设置参与清理。layoutEditPreview.ts 是预览事务 owner。 |
| E15 · I | [颜色与数值编辑、导入与许可读取](/Users/young/个人项目/bewlyCat/src/components/Settings/Appearance/AppearanceColorField.vue:16) | editing / invalid / draftGeneration / optionsOpen/optionsMounted；Slider 的 editing；Appearance 的 importing/generation；LicensePanel 的 loading/failed | 显示值 → 草稿/校验 → 提交或取消；菜单退场后卸载。导入与许可读取分别是异步开始/完成/失败/取消的局部流程，按简单设置流程族归并。 |

### 手势、可中断动画与布局

| 编号/表示 | 流程与源码入口 | 状态承载 | 主要转换与边界 |
| --- | --- | --- | --- |
| F01 · M | [Dock 收展及自动收起](/Users/young/个人项目/bewlyCat/src/components/Dock/Dock.vue:97) | isDockCollapsed / transitioning / contentVisible / triggerVisible / morphDirection / morphGeneration / timers | 展开 → 内容退场 → 外壳收缩 → 圆球出现；反向先外壳展开后内容出现；悬停、设置窗口、编辑模式能中断或禁止收起。 |
| F02 · I | [侧栏与小电视圆的交接](/Users/young/个人项目/bewlyCat/src/components/PersistentSidebar.vue:67) | surface / docked / generation；useSidebarHost 的 railOpen/morphing/宿主引用 | 圆 → 形变 → 侧栏；反向可从当前几何继续；完成才把表面所有权交回圆。 |
| F03 · M | [图片查看器手势识别](/Users/young/个人项目/bewlyCat/src/components/ImageViewer/ImageViewer.vue:376) | gesture.kind pending/pan/swipe/dismiss/pinch/none + pointers / dragging / settleTiming / lastTap | 按下 → 判方向/指针数 → 平移、切图、下拉或捏合 → 提交或回弹；第二指可把已有单指手势改为 pinch，关闭使手势无效。 |
| F04 · M | [触屏播放器手势](/Users/young/个人项目/bewlyCat/src/contentScripts/touchPlayerGestures.ts:71) | gesture.mode / lastTap / suppressClickUntil / suppressNativeDoubleClickUntil / listenersAttached | 触下 → 识别 seek/volume/ignored → 移动反馈 → 松手提交/取消；双击分区操作与后续原生点击抑制共享历史。 |
| F05 · I | [预览滑动定位](/Users/young/个人项目/bewlyCat/src/composables/useVideoPreviewSwipeSeek.ts:16) | isScrubbing / pendingTime / seekTimer / suppressClick / clickTimer / pointer session | 指针候选 → 横滑 scrub → 合并 seek → 释放提交；取消恢复；手势后短暂抑制 click。 |
| F06 · I | [头图轮播无级拖动与提交](/Users/young/个人项目/bewlyCat/src/components/LibraryHeroCarousel.vue:60) | gesture/dragged/disposed、轨道位置、动画、滚轮停止计时 | 按住直接跟手 → 松开判阈值 → 回弹或滑到下一张 → 动画结束才 select；新手势取消旧动画。 |
| F07 · I | [滚轮一步与横滑识别](/Users/young/个人项目/bewlyCat/src/utils/wheelStep.ts:18) | distance / lastDirection / committed / 时间记录；sideSwipe 的 swiped/pointer | 积累本次手势 → 达阈值提交一次 → 抑制惯性尾巴 → 新手势重置。共享消费者含 Dock、滚筒、动态图片和查看器。 |
| F08 · I | [横向弹性越界与回弹](/Users/young/个人项目/bewlyCat/src/utils/elasticScroll.ts:30) | stretch / releaseTimer / 回弹动画 | 正常滚动 → 到边界积累阻尼位移 → 停止事件后回弹 → 空闲；继续输入中断回弹。 |
| F09 · I | [滚筒预览、提交与运动](/Users/young/个人项目/bewlyCat/src/components/WheelSelector.vue:38) | interactionGeneration / 预览游标 / 已提交值 / focus / spring | 方向键/滚轮预览 → 确认或手势提交 → 落定；失焦恢复；新交互使旧等待不再提交。 |
| F10 · I | [分段滑块与共享弹簧帧循环](/Users/young/个人项目/bewlyCat/src/composables/useLiquidSegmentIndicator.ts:118) | visible / isMoving / 两边位置速度 / RAF / measurement / releaseSlide | 测量目标 → 运动 → 可见落定 → 释放等待 → 停帧；连点保留速度并改目标；useSpringValue 也以 frame/velocity/hold 表达同类生命周期。 |
| F11 · I | [测量式展开、布局补位与表面形变](/Users/young/个人项目/bewlyCat/src/composables/useMeasuredDisclosure.ts:18) | moving / animation / settleTimer / disposed；useLayoutMotion/useSurfaceMorph 的 generation | 收起/展开 → 测量自然目标 → 运动中可重定向 → 完成后切裁切/卸载；布局补位与表面 morph 各自取消旧代次。 |
| F12 · I | [主题揭示事务](/Users/young/个人项目/bewlyCat/src/composables/useDark.ts:245) | applyingAppearance / active / committed / ViewTransition / cancel | 准备新主题 → 提交一次 → 圆形揭示 → 完成清临时样式；新切换取消旧事务，旧回调不能重提主题；自动主题时钟另有按需启停。 |
| F13 · I | [粒子删除、数据释放与恢复](/Users/young/个人项目/bewlyCat/src/utils/particleDissolve.ts:306) | finished / 元素运行记录 / released Promise / canvas/动画 / restore | 开始飘散并隐藏元素 → released 允许数据移除 → 动画完成清资源；写入失败 restore；同元素重复调用加入原任务。 |
| F14 · I | [悬停保持、图片揭示与搜索框交接](/Users/young/个人项目/bewlyCat/src/composables/useHoverHalo.ts:20) | mounted/visible/timer；useHoverLiftHold 的 held；searchHandoff 的 departure | 悬停后挂载 → 淡入 → 淡出 → 卸载；浮层持有 hover 外观；搜索 departure 在 arrival 时一次性消费或过期。它们是小型、可局部保留的隐式流程。 |
| F15 · I | [虚拟列表测量、锚点与入场](/Users/young/个人项目/bewlyCat/src/composables/useCardWindow.ts:76) | active / generation / anchorPending / pendingAnchor / 测量队列；useMomentLayout 的 ready/entering/visible 集合 | 恢复快照 → 等几何 → 恢复锚点 → 活跃测量/窗口更新 → 停用；交互项保活；卡片进入/高度运动中延后提交布局。 |
| F16 · I | [程序滚动与用户滚动仲裁](/Users/young/个人项目/bewlyCat/src/utils/scrollIntent.ts:11) | 每 scroller 的意图、取消句柄、完成 Promise；selectionScrollAnchor 的 active；useConversationViewport 的 interactionGeneration | 声明滚动 → 执行/等落定 → 完成；用户操作或更新意图取消旧恢复，防止迟到锚点把用户拉回。 |

### 推荐、动态与搜索读取

| 编号/表示 | 流程与源码入口 | 状态承载 | 主要转换与边界 |
| --- | --- | --- | --- |
| G01 · M | [推荐主请求、补页与失败恢复](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Home/useForYouRecommendations.ts:152) | recommendationDataState + isLoading/initialized/noMore/login/authRequired/recursiveLoading/empty counters/riskCooldown | 首次/刷新/续页 → 请求与过滤 → 接受列表和游标 → success/empty/filtered-empty/risk/error；风控冷却、空批次上限、APP/Web 路径及账号变化分别约束下一次请求。 |
| G02 · I | [推荐初次激活、历史撤销与游标](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Home/forYouInitialData.ts:15) | activationGeneration；useRecommendationHistory 的 back/forward；useWebRecommendationCursor 的 refreshIdx/fetchRow/showlist | 激活后加载 → 缓存恢复或刷新 → 记录可撤销快照 → back/forward；查询身份/过滤签名改变作废历史，游标随已接受批次推进。 |
| G03 · I | [异步过滤与 APP 点赞补读](/Users/young/个人项目/bewlyCat/src/composables/useFilter.ts:168) | 当前过滤器/regex runner；useForYouRecommendations 的 appLikesController/filterRefreshTimer | 规则变化 → 新过滤器/取消旧任务 → 批次过滤/限并发补读 → 当前 owner 提交；隐藏、换号、规则变化、退出取消。 |
| G04 · I | [关注目录、分组与关系版本](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Home/following/useFollowingDirectory.ts:22) | loaded/groupsLoaded/loading/failed、pending/groupsPending/groupGeneration/loadedRevision | 缓存 → 读取目录或分组 → 对齐关系 revision → 可用；关系改变可重读；失败与换号分别重试/重置。 |
| G05 · I | [关注视频流与关注内搜索](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Home/components/Following.vue:97) | selectionToken / selectedUploader / offsets / loading/noMore/failed/loginRequired；useFollowingVideoSearch 的 generation | 切 UP 主/分组 → 取消旧 owner → 取对应流；提交搜索切换到分页搜索 → 结束/失败/重试；账号和可见性约束提交。 |
| G06 · I | [其他首页 Feed 读取族](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Home/components/Trending.vue:29) | hasSettled / loading / page/offset / noMore / requestFailed / requestGeneration | 初读 → 成功/错误；有分页的续读 → 耗尽/失败；换选项或换号使旧响应无效。独立实例：Trending、Live、SubscribedSeries、Weekly、Precious、Ranking。 |
| G07 · I | [番剧三路数据与时间表](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Anime/Anime.vue:47) | watchList/popular/recommendations 的 loaded/loading/failed；cursor/noMore；requestGeneration/controller | 各区未读 → loading → 就绪/错误；推荐可续页；换号取消整个 generation。AnimeTimeTable.vue 有独立时间表加载 owner。 |
| G08 · M | [动态主流、续读、补新与阅读边界](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Moments/Moments.vue:177) | loading/initialLoading/failed/noMore；offset/page；readingBookmark/newerGap/atLatest/joinStatus/loadingNewer | 初读或从书签恢复 → 读旧页；返回最新/补新 → 拼接缺口 → connected/ended/stalled/failed/budget；过滤、UP 主、账号改变使旧读失效。 |
| G09 · I | [动态原始页读取与过滤扫描](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Moments/momentFeedReader.ts:34) | pendingRead / 原始游标、页码、已见 ID / 扫描预算 | 读取原始页 → 判断原始进展 → 本地过滤 → 返回可见批次；不够则继续，空/重复原始页结束；取消不提交游标。 |
| G10 · I | [动态门户与最后互动位置](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Moments/Moments.vue:152) | portalLoaded/isPortalLoading/portalController；lastInteraction/interactionInView/hoverTimer/pendingResume | 门户读取 → 就绪；点击或稳定悬停认定互动 → 记录锚点 → 离屏显示返回入口 → 滚回或重新读取该范围。 |
| G11 · I | [动态续读按钮组交换](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Moments/MomentsReadingActions.vue:23) | shownJump / shownLatest / 当前动画 / disposed | 目标按钮组合变化 → 旧组合退场 → 切布局 → 新组合入场；运动中再次变化在本轮结束后消费。 |
| G12 · I | [搜索请求取消与结果提交](/Users/young/个人项目/bewlyCat/src/contentScripts/views/SearchResults/composables/useSearchRequest.ts:23) | isLoading / error / results / activeController / disposed / request identity | 查询/筛选/页码变化 → 取消旧请求 → 加载 → 当前请求提交或失败；reset/dispose 清除旧 owner。 |
| G13 · I | [搜索续页、补屏与分页模式](/Users/young/个人项目/bewlyCat/src/contentScripts/views/SearchResults/composables/useLoadMore.ts:34) | hasMore / exhausted / autoFillPaused / state / generation / renderWait / timer | 加载下一页 → 等渲染 → 判断是否继续补屏 → 暂停/耗尽；resume/retry/reset 改变自动加载许可。usePagination 独立维护已提交页码与上下文。 |
| G14 · I | [搜索 URL、分类与滚动恢复](/Users/young/个人项目/bewlyCat/src/contentScripts/views/SearchResults/SearchResults.vue:37) | urlRestoreGeneration；SearchResultsPanel 的 switching/pendingScroll；useSearchListPage 的 restorePage | 地址变化 → 还原分类筛选/页码 → 等结果与面板交换 → 恢复位置；新地址覆盖旧 restore。 |
| G15 · I | [网格滚底触发与防空转](/Users/young/个人项目/bewlyCat/src/components/VideoCardGrid.vue:237) | sentinelIntersecting / reachedDuringLoading / loadMoreRequested / emptyLoads / failures / active | 触底 → 请求一次 → 等数据/装载结束 → 重查触底；空批次/失败限制自动续读，激活和恢复重查。 |
| G16 · I | [页面/Tab 缓存租约与失活](/Users/young/个人项目/bewlyCat/src/composables/useHomeTabState.ts:102) | generation / active / disposed / 缓存 key；usePageViewState 的账号与 cache generation | 激活取缓存 → 当前实例可写 → 失活保存/释放 → 再激活恢复；换号或淘汰使旧 lease 失效。 |

### 收藏、历史与稍后再看

| 编号/表示 | 流程与源码入口 | 状态承载 | 主要转换与边界 |
| --- | --- | --- | --- |
| H01 · I | [收藏目录、订阅与当前内容分页](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Favorites/useFavoritesData.ts:41) | categoryState/subscriptionState；readGeneration/contentController；loading/fullPageLoading/failedPage/stalledPage/noMore | 目录和订阅分别 bootstrap；选收藏夹/订阅/其他收藏 → 切读 owner → 分页；失败页和停滞页保留用于重试，换号重置。 |
| H02 · M | [收藏筛选扫描及分区读取](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Favorites/useFavoriteFilterScan.ts:45) | status idle/scanning/paused/budget/complete/failed/stalled；pageVisible/generation/controller；独立 partitionGeneration | 应用筛选 → 分轮扫描 → 有结果且达到预算暂停续读/完成；隐藏暂停、显示恢复；失败/停滞重试。分区菜单读取是独立子任务。 |
| H03 · I | [收藏夹封面双通道与分页读取 owner](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Favorites/favoriteFolderCovers.ts:11) | hero/侧栏读取需求、generation/disposed；favoriteReads 的请求 owner | 可见或邻近收藏夹 → 排队取封面 → 缓存；头图可接走侧栏尚未开始的任务；invalidate/reset/dispose 取消相应读取或使结果失效。 |
| H04 · I | [收藏夹创建、编辑、信息读取与写入](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Favorites/useFavoriteFolderManager.ts:24) | editor visible/closing/loading/failed；busy；editor/info controller；表单与封面 | 打开编辑 → 读详情/草稿 → 可编辑 → 上传/保存 → 关闭/失败；关闭、切目标、换号取消旧读取并清临时资源。 |
| H05 · I | [收藏夹社交和资源批量事务](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Favorites/useFavoriteWrites.ts:29) | pending/账号 owner；FavoritesPage 的 managing/selection/transferDialog/action；favoriteFolderSocial 的读取与写入状态 | 选择/确认 → 提交 → 刷新原 owner/完成或失败；批量复制、移动、取消收藏与文件夹社交各有独立 pending。 |
| H06 · I | [视频收藏选择与写后验证](/Users/young/个人项目/bewlyCat/src/utils/videoFavoriteSelection.ts:28) | loading/saving/loaded/closed/error/needsVerification/desired/initial；submitted Map | 读成员 → 编辑 → 保存 → 回读验证 → 完成；已提交但回读未确认锁定编辑，下一次只验证；关闭仍不能撤回已接受写入。 |
| H07 · I | [观看历史分页、搜索与记录开关](/Users/young/个人项目/bewlyCat/src/contentScripts/views/History/useHistoryTimeline.ts:37) | loading/failed/stalled/noMore/generation/controller；readingStatus/updatingStatus/clearing/deleting | 加载或搜索 → 串行补页 → 耗尽/停滞/失败；删除/清空与暂停记录为独立写入流程，换号取消旧请求。 |
| H08 · I | [稍后再看列表、刷新与筛选扫描](/Users/young/个人项目/bewlyCat/src/contentScripts/views/WatchLater/WatchLater.vue:71) | loading/refreshing/refreshFailed/requestFailed/requestStalled/noMore；requestGeneration/page/sourcePages/readController | 首次/续页 → 接受页；完整刷新 → 合并确认集合；筛选需要继续扫描；修改成员、隐藏、换号使旧读失效。 |
| H09 · I | [批量选择与确认后执行](/Users/young/个人项目/bewlyCat/src/composables/useLibraryBatchSelection.ts:12) | managing / selected / busy / failed / generation；useWatchLaterBulkAction 的 pending/generation | 进入管理 → 选择 → 确认 → 执行 → 成功退出或失败保留；换 owner/退出取消未提交阶段。 |
| H10 · M | [打开标签页批量加入稍后再看](/Users/young/个人项目/bewlyCat/src/background/openTabsWatchLaterTask.ts:16) | task ready/running/stopped/complete；item pending/resolving/sending/added/skipped/failed/unknown；stopped/writeSent | 解析 → 去重/核对成员 → 发送 → 确认；停止只终止未发步骤；worker 恢复把未决 sending 标 unknown，显式 retry 处理允许的失败项。 |
| H11 · M | [批量刷新标签页](/Users/young/个人项目/bewlyCat/src/background/refreshTabsTask.ts:19) | task.running / pending / sourceInvalidated；item pending/success/skipped/failed | 查询目标 → 顺次刷新其他 tab → 满足条件后刷新来源 tab；失效/关闭跳过；失败项显式重试；后台 refreshTabs.ts 负责恢复。 |
| H12 · I | [顶栏收藏/历史/动态/稍后再看列表](/Users/young/个人项目/bewlyCat/src/components/TopBar/components/pops/FavoritesPop.vue:57) | 各弹窗加载/失败/分页/显示目标；HistoryPop 的 failedRequest；topBarStore 的动态与待看 generation | 打开 → 读取/刷新 → 续页/错误重试 → 关闭释放；收藏切目录要区分 activated 与 displayed；动态/待看共享 store 与页面投影，非独立真值。 |
| H13 · I | [稍后再看单项移除与工具栏写入](/Users/young/个人项目/bewlyCat/src/utils/watchLater.ts:32) | pendingRemovals / mutation owner；watchLaterButton 的当前媒体和请求标记 | 点击 → 解析真实目标/核对账号 → single-flight 写入 → 同步权威快照；失败恢复 UI，过期 owner 不提交旧页面状态。 |

### 通知、私信阅读与搜索

| 编号/表示 | 流程与源码入口 | 状态承载 | 主要转换与边界 |
| --- | --- | --- | --- |
| I01 · I | [消息页路由与临时收件人](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/Notifications.vue:67) | routeReady / currentView / pageActive / pendingPrivateConversationRoute / transientPrivateRecipient / restoreAttempted | 解析分类与深链 → 找真实会话或建临时入口 → 激活详情；首条发送确认后转换真实会话，换号清理旧目标。 |
| I02 · I | [通知 Feed 读取、刷新与分页](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/composables/useNotificationFeed.ts:54) | loading/loadingMore/loaded/noMore/paginationStalled/errorKind/failedOperation/generation；firstPageRequestSerial | 初读/merge-head 刷新/replace 刷新/续页 → 当前请求提交；失败精确重试原操作；游标无进展停止自动请求；四类通知复用。 |
| I03 · I | [通知服务端已读与角标对账](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/composables/notificationFeedState.ts:41) | currentReadCommitId / serverReadCommitted / badgeReconciled / readCandidate；NativeNotificationFeed 的 badgeRetryTimer | 服务端读提交成功 → 建 read candidate → 同步共享未读角标 → reconciled；失败只重试对账；换号/新 commit 淘汰旧候选。 |
| I04 · M | [全部标为已读](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/composables/useMarkAllMessagesRead.ts:35) | status idle/running/success/partial/error；AbortController / disposed / 账号快照 | 用户触发 → 遍历通知和会话 → 按各自边界 ACK → 全成/部分失败/失败；重试、换号或销毁结束当前 run。 |
| I05 · I | [私信会话目录与增量更新](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/usePrivateSessions.ts:131) | state 多个 loading/loaded/noMore/error/stalled 字段；contentGeneration/incrementalGeneration；pending requests | 初读/完整刷新/增量刷新/历史续页相互仲裁；选择会话独立于加载；旧账号或旧内容代次的响应被拒绝。 |
| I06 · I | [私信正文窗口与历史分页](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/usePrivateMessages.ts:36) | loadingInitial/loadingOlder/refreshing/loaded/noMore/paginationStalled；historyBoundary/min/max/oldest/newest；generation | 首屏 → 最新窗口；向前翻页 → 历史窗口；无进展 → 停滞并允许受限显式重试；回最新替换窗口；缓存淘汰、换号、release 使旧请求失效。 |
| I07 · I | [私信阅读位置、新消息与 ACK](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/usePrivateMessages.ts:599) | atLatest / readingAnchorId / newMessagesAvailable / lastAckSeqno / lastUnreadAckSeqno / ackRequests | 读旧消息 → 标有新消息但不跳；回最新且页面可见、可 ACK、边界有效 → 提交 ACK → 成功才清未读；不是 loading 状态的简单附属字段。 |
| I08 · M | [私信详情打开、切换与历史揭示](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/useConversationPresentation.ts:17) | entryPhase opening/switching/loading/ready；expanded/layoutTransitioning/historyVisible/revealing | 打开外框 → 等展开 → 请求正文 → 揭示历史；切会话先退消息再加载；ConversationView 的 activationGeneration 取消迟到请求和聚焦。 |
| I09 · I | [私信轮询资格、退避与恢复](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/usePrivateMessagePolling.ts:82) | eligible/disposed/generation/activeMid/timer/inFlight/pendingLifecyclePoll/failureCount | 可见且当前账号 → poll → 正常间隔或退避；失去资格停止；旧请求未完时记录一次待恢复 poll；登录失败不继续排定。 |
| I10 · I | [私信用户搜索多来源调度](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/usePrivateRecipientSearch.ts:100) | following/global 分组状态；generation/disposed/pacingTimer/source/查询状态 | 输入防抖 → 关注列表串行读取 → 全站用户读取/手动续页；pause/resume、换查询、隐藏、换号取消旧调度。 |
| I11 · I | [私信跨会话历史扫描](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/usePrivateHistorySearch.ts:50) | running/loading/complete/error/canSkip/limited；cursors/position/pending/failedCursor/generation | 搜索 → 分轮扫描各会话 → 等间隔 → 继续；无数据完成，预算停止，失败可跳过/重试，隐藏暂停；不与普通正文窗口共用数据 owner。 |
| I12 · I | [历史搜索结果上下文与选中定位](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/usePrivateHistorySearch.ts:65) | loadingContext/contextError/contextPending/contextGeneration/selectionVersion；ConversationFind 的 selectedKey | 选择匹配 → 读上下文 → 当前选择提交 → 定位；快速改选、退出搜索或重置使旧上下文作废。 |
| I13 · I | [会话目标解析与菜单读取](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/usePrivateConversationTarget.ts:20) | loading/failed/generation/disposed；usePrivateSessionActions 的 detailReady/relationReady/settingsReady | 深链或临时目标 → 读详情/关系/设置 → 可用操作；不支持目标走 fallback；切对象/换号取消旧目标。 |
| I14 · I | [私信表情目录与发送草稿存活](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/usePrivateEmotePanel.ts:9) | packages/loading/failed/generation/pending；写入 controller 中按 talkerId 的 draft | 打开目录 → single-flight 读取 → 成功/失败 → release；草稿随会话保留但换号/页面释放清除，不与消息轮询生命周期等同。 |
| I15 · I | [私信工作区可见性与释放协调](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/usePrivateMessageWorkspace.ts:26) | sessions/messages/writes 的各自 owner；WhisperWorkspace 的 searchMode/historyWasRunning/pendingDetailFocusKey | 进入 → 恢复列表/选择与搜索；切用户/消息搜索保留各自位置；离开 → 终止读取/发送未发步骤并释放正文；再进入建立新生命周期。 |

### 发送、写入与原生评论

| 编号/表示 | 流程与源码入口 | 状态承载 | 主要转换与边界 |
| --- | --- | --- | --- |
| J01 · M | [私信文本发送与历史对账](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/experimental/usePrivateMessageWrites.ts:262) | sendState pending/reconciling/accepted-but-unconfirmed/failed；sending/request/accountGeneration/localId | 建立乐观消息 → send → 接受后回读历史 → 对账移除本地副本；未确认保留且禁止当失败自动重发；手动 retry 受原状态约束。 |
| J02 · M | [私信图片准备、上传、发送与撤销](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/experimental/usePrivateMessageWrites.ts:423) | imageDraft.status / task.failureKind / objectURL / uploadRequestId / localId / 账号和会话 generation | ready → preparing → uploading → sending → reconciling → 确认后释放；对账失败用 failed + reconcile-failed 表示，重试跳过再次发送；切会话/换号/卸载停止后续步骤并释放对象 URL。 |
| J03 · I | [私信会话设置、黑名单与举报](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Notifications/whisper/usePrivateSessionActions.ts:58) | busy/writePending/pendingIntent/unconfirmed/reported/ready/error + generation | 读取 → 操作提交 → 回读验证 → 确认；不确定时保留原 intent、只回读；举报另有证据读取与确认过程。 |
| J04 · I | [服务端消息设置与屏蔽词](/Users/young/个人项目/bewlyCat/src/components/Settings/PluginComponentsAndPages/MessagesPage/useMessageServerSettings.ts:82) | 每字段读取/提交/确认状态；pendingBlockWordMutation 与 quota/readiness | 读规则/额度 → 改字段或词条 → 发送 → 回读对账；已发未确认阻止重复写；不同字段独立，换号失效。 |
| J05 · I | [动态/播放页评论 Composer](/Users/young/个人项目/bewlyCat/src/components/MomentCard/MomentReplyComposer.vue:37) | text/images/reply target；pending/addingImages/uncertain/error/alive；picker/completion | 编辑 → 准备图片 → 核对账号并提交 → 成功合并或失败/不确定；取消/收起清临时资源；两处共用同一 Composer。 |
| J06 · M | [动态转发草稿与提交](/Users/young/个人项目/bewlyCat/src/components/MomentCard/momentForwardContent.ts:449) | status idle/editing/submitting/success/error + generation/disposed/pendingTask；momentForwardTransactions 的 draft pending | 编辑/选话题 → 提交 → 成功/错误；视图关闭不把已发事务当未发；重新打开接回 draft，换号或新 owner 失效旧视图提交。 |
| J07 · I | [评论/转发表情、@ 与话题补全](/Users/young/个人项目/bewlyCat/src/components/MomentCard/momentForwardContent.ts:409) | 搜索 generation、loading/error/results；picker open/completion；表情加载 generation | 输入触发补全/打开面板 → 防抖读取 → 当前查询结果 → 选择回填；关闭、改查询、换号清理旧任务。 |
| J08 · I | [动态互动写入与卡片撤销](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Moments/useMomentActions.ts:22) | 按目标 request Map/Symbol、点赞前值；useVideoCardLogic 的 interactionState/isUndoing | 点赞/预约/删除/举报/待看 → 请求占用 → 服务端确认或恢复；不感兴趣另有撤销/过期/不确定阶段，避免重复操作与旧 owner 回写。 |
| J09 · I | [关注关系读取及修改](/Users/young/个人项目/bewlyCat/src/composables/useUserRelations.ts:39) | pending Map / requestGeneration / 消费需求 / extensionContextInvalidated；UserCard 的 isFollowLoading/followGeneration | 未知 → 合并查询 → 已知关系；写入 → 确认更新/失败；失去消费者、换号、失效取消旧读；关注分组写入见 useFollowingGroupWrites。 |
| J10 · I | [投票读取、选择、提交与到期](/Users/young/个人项目/bewlyCat/src/utils/momentVote.ts:65) | vote state 的 loading/submitting/selected/error；generation/loadSequence；MomentVote expiryTimer | 读取 → 选择 → 提交 → 接受结果/失败；到期改变可提交性，换投票/销毁废弃旧回执。 |
| J11 · I | [动态评论根列表、楼中楼与阅读租约](/Users/young/个人项目/bewlyCat/src/components/MomentCard/MomentCommentSection.vue:65) | target/sessionLease/resolvingTarget/loading/loadingMore/hasMore/error/requestGeneration；thread states | 解析目标 → 恢复缓存或读根评论 → 加载楼中楼 → 合并；收起取消 reads，snapshot 保存阅读窗口；utils/momentCommentThread/session 管线程与租约。 |
| J12 · I | [原生评论分页、全部展开与折叠恢复](/Users/young/个人项目/bewlyCat/src/inject/commentReplyPagination.ts:72) | PaginationState 的 expandAllLoading/operation/promise/loading/pending/pages/failedPage/replaceRequested/collapsedList | 单页/连续页读取 → 保留布局锚点 → 替换或合并；全部展开可中断；失败重试原页，折叠恢复；账号/文档/renderer scope 换代取消。 |
| J13 · I | [原生评论树、缺失父节点与阅读呈现](/Users/young/个人项目/bewlyCat/src/inject/index.ts:174) | pendingCommentEnhancements / treeEpochs / pendingTreeLayoutUpdates；commentReplyReading 的 collapsed/tails/rootTails | 原生渲染 → 排 topology/content/geometry 更新 → 当前 epoch 提交；折叠/展开/阅读视图保存原状态；节点销毁或替换使旧更新无效。 |
| J14 · I | [评论 MAIN ↔ ISOLATED 请求与外置输入桥](/Users/young/个人项目/bewlyCat/src/inject/commentReplyReader.ts:8) | sequence / invalidated / pending requests；commentReplyApiBridge 的 pending controllers；external composer 目标绑定 | 发请求 → 等对应 ID 回执 → 完成/错误/取消；上下文失效终止；外置 Composer 绑定当前评论目标，确认后的新评论再交回原生列表。 |

### 共享基础设施

| 编号/表示 | 流程与源码入口 | 状态承载 | 主要转换与边界 |
| --- | --- | --- | --- |
| K01 · I | [请求端口的发送、取消与结算](/Users/young/个人项目/bewlyCat/src/utils/messaging.ts:106) | settled / port / signal；utils/appClient.ts 的 posted/settled；后台 connected/controller | 建立 port → 发请求 → 应答/abort/disconnect/timeout → 恰好一次结算；后台连接断开终止可取消读取，写入是否已发送单独记忆。 |
| K02 · I | [网络签名、token/device 缓存与重试](/Users/young/个人项目/bewlyCat/src/background/utils.ts:291) | hasTriedWithoutWbi / hasRefreshedWbiKeys；wbiSign 的 caches/fetchingKeys/persistentClearRequests；deviceId 的 pendingReads | 取/复用签名 → 请求 → 明确签名拒绝后有界刷新/重试；缓存按身份隔离；私信 transport 的优选接口与签名恢复也属于此族。 |
| K03 · I | [共享读取的消费者与 single-flight](/Users/young/个人项目/bewlyCat/src/background/messageListeners/api/search.ts:14) | cache / pendingRequests / consumers / settled / controller；accountReads 等 keyed promise | 首个请求启动 → 后续请求共享 → 最后消费者取消或请求完成 → 清理/缓存；请求存在本身就是 running 状态。 |
| K04 · I | [正则 iframe/worker 启动、执行与超时](/Users/young/个人项目/bewlyCat/src/utils/regexBatchRunner.ts:6) | frame / port / ready / pending / deadlineTimer / generation；regex/host.ts 的 worker/current id | 懒启动 → 握手 ready → 执行批次 → 结果；替换、截止时间、worker 异常、dispose 关闭 host/port/worker。 |
| K05 · I | [账号生命周期 lease 与失效](/Users/young/个人项目/bewlyCat/src/utils/accountLifetime.ts:4) | generation / disposed / capture 时的 accountId | 捕获 owner → 当前可提交 → invalidate/账号变化/销毁后不可提交；被大量读写控制器嵌入，是共享的提交资格状态机。 |
| K06 · I | [动效等待与延后值提交](/Users/young/个人项目/bewlyCat/src/utils/motionPriority.ts:29) | 每 scope 的 holds / waiters / timer；useMotionValue 的 generation | 登记运动 → 消费者等待 → 全部释放或到等待上限 → 放行；新值令旧等待完成回调无效。 |
| K07 · I | [滚动/遮暗/焦点等共享占用](/Users/young/个人项目/bewlyCat/src/utils/pageScrollLock.ts:1) | lockCount；usePageDim 的 owner 集合；dialogFocus 的 overlay/focus ownership | 首个持有者建立效果 → 多个持有者共享 → 最后释放恢复；单个浮层关闭不能提前清掉其他浮层的占用。 |
| K08 · I | [观察器、几何帧与隐藏资源调度](/Users/young/个人项目/bewlyCat/src/utils/viewportGeometry.ts:18) | 每 viewport 的 listeners/frame/pending/snapshot；lazyLoad/skeletonVisibility 的 observer/active | 首个消费者启动 → 合并 scroll/layout → 一帧测量分发 → 最后消费者释放；图片/骨架可见性与浮层定位监听也按需启动/停止。 |
| K09 · I | [异步模块、语言切换与单次资源装载](/Users/young/个人项目/bewlyCat/src/utils/asyncPage.ts:9) | pending loader；i18n 的 pendingLocales；interfaceLanguage 的 languageRevision；hls/flv 的模块 Promise | 未装载 → 共享加载 → 已加载/失败；语言新选择使旧语言回执无效；模块成功后复用。属于低复杂度基础流程，通常不值得扩成通用框架。 |

## 已较明确的实现与不应误计的文件

| 入口 | 当前性质 | 结论 |
| --- | --- | --- |
| [APP 授权协调策略](/Users/young/个人项目/bewlyCat/src/utils/appAuthTokenPolicy.ts:9) | 明确的 AppAuthorizationState、AppAuthorizationEvent 和 resolveAppAuthorizationState(current, event) | 是已有的显式状态转换实现；APP 二维码轮询和 token 刷新仍是外层流程，不混为一谈。 |
| [播放器模式应用事务](/Users/young/个人项目/bewlyCat/src/utils/playerModeApplication.ts:12) | pending/applied/cancelled/failed；finish 集中且只从 pending 结算 | 小型显式状态机；外围 index.ts 的准备/重试调度另列 A03。 |
| [加载圆环](/Users/young/个人项目/bewlyCat/src/composables/useLoadingRingPhase.ts:13) | idle/spinning/complete；输入 watch 与 close timer 集中管理 | 已清楚表达加载结束后的闭合阶段；所有调用方共享，不应逐个重算。 |
| [图片队列单任务](/Users/young/个人项目/bewlyCat/src/utils/imageLoadQueue.ts:124) | queued/active/settled；startTask/settleTask/cancelTask 集中改变状态 | 单任务阶段较显式；LazyPicture 的资源需求、换源、揭示与延后释放另列 D06。队列泵的资源调度仍可按 K08 的生命周期模式理解。 |
| [原生发送按钮状态投影](/Users/young/个人项目/bewlyCat/src/utils/nativeSendState.ts:1) | 从输入、原生禁用与 pending 条件求 ready/idle/pending/blocked | 主要是纯状态投影，不是独立拥有发送事务的状态机；真实发送见 J01/J02/J05。 |
| [推荐成功结果分类](/Users/young/个人项目/bewlyCat/src/contentScripts/views/Home/recommendationState.ts:18) | 纯函数根据数量与过滤条件得 success/empty/filtered-empty | 只是分类器；完整推荐流程在 G01。 |
| [交叉淡入层计算](/Users/young/个人项目/bewlyCat/src/utils/crossfadeLayers.ts:13) | 输入当前层和目标，返回层与淡化目标 | 纯计算辅助；实际异步/动画状态在 MomentMediaStage，见 D09。 |
| [账号身份判定](/Users/young/个人项目/bewlyCat/src/utils/accountScope.ts:25) | 纯守卫函数 | 单独不算状态机；保存 generation/disposed 的 accountLifetime 见 K05。 |
| [主 store 的导航配置](/Users/young/个人项目/bewlyCat/src/stores/mainStore.ts:26) | 主要计算 Dock 项、首页标签与 URL | 有 store 这个名字并不说明它是状态机；实际导航与交接见 A04。 |

## 建模建议

先把高复杂度控制器的状态维度、允许事件、守卫和副作用所有者写成表，再决定要不要调整代码。多个 boolean 不自动意味着应替换为一个 enum：例如私信可以在阅读历史时接收最新消息，云同步可以在运行时有某一字段被配额阻塞。把正交维度塞进一个巨大枚举会制造组合膨胀。

适合先显式化的是具有不可互换后果的阶段：未发出/已发出、已确认/待对账、加载结束/分页停滞、视觉退出/资源已释放。generation、账号 ID、AbortController、游标和媒体 owner 应留作状态上下文，仍由当前 owner 管理。建议先用现有 TypeScript 的判别联合和小型转换函数；这份盘点没有发现必须先引入状态机依赖的理由。

小型 single-flight、引用计数、按需观察器和局部两三态动画通常可保留原结构，只要入口、结算和清理集中。共享模块的调用方应引用同一份行为，不为每个页面再复制一个状态定义。

## 本次验证范围

- 完成当前工作区源码目录与状态模式扫描、关键转换及调用方核对，并生成本维护文档。
- 只新增此文档；未修改运行时代码、设置或账号数据。
- 未运行 lint、typecheck、测试、构建或浏览器。没有运行时代码变更；本次结果是静态架构盘点，不是竞态复现、浏览器验收或形式化的“无遗漏”证明。
- 复杂流程已有逐段源码依据；归并的小流程族主要依据状态声明、赋值、生命周期入口和调用关系。需要改造某一条时，应进一步展开它的完整事件表及现有行为测试，不能把本表的抽象箭头直接当实现规范。

