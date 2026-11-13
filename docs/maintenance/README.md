# 维护索引

当前行为以源码与设置默认值为准。这里的记录解释决定的来由，不是执行指令。

## 当前文档

- [开发约定](../../AGENTS.md)：工作方式、设计系统、页面与运行时规则。
- [控制栏布局回归修复](2026-11-13-player-control-layout-regression.md)：保留原生状态图标显隐，统一图标画布、按钮间距与高度，修正窄栏溢出及长时长布局。
- [听视频音量与右键菜单](2026-11-13-listen-volume-context-menu.md)：补齐响度请求与原生音频设置同步，统一右键菜单样式、开放听视频右键，以及精准空降进度修正。
- [歌词与控制栏弹窗](2026-11-13-player-controls-popovers.md)：歌词均衡换行、字幕完整表单适配、共享弹窗 token、按钮对齐和原生控件对比度回归。
- [听视频与页面切换](2026-11-13-listen-and-page-continuity.md)：唱片轻阴影、按标签页延续听视频模式，以及搜索、收藏和番剧时间表的状态恢复与资源释放。
- [弹幕列表空白修复](2026-11-13-danmaku-list.md)：移除与原生虚拟列表冲突的顶部留白，修正骨架位置，记录原生列表的隔离布局回归。
- [全项目审查与已批准项落地](2026-11-12-full-audit.md)：播放页审查的 10 项与 9 条审美建议的落地（含信息卡平铺、右栏染色、阅读行高、听视频控制栏取色），项目其余部分的扫描结果、待审查项与设计建议；第二轮（11-13）的断言精简、右栏三层封面色、空状态与关注按钮统一、展开收起与悬停统一、共享工具抽取、搜索结果页卡片化，以及下一批优化项。
- [播放页与听视频审查](2026-11-12-playback-audit.md)：测试夹具缺口、唱针落下被打断、右栏取色的重复计算、播放页颜色别名收敛，以及待审查项与审美建议。
- [全项目审查](2026-11-11-project-audit.md)：未用 locale 键与 CSS token 清理、退役设置单一登记、token 回退值对齐、待审查清单与设计建议。
- [复杂流程状态显式化](2026-11-10-explicit-state-machines.md)：听视频、设置同步、消息读写、宽屏加载、Feed 与交互转换的阶段、所有权及行为回归；[改造前盘点](2026-11-10-implicit-state-machines.md)保留完整流程索引。
- [状态机继续复查](2026-11-11-state-machine-recheck.md)：剩余 13 个控制器、接受后确认与迟到任务修复、原清单全部领域的覆盖及保留决定。
- [搜索历史读取修复](2026-11-11-search-history-native-storage.md)：与原生顶栏共用本地记录，移除旧跨域存储依赖，保留读写失败及并发修改检查。
- [原版 BTR 下恢复听视频](2026-11-08-listen-btr-retained-owner.md)：取消配套补丁的强制依赖，通过保留暂停的播放器 owner 恢复独立音轨交互，以及实站验证和缓冲边界。
- [收尾审查与 CI 修复](2026-11-05-final-audit.md)：额外的私信/路由/取消/交接缺口、测试约束收敛、完整测试链结果与真实浏览器夹具边界。
- [可靠性与增量性能修复](2026-11-05-reliability-followup.md)：听视频/BTR 交接、DNR/后台所有权、私信窗口、搜索、观看历史增量、几何与依赖审计，以及验证边界。
- [工具链与安全升级](2026-10-22-toolchain.md)：Node/pnpm、依赖替换、CI 失败原因与暂存的上游修复补丁。
- [算法与实现性能审查](2026-10-22-algorithm-audit.md)：关键路径复杂度、合成基准、已确认的重复工作与后续优先级。
- [性能审查实施](2026-10-22-performance-implementation.md)：Worker 过滤、通知窗口化、增量索引、评论树与冗余收敛。
- [AGENTS.md 旧版条目存档](2026-10-21-agents-rules-archive.md)：2026-10-21 精简前的完整原文，按日期记录的决定细节。
- [上游协作](upstream-workflow.md)：远端与分支。
- [播放页结构](widescreen-native-adaptation.md)：原生节点归属与模块职责。
- [消息页回归](../notifications/native-message-regression.md)：当前功能与验证范围。
- [System 协议证据](../notifications/system-protocol-investigation.md)：已采样的协议与 fixture。
- [失效私信卡片](2026-10-10-whisper-expired-cards.md)与[会话管理协议](2026-10-11-private-session-actions.md)：实现记录。
- [收藏夹管理与切换加载](2026-10-12-favorite-folder-management.md)：原站协议、编辑与上传生命周期、排序、清理及切换审查。
- [动态页精简与推广识别](2026-10-12-moments-simplification.md)：分组移除、直播预览、文字／图文／转发推广识别及侧栏材质复用。
- [动态分页与直播预览修复](2026-10-13-moments-pagination-preview.md)：混淆口令识别、过滤后自动分页、评论空尾页／结束状态及有界直播源切换。
- [交互动效复查](2026-10-12-interaction-motion-audit.md)：弹窗材质跳变修复、现有等价实现、低开销优化顺序与验证范围。
- [三批动效引入](2026-10-12-interaction-motion-implementation.md)：就绪交接、局部布局与刷新连续性、骨架可见性和无尺寸监听的光学层（液态光学层已于 2026-10-19 移除）。
- [资料库内存优化](2026-10-12-library-memory.md)：隐藏原站资源、同步 iframe、虚拟窗口、折叠内容与首屏分页边界。
- [内容卡片统一](2026-10-13-content-card-unification.md)：卡片层级、内嵌圆角、元信息与骨架同步，以及旧视频布局退役。
- [上游兼容适配 A01—A13](2026-10-13-upstream-compatible-a.md)：逐项差额、等价实现、协议/事务归属、实际验证与实站边界。
- [侧栏搜索与切页连续性](2026-10-13-sidebar-continuity.md)：共享搜索/标题、持久玻璃外壳、消息侧栏宽度过渡和控件归属。
- [字体规范落地](2026-10-14-typography.md)：默认 UI 字族、角色字重、数字与线性图标，以及用户指定加粗图标的保留范围。
- [Windows 动效兼容性](2026-10-14-windows-motion-compatibility.md)：压缩后 CSS 时间单位、共享弹窗异常收尾、占位滚动条补偿及实机验证边界。
- [运行时收敛（三阶段）](2026-10-19-runtime-convergence.md)：液态玻璃移除、分页与共享几何、增量数据与索引、分层缓存、媒体恢复、按消费者投递、设置按范围规范化、宿主样式拆分与首页清理修正，以及未完成项原因。
- [样式重算与布局抖动](2026-10-22-style-recalc.md)：类名属性选择器导致的整树失效、页面样式按路由与站点注入、继承变量与输入框高度的作用范围、指针事件先读后写，以及测量数据与剩余项。
- [界面尺寸：按屏幕缩放](2026-11-01-interface-scale.md)：从屏幕尺寸与 DPR 推断显示器、观看距离补偿、像素对齐的档位、文字半幅缩放、token 注册与 JS 换算，以及猜测边界。
- 2026-10-15 至 10-17 的实现记录（现行规则以 `AGENTS.md` 为准）：[边框、图片描边与内发光](2026-10-15-border-policy.md)、[配色修订](2026-10-15-color-policy.md)、[中性色统一派生](2026-10-15-neutral-derivation.md)、[页面切换与状态延续](2026-10-15-page-continuity.md)、[回退后已实施修订的复核](2026-10-15-post-rollback-review.md)、[动态卡片悬浮评论与回复](2026-10-16-moment-reply-composer.md)、[文字层级与视觉表面阶梯](2026-10-16-typography-surface-hierarchy.md)、[动态转发输入框与评论统一](2026-10-17-forward-composer.md)、[消息页输入栏统一](2026-10-17-message-composer.md)、[动态评论展开卡顿修复](2026-10-17-moment-disclosure-motion.md)、[数据图表的 Mono 统一](2026-10-17-mono-charts.md)、[头像资料卡与私信定位](2026-10-17-user-profile-navigation.md)。

