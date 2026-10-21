# 运行时收敛（三阶段）

三阶段使用同一份数据与生命周期契约：共享视口几何与滚动意图（一阶段）、单一数据源与不可变列表、增量索引和分层缓存（二阶段）、按消费者登记的状态投递、按范围规范化的设置和分离的宿主样式（三阶段）。被替代的旧广播、重复克隆、无效清理与旧样式路径已一并删除。

## 第一阶段：液态玻璃移除、分页与几何、评论树、播放器观察

本轮只处理液态玻璃移除、动态分页 / 滚动归属、共享视口几何、动态卡片拟合、评论树增量更新和原生播放器观察。第二阶段的数据模型改造、第三阶段的后台 / 载荷重构不在本轮范围内。

### 液态玻璃移除

- 删除 `LiquidGlassSurface.vue`、`composables/useLiquidGlass.ts`、`utils/liquidGlass.ts`（`attachLiquidGlass` / `vLiquidGlass`）、`constants/liquidGlass.ts`、`styles/liquidGlass.scss`、`Settings/Appearance/LiquidGlassSettings.vue`，以及 `@wxperia/liquid-glass-vue` 依赖、其补丁和 `pnpm-workspace.yaml` 的补丁登记。
- Dock 外壳与刷新 / 回顶按钮、侧栏按钮与页面模式切换、搜索框、顶栏浮层、私信“回到最新”导航和播放页底部控制卡回到原有表面：自身绘制 `--bew-filter-glass-1` 毛玻璃、边框与阴影；`disableFrostedGlass` 把该 token 置为 `none`，不再采样背景。删除了 `[data-bew-liquid-glass]` 强制宿主透明的规则、`--bew-liquid-frame-*` / `--bew-liquid-outer-shadow` / `--bew-liquid-glass-color` 变量和 `liquid-glass` 样式分支。
- `GLASS_SURFACE_CONTEXT`（Dialog / 设置窗口的嵌套实色判断）迁到 `composables/useGlassPanelMotion.ts`。
- `enableDockLiquidGlass`、`dockLiquidGlass*` 与旧 `dockLiquidGlassFrost` 进入 `RETIRED_SETTINGS_FIELDS`：权威读取后清理、云同步不上传也不接收。普通毛玻璃强度与关闭开关保持不变。四种语言的设置文案与搜索条目同步删除。
- 保留 `LiquidSegmentIndicator` / `--bew-liquid-indicator-*`（纯几何滑块）、来源动效、CountBadge 例外、顶栏渐进模糊、设置窗口 `PanelTopBlur` 与会话边缘模糊。

### 分页提交、布局结算与滚动意图

- `Moments.vue` 的每批数据有 `layoutCommit` 版本；网络请求在 `finally` 中结束（`isLoading` 解锁），随后 `settleMomentLayout` 只等待 DOM 提交与虚拟窗口稳定（至多三次 `nextTick`），刷新、换页、换号、卸载或更新的提交都会使其失效。隐藏页通过 `visibilitychange` 恢复后再结算，不依赖暂停的 RAF。
- 恢复位置使用 `scrollIntent.claimScrollPosition` / `canRestoreScrollPosition`：显式跳转与其他页面恢复（经 `scrollToPosition`，`App.restorePageScroll` 已改走此路径）、滚动输入优先；无输入的上移视为浏览器夹紧，内容可容纳时才恢复。
- `momentFeedReader` 返回服务端 `hasMore` 与 `stalled`（未推进游标 / 空页）。`paginationStalled` 停止自动请求并显示手动“加载更多”，不再写成“没有更多”；过滤预算耗尽保持 `hasMore`。首屏补齐、800ms 让步与失败重试沿用原逻辑。

### 共享视口几何

