# Bewly 播放页：当前结构

本文描述源码职责，不代表新一次浏览器验收。早期迁移计划及 2026-08-30 模块抽样已归入[历史索引](README.md)。

## 模块

| 模块 | 职责 |
| --- | --- |
| `src/contentScripts/index.ts` | 按设置进入播放页，协调导航与退出 |
| `src/utils/bewlyWidescreen.ts` | 当前实例、准备与提交、资源清理 |
| `src/utils/bewlyWidescreenPolicy.ts` | 不依赖 DOM 的就绪和交互策略 |
| `src/utils/bewlyWidescreen/shell.ts`、`geometry.ts`、`styles/` | 外壳、测量和视觉布局（`styles/cardLayout.ts` 为外壳与骨架共享的分区几何） |
| `src/utils/bewlyWidescreen/displayMode.ts` | 视频区（`card` 模式）⇄ 铺满窗口的切换按钮与缩放动画 |
| `src/utils/bewlyWidescreen/railHeadTone.ts` | 右栏顶部透明玻璃上的标签按其下方内容取黑 / 白 |
| `src/contentScripts/listenControl.ts`、`listenStageMotion.ts`、`src/components/ListenPlayer/` | 听视频会话、进出过渡与唱片机舞台（唱片、唱臂、歌词） |
| `src/utils/listenLyrics.ts` | CC 字幕读取（按账号 single-flight）、默认轨道与当前行 |
| `src/utils/bewlyWidescreen/sidebar.ts`、`nativeDom.ts` | 原生侧栏内容、占位与恢复 |
| `src/utils/videoMetadataBridge.ts` | MAIN world 原生组件存活与元数据桥 |
| `src/utils/bewlyWidescreen/danmaku.ts`、`playlist.ts` | 原生弹幕与选集接入 |
| `src/utils/bewlyWidescreenNative.ts` | 原生页面内容适配 |

## 当前契约