## 历史原文

以下记录已从工作目录收敛到本索引，原文固定保存在 Git 提交 `98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad`。记录中的旧分支、开发构建号、页面截图和当时测试结论只属于对应日期。

无需联网也可读取原文：

```sh
git show 98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad:docs/maintenance/2026-09-16-upstream-experience-adaptation.md
```

| 历史主题 | 固定版本 |
| --- | --- |
| 2026-09-04 功能与交互审查 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-04-feature-audit.md) |
| A01–A24 实施与验证记录 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-05-a01-a24-implementation.md) |
| Bewly Nocturne 0.1.1 项目质量审核 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-05-project-quality-audit.md) |
| Bewly Nocturne 结构重构记录 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-05-structural-refactor.md) |
| Dock 液态玻璃 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-06-dock-liquid-glass.md) |
| 玻璃层级与实色状态 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-06-surface-materials.md) |
| 播放页排版与共享液态玻璃 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-07-floating-liquid-glass.md) |
| 底部液态玻璃与大型表面性能修正 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-07-glass-performance-correction.md) |
| 加载骨架与播放栏初始化 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-07-loading-skeletons.md) |
| 播放侧栏内容与原生操作恢复 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-07-playback-content-recovery.md) |
| 首页搜索与播放页标签修正 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-08-home-and-native-tags.md) |
| 原生组件挂载与广告规则 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-08-native-actions-and-advertising.md) |
| 播放页侧栏布局调整 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-08-playback-sidebar-layout.md) |
| 上游功能语义适配 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-08-upstream-functional-adaptation.md) |
| 2026-09-08 私信交互与输入栏 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-08-whisper-interactions.md) |
| 2026-09-16 上游体验与生命周期适配 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-16-upstream-experience-adaptation.md) |
| BewlyMac Brand Fork Implementation Plan | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/plans/2026-08-04-bewlymac-brand-fork.md) |
| BewlyMac Dual-Repository Upstream Workflow Implementation Plan | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/plans/2026-08-05-dual-repository-upstream-workflow.md) |
| Dock Collapse Orb Implementation Plan | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/plans/2026-08-09-dock-collapse-orb.md) |
| Settings Page Shells and Surface Alignment Implementation Plan | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/plans/2026-08-09-settings-page-shells-and-surface-alignment.md) |
| Stage 2 P0–P2 Deterministic Fixes Implementation Plan | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/plans/2026-08-09-stage-2-p0-p2-deterministic-fixes.md) |
| Search Focus, Sticky Search, and Notifications Skeleton Plan | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/plans/2026-08-10-search-focus-sticky-notifications.md) |
| Notifications Runtime Reliability Implementation Plan | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/plans/2026-08-14-notifications-runtime-reliability.md) |
| BewlyMac 品牌迁移与上游同步设计 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/specs/2026-08-04-bewlymac-brand-fork-design.md) |
| BewlyMac 双仓库上游协作设计 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/specs/2026-08-05-dual-repository-upstream-workflow-design.md) |
| Dock 收起圆球交互设计 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/specs/2026-08-09-dock-collapse-orb-design.md) |
| 设置页框架与表面统一设计 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/specs/2026-08-09-settings-page-shells-and-surface-alignment-design.md) |
| 搜索聚焦、单搜索栏吸附与消息页骨架设计 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/specs/2026-08-10-search-focus-sticky-notifications-design.md) |

旧播放页[迁移设计](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/widescreen-native-adaptation.md)、[模块抽样](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/widescreen-module-audit.md)和[早期消息页回归清单](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/notifications/read-only-initial-build-regression.md)也保留在同一固定版本。

新增维护记录只写决定、代码落点和未解决事项，不写操作流水。