- 新增 `utils/viewportGeometry.ts`：每个滚动所有者一次测量，供同一轮的所有消费者共享；`subscribeViewportFrame` 把滚动、尺寸和显式提交（`invalidateViewportGeometry`）合并到每帧一次回调。不同滚动区各自独立。
- App 的私有滚动 RAF、`useMomentLayout` 的滚动监听 + RAF、`useCardWindow` 的滚动 / 尺寸监听 + RAF、`imageLoadQueue` 的方向监听改为订阅；VideoCardGrid 的预载几何复用快照。
- 滚动帧只使用 IntersectionObserver 的预载区状态（持续相交时继续请求）；数据提交、视口恢复和尺寸变化后执行一次合并的几何补查。滚动开始 / 结束仍只在状态变化时广播。

### 动态卡片拟合

- 描述行数拟合合并为批次：重置 → 只读测量 → 集中写入（值不变不写）→ 一次布局后合并最终高度。绑定、窗口宽度变化与 ResizeObserver 的请求在同一微任务合并。
- 纵向卡片由 CSS 默认 clamp 表达，不再 JS 拟合；只有宽版分栏卡片（正文与媒体同行拉伸）测量剩余高度。失效键包含宽度、gap、字体修订、标题 / 描述与折叠状态。
- 动态网格 gap 从实际网格（或骨架）测量；`VideoCardGrid` 的 `cardGap` 移出 computed，由容器尺寸与布局类变化更新，估算宽度扣除 gap。只有 `content-visibility` 回退路径写入按估算得出的 `contain-intrinsic-size`；窗口化路径仍由 spacer 与实测索引负责。

### 评论树

- 树更新分为 topology / content / geometry：点赞与局部文本只合并到该线程的下一帧，拓扑键（关系、模式、折叠键、页缓存版本）不变时只刷新缩进上限与线条；尺寸变化不再重新解析父链。线程内用 renderer Set 替代逐项 `some`。
- ResizeObserver 复用并按目标增量增删；同一 ShadowRoot 内被祖先覆盖的目标去重，ShadowRoot 边界保留；首次投递和尺寸未变的投递（自身写入）被过滤。`@` 前缀观察只观察 ShadowRoot 边界，并在内层富文本替换时增量发现。
- 深链只协调包含目标回复的线程：目标出现、展开时触发，等待窗口内保留有界退避补查（约 5.5 秒），哈希变化、模式关闭即停止；移除了全局 scroll / scrollend / resize 刷新与固定多组计时器。

### 原生播放器观察

- 稍后再看按钮：发现期观察 body 插入，以及工具栏元素与已知隐藏候选祖先的 class/style/hidden；挂载后只观察工具栏宿主（子节点与属性）及其浅层祖先，body 上无关的样式变化不再触发工具栏搜索。宿主被替换、转移（宽屏）或移除时回到发现期。
- 播放页会话：body 子树观察只在侧栏完全就绪前或 15 秒发现窗口内运行；稳定后观察根节点、原生原位父节点、共享 `observePlayerDom` 与浅层祖先。原生组件重建事件、播放器根替换和切集导航重新打开发现期。
- `hasPlayerMediaMutation` 按 mutation 批次缓存，所有订阅者共用一次查询。

### 验证

- `pnpm typecheck`、`pnpm lint` 通过。
- 新增 / 改写检查：`frosted surfaces`（液态运行时与设置完全移除、普通毛玻璃单层采样、Dialog 嵌套实色）、`Dock glass`、`pagination ownership`、`viewport geometry`、`native comment tree`、`watch later toolbar`。修正了 `mounted Moments`、`A10 VideoCardGrid`、`moment window` 的过期依赖；测试工具为无依赖的 `bilibiliLocale` / `bilibiliLiveContext` 自动提供真实模块，恢复了播放页内容、播放器生命周期与侧栏相关检查。
- 未执行 build；未在实站验证（需重启 `pnpm dev` watcher 后重载扩展验收 Dock / 搜索 / 浮层材质、动态分页、深链评论线和宽屏切换）。

### 剩余限制

- 稳定期的播放页只观察已知宿主；不在根、原位父节点、播放器或其祖先变化范围内、且没有原生生命周期事件的迟到节点，要等下一次导航或组件重建事件才会被发现。
- 顶栏显隐仍按原生滚动事件更新（浏览器已按帧合并），未并入共享视口帧。

## 第二阶段：数据、索引、缓存与预览媒体