- 布局：左侧视频区占窗口三分之二、右栏三分之一（右栏不足 360px 时视频区收窄），贴齐窗口上、下与外侧边缘，直角；右栏自上而下为“简介 / 评论 / 弹幕”标签栏（顶部无色毛玻璃叠层）与面板，信息、选集与推荐都在简介面板里，面板滚到窗口底边。窄窗口（≤900px）单列：16:9 视频区、右栏。视觉与尺寸细节以 `AGENTS.md` 的“播放页”为准，本文件不重复。此前的两版几何（2026-10-20 的左列卡片 + 信息模块、2026-10-21 的 50% 分区）已被取代，原文见 Git 历史。
- 原生播放器留在其所属组件树内，卡片模式按 player frame、铺满模式按整个外壳测量定位，不重建第二个播放器，也不改变地址。
- 铺满窗口：按钮追加在 Bpx 控制栏右侧末尾（原生宽屏 / 网页全屏 / 全屏按钮被隐藏），Esc 返回卡片。切换先把播放器移到终态几何，再从当前绘制帧缩放（中途反向按插值帧续接，画面宽度与中心对齐，竖屏与裁切模式按 `<video>` 实测）：位移缩放为仅 transform 的合成器动画，clip-path 为同时序的主线程动画（2026-10-21 起两端皆为直角，不再插值圆角）。从视频区放大时缩放中的播放器只有画面高，背板 `::before` 按视频区几何（随右栏位置换边）绘制视频区的留边补齐上下（留边颜色见下文“留边过渡”）。期间播放器 `data-bewly-zooming` 与 `#bewly[data-bewly-widescreen-zooming]` 隐藏控制栏、外壳 `data-zooming` 降到播放器之下、跳过玻璃与辅助按钮测量，结束后重测一次。播放器之下的 `.bewly-widescreen-backdrop` 遮住原生页面，卡片时为页面底色、铺满时为播放器底色。
- 性能：模式状态只写在播放器、外壳、背板与 `#bewly` 宿主的属性上，不写 `body` class——该页 body class 变化会重算整页样式（实测 30–40ms/次）。播放器锚定几何变量经 `@property` 注册为不继承，resize 与切换只重算播放器自身。起始帧只改外壳 / 背板属性与面板 opacity；播放器 `data-bewly-display-mode`（控制栏内距与卡片圆角是继承变量，实测约 27ms）与面板 `inert`（约 20ms）由 `heldRestMode` 延到落定帧，那时控制栏仍隐藏。
- 原生重渲染：Bilibili 可能在约 1.2s 时丢弃并重建整个 `.app-v1`（播放器换成新元素）。若外壳已提交，`watchAnchoredPlayerAncestry` 浅观察锚定播放器的祖先链 `childList`，在观察器微任务中调用 `ensureAnchoredPlayer`，新播放器在绘制前回到卡片。
- 作者、工具栏、简介、标签、评论和选集优先保留原节点与事件。需要移动的节点使用占位恢复；原生组件存活由既有桥确认，不能仅凭 DOM 存在或 API 统计判定就绪。
- 评论输入（2026-10-20，后改为固定）：输入框宿主位于 `.bewly-widescreen-panels` 内、评论滚动容器之外，绝对定位于右栏底部内距，评论面板按实测高度预留末尾空间，回弹滚动或列表增减不再使其抖动。最初为评论面板底部 sticky 停靠动态卡片同款输入框（`bewlyWidescreen/commentComposer.ts` 建宿主与 shadow 样式，`PlaybackCommentComposer.vue` Teleport 渲染）。MAIN `inject/externalCommentComposer.ts` 隐藏原生输入框、把楼层 `handleReply` 交给该输入框（原生禁用评论时除外），并把服务端确认的回复写入原生 `newItems`；两侧经 `COMMENT_COMPOSER_TARGET / INSERT` page bridge 通信，只传递经 `toCommentComposerReply` 裁剪的目标字段。
- 侧栏分区分别处理 readiness，迟到或替换的原生根节点由现有观察器接管；缺少必需工具栏时显示既有恢复入口。水合阶段（`resolveWidescreenSidebarHydrationPhase`）：可见时间 12s 内加载；原生评论首屏请求未返回时延长加载态至 30s；之后显示恢复提示并以 1s 节奏继续观察、保持评论预热至 60s，迟到节点到达即清除提示；页面隐藏时暂停并在重新可见时重开预算。
- 播放页隐藏浮动的小电视 Logo；停靠在控制栏的 SideBar 不放“首页”按钮（2026-10-20 曾加入，后应用户要求去掉）。
- 对齐：标签栏、面板内容、输入框、原生评论头像（MAIN 将 `#user-avatar` 移到 0，正文与回复缩进为头像 + space-3）与弹幕列表首列共用右栏的内容线。在线人数只把文本镜像到标题下元信息行末（`syncViewerCount`，带 `data-bewly-viewers-mirrored` 时隐藏控制栏胶囊，铺满时恢复）。弹幕输入框留在原生播放器树内：移到右栏会脱离原生事件归属并破坏铺满模式。
- 右栏标签：简介 / 评论 / 弹幕是轨道滑块（`.bew-segment-control--track`）。壳层只维护 `data-active` 并经 `railTabs.ts` 发布标签栏与当前项，`App.vue` 的 `PlaybackRailTabsIndicator.vue` 把共享 `LiquidSegmentIndicator` Teleport 进标签栏；壳层拆除前清空发布，无应用时选中项自绘底板。
- 评论唤醒（2026-10-20）：Bilibili 加载后会整体重渲染评论应用，新 `bili-comments` 可能在折叠线下无限等待懒加载。评论缺失时每次水合经 page bridge（`COMMENT_LIST_WAKE`）由 MAIN 释放其懒加载等待；首屏在 12s 预算后仍转圈时每个预算请求一次原生 `reload()`（应对挂起的请求）。
- 右栏细节（2026-11-01）：Bpx 的弹幕面板在同一个 `.bpx-player-filter-wrap` 下切换列表 / 屏蔽设定 / 高级弹幕三个视图，显示时写内联 `display: block`、隐藏时清空，默认样式为 none；列表需要的 flex 列布局只能加在带该内联值的列表上，否则切到屏蔽设定后列表仍盖在上面。原生推荐卡片的 `.video-awesome-img` 自带 `top: 10px`，在 120px 缩略图里会露出顶部灰条，需归零。原生评论排序与“点击查看”是 `bili-text-button`，颜色、高度与内距经其 `--_label-text-color(-hover)`、`--_container-height`、`--_leading/trailing-space` 变量设置，悬停色默认取 `--brand_blue`（Bewly 映射为主题色）。楼层分隔线是 `bili-comment-thread-renderer` 内的 `#div`。
- 弹幕按用户排序（2026-10-20 加入，2026-11-02 应用户要求删除）：表头的“用户”列、MAIN 端的排序替换与 `DANMAKU_SENDER_ORDER` 桥消息已一并移除，列表恢复原生三列。
- 评论加载（2026-10-20）：评论面板、加载遮罩右栏与原生 `bili-comments-spinner` 统一为单个加载圆环（面板就绪时先闭合再淡出）。
- 右栏只负责布局（2026-11-12 起没有卡片）：除顶部的无色毛玻璃叠层外不绘制毛玻璃、实色阅读面、边框或圆角裁切，背景是三层（2026-11-13）：封面平均色、其上与视频区同一张模糊色场，最上是页面底色，只透出 `--bewly-widescreen-rail-blend`（浅色 14%、深色 16%，上限按 text-3 在纯黑 / 纯白封面上保持 4.5:1 算出）。封面色与色场由 `syncCoverTone` 写在右栏元素上（不继承），取色前只有页面底色；右栏里不透明的块与关闭毛玻璃时只叠同比例的平铺色 `--bewly-widescreen-rail-tint`。简介面板是平铺的分区（信息、合集或番剧目录、推荐），分区之间是通到右栏两端的发丝线、两侧各 16px；加载骨架同形。
- 听视频时的控制栏（2026-11-12）：`ListenPlayer` 把舞台的取色写到播放器根节点并加 `data-bew-listen-toned`，`videoPlayer.scss` 在该节点上用 `imageTone.toned-surface` 重定义控制栏读取的颜色 token，会话结束即移除。只对 Bewly 播放页有效（原生页的控制栏不读这些 token）。
- 底部控制栏复用统一材质设置，原生弹幕发送控件保留权限、校验和事件。
- 退出、导航和卸载释放本实例的观察器、定时器、动画帧及监听器，并恢复仍存活的原生节点。