在第一阶段之上，只调整数据、索引、缓存和媒体调用链；样式、布局、交互、后端协议与产品功能不变。

### 单一数据源与增量投影

- 推荐（`useForYouRecommendations`）：`videoList` / `appVideoList` 仍是唯一可写的已接受列表，改为浅响应并遵循不可变更新（每批替换根数组）。新增 `recommendationFeed.ts`，维护两份派生结构：去重键索引与可见投影（`blockAds` 时隐藏广告）。追加只对本页去重、分类、转换、过滤；列表被替换（刷新、撤销、换模式）或广告开关变化时才重算。广告仍留在已接受列表中，关闭过滤或撤销后可恢复。广告分类在接受时写入 `isAdvertisement`，展示映射 `displayData` 只转换一次，键与未变化条目的引用保持。
- App 模式跨页去重改用该键索引（普通卡片的全部稿件身份、广告的创意身份），最近展示键只在每次请求时转为 Set；不再每页 flatMap 整个列表或对每条广告 `some` 扫描。
- 动态（`Moments.vue`）：已接受列表为浅响应；追加与删除替换根，已确认的单条补丁（点赞、转发数）按位置索引就地替换该实体，不复制整表，卡片经布局窗口更新。位置索引只在根被追加以外的方式替换后重建。

### 浅响应入口

- `useHomeTabState().shallowRef` 与 `usePageViewState().shallowRef` 用于大型展示集合、只读原始数据与快照。已迁移：推荐两份列表、最近展示键、Web 展示分组（改为替换而非 push）、推荐撤销 / 重做快照、动态列表与布局列数组（未被模板响应式消费）。输入、设置、草稿与事务状态未改动。

### 行高索引与列总高

- `CardRowMetrics` 新增 `append`（新节点聚合其覆盖范围内的已有子节点）、`truncate`（前缀节点无需重算）与 `total`。
- `useCardWindow`：键列表之外的行高输入都未变时，只从第一个变化的行起截断并重建后缀（包括上一页未满行及被真实卡片替换的加载骨架）；其余变化仍完整重建。测量缓存在布局版本变化或键离开列表时失效。
- `momentColumnIndex`：同一列数组增长时只追加新增行；被替换的列单独重建；布局键或列数变化时全部重建；相同键、顺序和高度的实体替换不重建。提供维护中的列总高与位置查询。`useMomentLayout` 的追加、空闲尾部平衡使用这些总高，平衡只读取一次高度并逐次增量调整，只复制实际移动卡片的列；删除只替换所属列。原有阅读期、临近底部与交互卡片的禁止重排规则不变。

### 缓存分层

- `createHomeTabCache` 在标签停放时一次估算条目规模（`viewSnapshotBudget.ts`，只计容器元素数），预算随保存、取用、淘汰维护。超出预算时先对最旧标签执行可重建字段的收缩（网格窗口的测量高度），再整体淘汰最旧标签；列表、游标、锚点不截断、始终成对保留。`usePageViewState` 按同一估算整体淘汰最旧视图。
- `VideoCardGrid` 的卡片状态：没有交互意义的默认状态在卡片回收时释放，停放快照只保存移除、预览进度和已解析稍后再看 aid 的状态。
- 推荐历史共享已接受的数组与实体，不再复制列表。

### 图片队列

- `imageLoadQueue` 的任务改为提供 `geometry`（元素与滚动根）；优先级按几何版本缓存，一次 pump 内同一根矩形只读取一次。滚动 / 布局帧、字体加载、页面恢复可见及元素替换使相关优先级失效；仅释放槽位时不重新测量或排序。离屏任务最多占用四个槽位，留两个给可见图片；隐藏页面不启动新任务。失败回退、超时和取消后不写回旧元素保持不变。

### 预览媒体

- `previewMediaSession.recoverHlsMediaError`：每个 HLS 实例最多两次 `recoverMediaError`（400ms、1500ms 退避），等待中的恢复吸收重复错误；耗尽后释放实例并进入已有失败路径（卡片预览失败、动态直播切换下一个备用源）。只有恢复后连续播放 3 秒才恢复预算，`play()` / `canplay` 不会清除；关闭、换源、卸载随会话清除计时器。
- 新增 `fullscreenChange.ts` 共享全屏监听：`VideoCardCover` 只在持有预览元素或仍处全屏时订阅，静态卡片不再注册文档监听；`MomentVideoPreview` 复用同一对监听。全屏中 mouseleave 仍保留元素与订阅。

### 验证

- `pnpm lint`、`pnpm typecheck` 通过；新增 `stage 2` 检查 7 项（Fenwick 追加/截断与全量一致、列索引增量、缓存收缩与淘汰、推荐投影、图片队列、HLS 恢复预算、共享全屏监听）。修正了 `moment window`（夹具重复追加）、`A05`、`A17/A19`、Following、直播预览的依赖。保持运行的 selected-p2 检查中 513 项通过，其余 27 项为既有缺失依赖或既有失败。
- 未执行 build，也未在实站验证。

### 保留与未处理

- 未迁移排行、热门、关注等其他首页标签的数据缓存（仍为原响应式方案）；收藏页头像补齐路径未改动。
- 第三阶段的后台 / 载荷重构未开始。

## 第三阶段：消息、设置、载荷、样式与首页后台

本阶段收敛跨页面消息与持久化、设置处理、跨环境载荷、宿主样式与首页后台工作，复用前两阶段的数据与生命周期契约。

### 后台共享状态按消费者同步

- 新增 `background/stateConsumers.ts`：按标签页、frame 与文档身份登记实际使用某个状态主题（`topBar`、`watchLater`、`videoHistory`）的页面，并区分隐私上下文。读取或租约申请即登记为活跃；页面隐藏或 TopBar 停止读取时上报为非活跃，此时只标记 stale，恢复时（`utils/stateConsumer.ts`）对账一次。登记信息保存在 session storage，worker 重启后仍在，不依赖心跳或保活。页面关闭、`pagehide` 释放、同一 frame 被新文档替换或投递失败时移除。
- TopBar broker：投递只发给活跃的同主题、同隐私上下文页面，同一资源修订不重复发送；租约与版本仍按资源串行，且每个资源只持久化自己的一条记录（`topBarStateBroker:v4:<键>`），一个慢写入不再阻塞其他资源。租约授予、版本提交仍在回复前写入。
- 稍后再看 broker：按账号分别持久化记录并维护账号索引，写入按账号串行；数量读取广播新的 `count` 更新，不携带成员列表。视频观看记录与登录状态同样通过登记表投递；登录变化对每个文档只发一条。删除了这几处每次变更都对所有匹配页面 `tabs.query` 的广播。

### 设置：稳定引用与按范围规范化

- 本地编辑逐个顶层字段做结构比较（`settingsValuesEqual`，与 JSON 一样把 `undefined` 视为缺失，不再 JSON 序列化），只克隆变化的字段；未变化的字段沿用不可变快照，与正在编辑的 `data` 不共享可变引用。
- 渲染时 canonical → inFlight → queued 只做浅层叠加，规范化只用一份工作副本（原先每轮四次整对象克隆）。每次完整规范化都会记录它读写过的顶层字段；之后某轮变化的字段都不在这些依赖内时，直接复用上次结果。应用 canonical 值、导入、重置，或变化触及依赖时，仍完整规范化；遍历全部字段的规范化视为依赖全部字段。退休的液态字段由规范化删除，因此会被记为依赖：导入或云同步带入这些字段时一定走完整路径，仍无法复活。
- flush:pre、原位 reconcile、首读快速路径、ACK 前捕获本地编辑、操作 ID 重放、导入/清除/旧 epoch 的处理均保持不变。

### 跨环境载荷

- 稍后再看数量读取（TopBar 周期同步）由客户端带上已持有列表的 epoch 和 revision；列表在该 revision 后未变时，后台省略成员列表，客户端沿用自己的列表。成员未变而只有数量变化的分页读取，广播 `count` 更新而不是完整快照。
- 核对后其余接口在后台只传 JSON 原文，由各数据 owner 转换一次（推荐、动态、通知解析已在后台完成），没有发现同时传输 raw 与 display 两份对象的路径，因此未裁剪其他接口字段。