- 留边过渡（2026-11-10）：视频区的留边是一组背景层（封面色场、平均色、深色叠层），最上面一层是注册为 `<color>` 的 `--bewly-widescreen-letterbox-veil`。卡片模式透明，铺满窗口（视频区的 `data-bewly-letterbox="canvas"`，在缩放起点写入）与原生全屏（`[data-screen="full"]`）为播放器底色，两者之间按缩放的时长与曲线过渡；背板 `::before` 同步。此前这组背景只在播放器的 `card` 模式属性下生效，而该属性要到缩放落定帧才切换，所以留边在动画结束时跳变。
- 右栏顶部取色（2026-11-10）：顶部叠层没有色调，深色封面滚到深色文字下方（或亮图滚到白字下方）时标签看不清。`railHeadTone.ts` 在面板滚动的帧里按标签下方实际的图片或背景取黑 / 白，停在顶部时不采样。它读的是元素的背景色与图片平均色，不含文字笔画，也读不到关闭的 Shadow DOM 与 `pointer-events: none` 的元素。
- 听视频舞台（2026-11-10）：改为唱片机（玻璃唱片、沟槽、封面标签、唱臂）与 CC 字幕滚动歌词，进出有过渡。进入时的画面定格帧只对 `<video>` 有效；受保护的流画出来是黑的，BTR 的非 video 播放器没有定格帧，此时舞台直接在留边上淡入。字幕列表对未登录用户为空，因此未登录时没有歌词。

## 加载顺序（2026-10-19 复核）

1. `document_start`：`pageLoadingGuard` 给播放页加一层纯底色遮盖，原生播放器继续在下方初始化。
2. 设置就绪且页面可见：默认进入 Bewly 播放页时挂载加载骨架（与卡片布局及右栏位置一致），同一任务内撤下遮盖，原生页面不出现可见帧。
3. 等待提交：播放器元数据就绪，且原生结构（作者、元数据、弹幕、推荐 / 选集、评论根）齐备时，DOM 解析完成即进入 160ms 稳定窗口后提交；结构仍不完整时才等 `load`（或 DCL 后 3s 兜底）再加 1.2s 沉降后提交。图片、广告等资源不再拖住骨架。
4. 提交后搬入原生节点并开始侧栏水合；原生控制栏、弹幕栏与辅助按钮布局稳定后骨架对齐并淡出，同时执行播放模式的“已应用”后续（默认弹幕、自动播放、稍后再看按钮）。控制栏缺件永远无法稳定时，提交 4s 后照常揭示外壳。
5. 骨架期间原生 `playing`（含自动播放、未交互页面）不会撤下骨架；只有自动连播传入的许可可以让视频提前露出。

## 回归

运行 `pnpm test` 中的播放器生命周期、原生节点、弹幕和布局回归；浏览器检查分别记录 UGC、PGC、换集、卡片 ⇄ 铺满窗口（含中途反向与 Esc）、原生全屏、退出、主题与窗口尺寸。条件模块以当前匹配的原生结构和实际验收结果为准，不沿用旧抽样表声称已覆盖全部 Bilibili 模块。