### 宿主样式与 Shadow UI

- 内容脚本构建仍只编译一份样式源；`scripts/contentStyleSplit.ts` 在 `generateBundle` 中把它分成两份：`style.css`（manifest 注入宿主）去掉只能在 Shadow root 内匹配的 `:host` 规则和 Vue 作用域规则；嵌入入口脚本的 Shadow 副本去掉只能匹配宿主文档的 `html` / `body` / `:root` 规则。规则顺序保持，`@media`、`@container` 等嵌套块逐条过滤，`@keyframes` / `@font-face` 两边保留。以现有开发产物的 style.css 为输入实测：宿主 1.72 MB → 1.12 MB，不含作用域规则和 `:host`；Shadow 副本 1.23 MB。文件名、资源路径、运行世界、CSP 与 web-accessible 范围不变。
- 同一文档只有一个 Bewly Shadow root，没有复用同一样式表的机会，所以没有引入 `adoptedStyleSheets` 缓存。

### 首页后台工作

- 删除 `bilibiliScriptCleanup.ts`：它在 ISOLATED 世界把 `__INITIAL_STATE__` 等全局量设为 null，碰不到 MAIN 世界的原站对象，没有实际效果。
- 扩展侧对被替换首页仍做的事：隐藏原生首页、挂起其图片（`hiddenHomepageImages`，可恢复），并保留原生顶栏。appearance-only 子站已由 manifest `exclude_matches` 排除，不启动主应用；播放相关功能按路由键在非播放页保持休眠。

### 第三阶段验证

- `pnpm lint`、`pnpm typecheck` 通过。新增 `stage 3` 检查 5 项：消费者登记与投递、TopBar 按记录持久化与互不阻塞、设置结构比较与依赖记录、样式拆分、数量回复省略列表。测试工具会自动为页面夹具提供状态订阅桩，为 broker 夹具提供真实登记表。保持运行的 selected-p2 检查中 518 项通过，其余 27 项为既有缺失依赖或既有失败。
- 未执行 build，也未在实站验证。

## 未完成及原因

- 内容脚本按场景拆包：入口仍是单一 IIFE，源码中的 `import()` 会被内联，产物没有真正分包。要真正分层，需要改为 ES 分包、配套运行时加载器和 web-accessible 资源，而且必须经过构建并在页面中加载验证；本任务不允许执行 build，所以没有改动产物格式，场景隔离仍依靠运行时门禁。
- 被替换首页的原生任务（轮播、曝光上报等计时器与请求）没有公开的停止或释放入口；按约束不猜测私有字段强制销毁，也不全局改写 `setInterval` / WebSocket，这些任务仍随原生首页运行。
- 收藏页头像补齐路径仍使用原响应式缓存方案（首页其余标签已在下文的复核中迁移）。
- 以下只有在重启 `pnpm dev` 并重新加载页面后才能确认：
  - 样式拆分后宿主与 Shadow 的实际外观，包括冷启动不闪；
  - 新的消息登记与投递在多个标签页、iframe、无痕窗口下的表现；
  - 稍后再看数量更新与列表省略；
  - 删除清理模块后首页的启动。
  当前 watcher 的内容脚本产物仍是改动前的版本。

## 2026-10-19 性能复核

对一份外部性能清单逐项核对源码后，引入以下改动：

- 骨架闪光：骨架视频卡根节点标记 `data-bew-skeleton-group`，封面闪光随卡片信息骨架一起由共享可见性观察器暂停；`LazyPicture` 只在闪光期间登记 `observeSkeletonGroup`，离屏或隐藏标签页停止重绘。
- 封面宽度：`observeCoverWidth` 依赖 ResizeObserver 在绘制前给出首个宽度，只有挂载即设置来源的 eager 封面和无 ResizeObserver 的回退路径才同步读取布局。
- 首页其余标签（关注 / 旧关注、热门、排行、每周必看、入站必刷、直播、订阅剧集）的列表改用 `tabState.shallowRef`，按页替换根，不再逐项 push、按下标写入、`Object.assign` 或截断 `length`。
- 收藏页视频 / 专栏 / 其他收藏列表与观看历史列表改为 `shallowReactive`：数组操作保持原写法与响应，行对象不再深层代理；收藏夹目录仍为深响应式，因为编辑会原位修改标题、属性与计数。
- 搜索结果 `useSearchRequest` 改为 `shallowRef`：各页面都以合并 / 去重后的新数组替换根。
- 动态瀑布流 `cardHeights` 改为普通对象，只由命令式布局读取；`coverRatios` 仍为响应式，因为模板渲染时读取图片比例。
- 首页滚动位置不再是响应式值，每帧只在越过吸顶阈值时更新搜索人物显示状态；阈值变化时重新判断。

核对后未引入：

- 收藏筛选面板的 UP 主排序：计算属性只在面板挂载（`v-if`）时求值，关闭时不运行。
- 观看历史排序：服务端顺序已有序，TimSort 对有序 / 逆序输入为线性。
- 私信时间线：输入草稿只写 `draft`，不触发 `timelineItems`；每会话消息受 100/200/500 上限约束，不会无限增长，虚拟化与入场、搜索定位、ACK 的耦合风险大于收益。
- `VideoCard` 的 `useUserRelations`：卡片负责保留并派生关注状态，网格负责批量查询，职责不同；`createRenderItem` 的转换按键与条目缓存，重复调用只是小对象分配。
- `MasonryGrid` 的第二次读取只在可见卡片位移、需要 FLIP 终点时发生，是动画必需的一次读取。
- `LoadingRing` 闭合时读取一次计算样式，需随减少动态效果实时变化，不缓存。
- 原生稍后再看列表观察器只在该原生页面启用；广告屏蔽的 `attributeOldValue` 用于在广告标记移除时恢复卡片，根节点优先为 feed 容器且有属性过滤；评论前缀观察器需按楼层单独断开，`MutationObserver` 没有 `unobserve`，共享观察器反而要全部重连。
- `adoptedStyleSheets`、首页 MAIN 世界任务：理由同上文“宿主样式与 Shadow UI”和“未完成及原因”。

验证：`pnpm test`、`pnpm lint`、`pnpm typecheck` 通过；Ranking 夹具改为 `shallowRef` 形状。未执行 build，未在实站验证。

## 2026-10-19 动画优先的内容切换

分段滑块指示器（首页 Tab、Dock、设置分段等）与滚筒弹簧都由 JS 每帧写入响应式几何；此前点击后约 90ms 新页面就开始挂载，挂载与首批渲染占用主线程，造成滑块中途掉帧。

- `utils/motionPriority.ts`：运行中的交互动画登记一个有时长的 hold，结束、取消或卸载时释放；`afterMotion()` 在全部 hold 结束后返回，单次等待最长 `MAX_MOTION_WAIT_MS`（800ms），遗漏释放也不会阻塞加载。
- 登记点：`useLiquidSegmentIndicator` 在 `active-key` 变化时先同步登记预估时长，morph 开始后换成按格数计算的实际时长；`useSpringValue`（滚筒）在目标变化时登记约 1.2 个响应周期；`useGlassPanelMotion`（Dialog、确认框、设置窗口及来源缩放）登记自身的 WAAPI 动画。
- 消费点：`useReadyPageTransition`（App 页面、首页 Tab、设置分区、搜索分类、消息分类）把旧内容的淡出时长取为默认 90ms 与剩余动画时长的较大值，淡出完成后再等待 `afterMotion()`，之后才交换并挂载新内容、执行 210ms 淡入。没有交互动画时时序与原来一致；减少动态效果下滑块和弹簧不登记。
- 设置窗口原本已在缩放结束后才挂载内容，未改动。

验证：新增 `Motion: interaction motion plays first…` 检查（上限、重复释放、弹簧登记与释放、淡出覆盖滑块、滑块结束后才交换）；`pnpm test`、`pnpm lint`、`pnpm typecheck` 通过。未执行 build，未在实站验证。
