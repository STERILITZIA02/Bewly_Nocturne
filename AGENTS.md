# AGENTS.md

Bewly_Nocturne：基于 BewlyCat 维护的 bilibili 浏览器扩展（Vue 3 + TS + Vite + UnoCSS，pnpm）。

本文件写的是当前产品规则，与源码或用户最新要求冲突时以后者为准。决定的背景与细节在 `docs/maintenance/`（[索引](docs/maintenance/README.md)；精简前的完整条目见 [2026-10-21 存档](docs/maintenance/2026-10-21-agents-rules-archive.md)）。

## 工作方式

- 读够周边代码就动手，范围限定在任务内。不做仪式性检查：不反复核对 remote、分支或哈希，不重复确认已给的授权。
- 先看全局再写：搜一遍项目里同类功能的现有实现（见“共享能力速查”）。问题出在共享层就修共享层，让所有调用方一起受益；不在单个页面打补丁，也不复制一份再改。
- 验证挑与改动最相关的一项：对应的 `pnpm verify:*` 或 `scripts/verify-*.mjs`、`pnpm lint`、`pnpm typecheck`，或在用户运行的 `pnpm dev` 下看页面。小改动不跑全套，不执行 build。verify 脚本多为源码文本回归断言；规则有意变更时直接更新断言。
- 页面视觉目测由用户完成；Agent 负责源码排查、自动回归检查和提供复现步骤，不自行操作浏览器进行视觉验收。
- 汇报说清做了什么、跑了哪些检查、哪些没验证。不写安全声明或免责说明。

## 代码原则

简洁直接：

- 写满足需求的最少代码，数据流一眼能看清。不加只转发参数的薄包装、一次性抽象、多余的中间状态或配置项。
- 不做防御性编程：不为假设场景加兜底、守卫、重试、开关或兼容层；只在真实边界（网络响应、用户输入、跨上下文消息、存储读写）处理失败，内部调用信任类型。
- 被替代的实现和没有调用方的代码直接删除。退役设置字段只登记到 `src/constants/retiredSettings.ts` 的 `RETIRED_SETTINGS_FIELDS`（负责存储清理与拦截云同步），不迁移、不留兼容壳。
- 注释只写代码本身看不出的原因。

模块化与复用：

- 每类问题只有一个权威实现：状态一个真值来源，视觉一个 token 或 mixin，行为一个 composable 或工具函数。
- 同一逻辑出现第二处时抽成共享模块，并把旧副本一起替换掉；只有一处用到时不预先抽象。
- 分层：无 Vue 依赖的纯逻辑放 `src/utils/`，带生命周期或响应式的放 `src/composables/`，视觉放 `src/styles/` 与 token，组件只负责组装。
- 先用现有依赖；新增依赖要有当前需求。

性能（扩展注入在 B 站页面里，每份开销都算在用户的页面上）：

- 热路径（滚动、resize、指针移动、动画帧、Observer 回调、长列表渲染）不交错读写布局。几何走 `viewportGeometry.ts` 的每帧一次测量，不各自排 RAF 或挂 scroll / resize 监听。
- 动画只动 transform 与 opacity（例外：侧栏与小电视圆之间的形变改一个无子节点固定层的几何，因为圆角、边框与背景采样无法用缩放表达）；JS 驱动的动画经 `motionPriority.ts` 登记，内容挂载等动画结束。状态属性写在最小范围的元素上，不写 `body` 或根节点 class 触发整页样式重算；不写以 `*` 或元素类型结尾、会对整页元素求值的选择器。
- 大列表与大对象用 `shallowRef` / `shallowReactive` 并整体替换，不做深响应式；索引与派生数据增量维护，不在每次更新时全量重建。
- 观察器、监听器、定时器、请求与媒体按需创建，只观察真正需要的节点，随组件、页面、账号或可见性一起释放。隐藏的页面与分类不保留长列表或后台刷新。
- 不轮询：用事件、Observer 或共享通道（`useRouteState`、`stateConsumers`）。同一请求 single-flight，缓存按账号隔离。
- 首屏只加载可见所需，其余懒加载；图片走 `imageLoadQueue.ts`。
- 玻璃不叠玻璃，实色上不加 backdrop-filter（见“材质与玻璃”）。

## Git

- 只在用户要求时 commit，提交前 `pnpm lint` 与 `pnpm typecheck` 通过（pre-commit 另由 lint-staged 跑 `eslint --fix`）。
- 未经用户同意不 push，不创建或合并 PR；任何情况下都不推送到 `upstream`。
- 工作区常有用户或其他会话未提交的改动：只提交自己改的文件；用户没要求就不 reset、clean、stash、切分支、删分支或改写历史。
- 当前开发沿用 `message_feature`，不自动切分支或建 worktree。上游协作见下文“上游同步”。
- 版本号只在 `package.json` 的 `version`（manifest 读它，不另写），当前 0.2.0。每次推送到 `origin` 前都提升版本号（用户指定），按自上次推送以来的改动取最高一级：只有 fix / perf / refactor / docs / chore 等时提升补丁位（0.2.0 → 0.2.1），含 feat 时提升次版本位并清零补丁位（0.2.1 → 0.3.0），主版本位只在用户要求时提升；版本提升随推送的最后一个提交一起提交，或单独提交 `chore(release): 版本号提升到 x.y.z`。同一次推送只提升一次，未推送的本地提交不重复提升。
- 提交标头 `<type>(<scope>)!: <中文说明>`，type 取 feat / fix / docs / style / refactor / perf / test / build / ci / chore / revert / merge；合并 PR 写 `merge: 合并 PR #<number> <标题>`；有对应 [BewlyCat issue](https://github.com/keleus/BewlyCat/issues) 时附 `#{issue}`。PR 不提交 tests 文件。

## 命令与开发环境

- Node 版本由 `.node-version` 与 `package.json` 的 `devEngines.runtime` 固定，pnpm 自动下载项目运行时；本地与 CI 使用同一版本，日常命令用 `pnpm`。升级依赖需同步锁文件，保留严格 peer 检查并运行 `pnpm audit`。类型工具暂用 TypeScript 6，原因与依赖补丁见 `docs/maintenance/2026-10-22-toolchain.md`。

- `pnpm dev`：用户自己运行，持续编译到 `extension/`（Chrome/Edge）；Safari 产物在 `extension-safari/`。只包含 prepare、content/inject、background 等真实任务，不恢复 popup/options 入口、`build:web`、`dev:web`。
- `pnpm lint` / `pnpm lint:fix`、`pnpm typecheck`、`pnpm verify:*`。
- UnoCSS 的 `content.filesystem` 与 safelist 只在 watcher 启动时读取，Vite 管线不扫描 `.ts`：只出现在 `.ts` 里的图标类要在该文件加 `// @unocss-include`。改 `unocss.config.ts` 后需要重启 `pnpm dev`，结果看 `extension/dist/contentScripts/style.css`。
- 删除被 `import.meta.glob` 自动注册的文件后，Vite watch 可能报旧模块 ENOENT：只重启自己启动的 watcher。这类改动要在产物或重载后的页面上确认。
- `vite.config.content.ts` 的开发构建保持 `minify: false`（watch 增量更新后函数重命名会与调用点错配），生产构建不变。
- Chrome DevTools MCP 只在用户要求调试页面时使用。

## 结构

- `src/background/`：后台、消息与 API
- `src/contentScripts/`：页面注入主逻辑（入口 `index.ts`）
- `src/components/`：TopBar / Dock / VideoCard / Settings 等
- `src/stores/`、`src/logic/storage.ts`：状态与设置（默认值即当前设置结构）
- `src/manifest.ts`、`src/_locales/`（四套 locale 与设置搜索目录 `searchCatalog.ts` 随入口同步；代码里每个静态翻译键都必须在四套 locale 中存在，`pnpm test` 检查。页面上直接显示出 `xxx.yyy` 这样的键名，先确认 `pnpm dev` 仍在运行且产物已更新）
- 主 UI 跑在 Shadow DOM 内，注意样式隔离
- Vue 组件由调用方显式导入，不全局 eager 注册。`pageLoading.js` 保留同步启动遮罩，再加载 ES module `runtime.js`；首批静态依赖由 Rolldown 的 `$initial` 归组，页面、媒体库和非英语语言包按需加载。动态脚本只读取扩展自身资源。

## 共享能力速查

新代码先用这些，缺能力时扩展它们，不另写一套。

| 需要 | 用 |
| --- | --- |
| 几何测量、滚动调度与位置恢复 | `utils/viewportGeometry.ts`、`utils/scrollIntent.ts` |
| 动效时长与优先级 | `utils/motionTiming.ts`、`utils/motionPriority.ts` |
| 页面 / Tab 切换 | `useReadyPageTransition` |
| 弹窗与面板动效 | `useSourcePanelMotion`、`useGlassPanelMotion` |
| 浮层定位 | `useAnchoredPopoverPosition`、`useFloatingMenuPosition` |
| 展开收起 | `useMeasuredDisclosure` + `momentDisclosure.scss` |
| 删除元素（粒子飘散退场 + 其余元素补位） | `utils/particleDissolve.ts` 的 `dissolveElements`（`released` 后移除数据，失败 `restore()`）+ `useLayoutMotion`（数据在别处移除的列表用 `isDissolving` 作 `enabled`） |
| Dock 项（图标在上、名称在下的胶囊矩形） | `dockTab.scss` 的 `item` / `label` |
| 分段控件与滚筒 | `segmentControl.scss` + `LiquidSegmentIndicator.vue`、`WheelSelector.vue` |
| 设置窗口的导航栏 | `settingsNav.scss`（一级分类栏与二级页面栏共用的栏、行与组标题；顶栏收藏弹窗的收藏夹栏同此） |
| 加载反馈 | `SkeletonBlock.vue`、`LoadingRing.vue`、`useLoadingRingPhase`、`LoadingFill.vue`（数量未知时居中的圆环）、`SmoothLoading.vue`（列表尾部的圆环）；嵌入页加载用 `Loading.vue`（未知页面即 `LoadingFill`，视频 / 专栏为同形骨架） |
| 输入框 | `composer.scss`（外壳、正文、`tool` 工具按钮、`attachment-remove` 附图移除，按钮都是 `IconButton`）、`useComposerPicker`、`MomentReplyComposer.vue`、`sendButton.scss` |
| 卡片与网格 | `contentCard.scss`、`useCardWindow`、`useGridLayout`、`WindowedMasonryGrid.vue`、`cardRowMetrics.ts` |
| 侧栏页面 | `LibraryWorkspace.vue`、`LibrarySearchField.vue`、`LibrarySidebarHeading.vue`、`sidebarAction.scss` |
| 侧栏平铺分区 | `railSection.scss`（`flat`：无底板、通到侧栏边缘的发丝线） |
| 侧栏筛选菜单 | `LibraryFilterMenu.vue`（搜索框漏斗里的分组单选菜单，所有侧栏的筛选都用它，不用原生 `<select>` 或展开的筛选面板）、`LibraryDateRange.vue`（选“自定义日期”时的日期范围） |
| 内容顶部横向栏 | `bleedStrip.scss` + `LibraryBleedStrip.vue`（穿过侧栏玻璃、弹性滚动、被内容盖住时淡出） |
| 页面头图 | `LibraryHeroCarousel.vue`（一排头图卡片：当前约 85% 宽、露出下一张，固定与渐隐）+ `LibraryHero.vue`（左信息右封面 + 渐进模糊 + 取封面左缘的颜色，`imageTone.scss` 的 `toned-surface`；信息走 `eyebrow` / `title` / `meta` 与 `actions` 插槽） |
| 滚动边缘渐隐 | `scrollEdgeFade.scss`（`vertical` / `horizontal` / `lines`） |
| 文字截断（右端渐隐） | `truncateFade.scss`（`line` / `lines(n)` / `reveal`，全局类 `.keep-one-line` / `.keep-two-lines`） |
| 横向滚动的滚轮接管与两端弹性 | `utils/elasticScroll.ts`；普通页面里的横向卡片行用 `HorizontalScrollView.vue`（弹性两端 + `scrollEdgeFade.horizontal`） |
| 横向一步一切换（触控板每个手势一步、触屏横滑） | `utils/sideSwipe.ts` 的 `createSideSwipe`（动态图片；资料库头图是无级拖动，见资料库） |
| 按钮与弹窗 | `IconButton`、`CloseButton`、`TagRemoveButton`、`Dialog`、`ConfirmDialog` / `useConfirmDialog`、`ContextMenu`；弹窗窗口的表面、顶栏与底栏用 `modalWindow.scss`；嵌入页（抽屉、画中画）顶部的“新标签页打开 / 关闭”用 `FrameActions.vue` |
| 列表视图状态 | `useHomeTabState`、`usePageViewState` |
| 图片 | `imageLoadQueue.ts`、`LazyPicture.vue` |
| 图片查看器 | `useImageViewer`（组件内 `useImageViewer().open(...)`，非组件代码 `openImageViewer`）+ App 的 `ImageViewerHost`；嵌入页的图片经 `useIframeImageViewerBridge` 交给父页面；几何与图集规范化在 `utils/imageViewer.ts` |
| 计数显示 | `utils/dataFormatter.ts` 的 `numFormatter`（按界面语言 1.2 万 / 1.2K，无法识别的输入原样显示，不当 0） |
| 封面上的直播标记 | `LiveMark.vue`（宿主只负责定位） |
| 扩展消息与共享状态 | `utils/messaging.ts`、`background/stateConsumers.ts` |
| MAIN ↔ ISOLATED 页面桥 | `utils/pageBridgeChannel.ts`、`constants/pageBridge.ts` |
| 路由 | `useRouteState.ts` |
| 搜索链接（范围与视频筛选、Bewly / 原生互转）、把关键词交给页面搜索 | `utils/searchUrl.ts`、`utils/searchNavigation.ts`；`utils/pageSearch.ts` + `usePageSearchIntent` |
| 账号隔离与取消 | `utils/accountScope.ts`、`utils/abort.ts` |
| 链接净化 | `utils/bilibiliUrl.ts` |

## 设计系统

### Token

- 全局视觉 token 在 `src/styles/variables.scss`，组件不重复定义同义的尺寸、字号、字重或颜色。
- 通用控件 token 用 `--bew-control-*` / `--bew-segment-*`；只属于 TopBar 的才用 `--bew-top-bar-*`。
- JS 读 CSS 动效时长用 `utils/motionTiming.ts` 的 `getMotionDuration`（压缩会把 `300ms` 写成 `.3s`）。滑块与滚筒的移动时长用 `getTravelDuration`：一格 300ms，距离越远越长（次线性），不写死。

### 排版

- 整个扩展的文字层级、字号与对比度按 macOS 原生应用校准（用户指定）。默认角色为 caption `11/14`、callout `12/15`、control / body / title `13/16`、subheading `15/20`、heading `17/22`、display `22/26`，大号数据用 26px；统一使用 `--bew-font-size-*` / `--bew-line-height-*`。字号与行高都是 `Npx × --bew-font-scale`：启动时 `utils/browserFontScale.ts` 优先取浏览器暴露的 `env(preferred-text-scale)`，没有有效的非默认系统比例时取浏览器默认字号 / 16，不把两者相乘；只在不等于 1 时写到宿主与 html。JS 需要像素值时读元素的计算 `font-size`，不要读 token 字符串。视频卡片字号设置 xs/sm/base/lg 对应 caption/control/title/subheading，不用 Tailwind `text-*`。不新增无语义的 px/rem 字号，需要时先扩 token。
- 所有文字一律常规字重 400（用户指定，`--bew-font-weight-regular` 是唯一的字重 token，medium / semibold / bold 与 heading / subheading weight 已删除；reset 让 `b` / `strong` 继承字重；UnoCSS 的 `font-medium` 等全部解析为 400，`scripts/fontWeightPolicy.ts` 在 `pnpm test` 中禁止重字重）。层级只靠字号与前景明暗：标题、人名、关键数字与需要强调的文字用 text-1，相邻的次要信息降到 text-2 / text-3；不要用加粗或改字重表达选中、强调或分组。品牌标志是图形，不受影响。
- 共享文字类：`.bew-page-heading`、`.bew-subheading`、`.bew-section-label`、`.bew-ui-label`、`.bew-help`。标题、正文与字段标签用 text-1，分组和次要信息用 text-2，辅助说明用 text-3，禁用与占位用 text-4；辅助说明使用 callout 字号。文字对比从同一中性前景派生，浅色次要 / 辅助为 70% / 64%，深色为 70% / 60%；`prefers-contrast: more` 自动提高到 88% / 76%。设置分组内容按 `--bew-settings-level-indent` 每级内缩 8px。
- 字体栈 `--bew-fonts-ui` 优先 `system-ui`，启用光学字号，禁止合成粗体或指定 SF 的字体文件名。默认模式下原生页保留原站字体，推荐 / 自定义模式沿用既有覆盖。正文用比例数字，计数、时间、进度、统计用 tabular-nums；中文不加字距。
- 文字截断（用户指定）：放不下的文字不用省略号，末端从右往左柔和渐隐（与滚动边缘同一条缓动曲线，宽 `min(40px, 40%)`）。单行用 `truncateFade.line`，多行用 `truncateFade.lines(n)`（行数取 `--bew-truncate-lines`，修饰类改它即可，展开全文用 `release`），模板里用 `.keep-one-line` / `.keep-two-lines`。是否截断由元素自身溢出驱动的滚动时间线判断，放得下就不遮盖，不加 Observer；不支持滚动时间线的浏览器退回省略号 / 行数截断。遮罩会连同元素背景一起渐隐，带底板的按钮或胶囊把文字包进内层元素再截断；多行截断的元素不加上下内边距。hover 时有控件浮在文字末端之上（如更多按钮）时，宿主的 hover 规则加 `truncateFade.reveal(控件宽度)` 把渐隐左移（并在宿主 `transition` 里加 `truncateFade.$transition`）；占位的控件不需要，文字盒本就止于控件之前。原生页适配与宽屏播放页的原生节点保留原站截断。`scripts/truncationPolicy.ts` 扫描 `src` 禁止省略号、`line-clamp` 与 UnoCSS 截断类，`pnpm test` 运行。
- 圆形或胶囊里的数字（封面排名、`CountBadge`、序号）用 `main.scss` 的 `.bew-centered-numeral`，数字包在 `<span>` 里。

### 文案

- 同一功能在所有入口（Dock、顶栏、弹窗、右键菜单、页面、设置）用同一个名字，新增入口先搜 locale 里已有的键并复用，不另起同义词（用户指定）。当前统一叫法：观看历史（不用“历史”）、消息（Dock 不加“页”字；设置的页面栏才统一用“××页”，如“稍后再看页”）、浅色 / 深色（不用亮色 / 暗色）、主题色（不用强调色）、页面模式第三档“自定义”、加入黑名单（不用拉黑）、从稍后再看中移除 / 从观看历史中删除（弹窗与页面不简写成“删除”“移除”）、卡片菜单折叠区“高级选项”（三点按钮才叫“更多操作”）、打开完整页面用“查看全部”（“查看更多”只指在原处多加载几条）、“UP 主”带空格（引用 B 站原文的“UP主的推荐”除外）。
- 不加不必要的次要标签与说明，让布局本身解释（用户指定）：眉题、副标题、在标题下复述标题的说明、图标或位置已表明含义的字段标签（如数字旁的“数量：”）、复述控件作用的提示文字、与按钮文字重复的 Tooltip、把设置标题换个说法再说一遍的 `_desc` 都不写，设置的分类页与分组也不加概述；能用层级、分组、位置、图标与对齐表达的就删掉文字，删后用间距、对齐或分隔线补足分组。只保留有信息量的说明：副作用、限制条件、隐私或请求行为、不可逆操作、不易发现的操作方式（如右键、快捷键），以及错误原因与恢复方式；纯图标按钮的 Tooltip 与读屏文字（`aria-label`）照常保留。

### 图标

- 功能图标统一 UnoCSS `i-tabler:*`（线性 1.75px），激活态用该族实际存在的 filled 版本或同一线性图形。`@iconify/vue` 只留给 Dock / SideBar 的明暗切换按钮和无 UnoCSS 的专栏 iframe 图库（描边统一为 1.75，由 `verify:ui-icons` 约束）。唯一例外是 Dock 页面项自己的一套图形（用户指定，2026-10-29）：`src/assets/icons/dockIcons.ts` 的内联集合 `i-bew-dock:*`（`unocss.config.ts` 注册，只由 `mainStore` 的 `dockIcon` 引用），iOS 标签栏式的实心圆润图形，以 B 站小电视的一对竖眼（小电视本身再加天线）为家族细节，镂空统一为 2px 圆头线；选中与未选中同一图形，只换颜色。其他入口（搜索快捷操作、设置）仍用该项的 Tabler `icon`。
- 图标尺寸 `--bew-icon-size-xs/sm/md/lg/xl`：caption 旁用 xs（14px），control 旁用 sm（16px）；Dock 图标 `--bew-dock-icon-size`（24px，宽屏 28px）。
- “全 Bewly”页面模式用品牌标志 `src/assets/branding/bewly-mark.svg`（`.bew-mark-icon`），“自定义”用 Tabler `adjustments-horizontal`，同步 UnoCSS safelist。
- 用户指定的 `ChevronIcon` 2.5px 描边保留，不被全局 SVG 规则覆盖；品牌、内容图形和发送 / 加载专用状态图形保留。

### 间距

- 4px 网格，`--bew-space-*`：4/8/12/16/20/24/32/40/48。2px 只用于边框、焦点环和光学微调（例外见分段轨道）。
- 紧密内联 4、控件内部与紧凑列表 8、关联元素组 12、组件与栏位之间 16–24、页面区块之间 32–48。同层级卡片、列表、工具栏用相同 gap；需要 3/5/7/10/14/18 这类一次性值时写注释说明原因。
- 公共间距用容器 padding 和 gap，不用子元素 margin 拼。

### 圆角

- 以视频封面 16px 为锚点（用户指定）：刻度只有六档加全圆，`--bew-radius-xs/sm/md/lg/xl/2xl/full` = 4/8/12/16/24/32/9999px，只在 `variables.scss` 里用来定义角色 token。组件只用角色 token：`--bew-radius-tiny` 4（骨架条、文字标签、小状态块）、`--bew-interactive-radius` 8（按钮、菜单项、列表行、输入框、浮层内小图）、`--bew-thumb-radius` 12（约 80–240px 宽的中等缩略图、评论树弯角）、`--bew-media-radius` 16（视频封面、动态图片 / 视频等大媒体）、`--bew-surface-radius` 16（卡片、面板、浮层、菜单）、`--bew-modal-radius` 24（弹窗、设置）、`--bew-shell-radius` 32（Composer 等大外壳）、`--bew-pill-radius` 全圆（胶囊、徽标、顶栏主控件）；真实圆形用 `50%`。分段控件的 `--bew-control-radius` / `--bew-control-item-radius` / `--bew-liquid-indicator-radius` 是组件参数，默认 pill，变体可改。
- 其他圆角只能由同心公式得出（子圆角 + 统一内距）：`--bew-library-filter-radius`（interactive + 8 内距 = 16）、头像面板右上角、按高度一半算的胶囊（Dock 外壳、私信输入栏）。浮层与菜单的内距 `--bew-popover-padding` 为 8，8px 的项与 16px 的浮层同心；内距不小于外圆角时（如弹窗正文）不必同心。
- 不写刻度名、已退役的旧名（`--bew-radius`、`card / panel / popover / video-cover / moment-media / badge / composer` 等 radius）、字面量（`var()` 回退值、0、50%、inherit 除外）或 UnoCSS 原始圆角类（`rounded-full`、`rounded-8` 等，用 `rounded-$bew-*-radius`）。`scripts/radiusPolicy.ts` 扫描 `src` 约束，`pnpm test` 运行。
- 平滑圆角：普通圆角矩形用 `--bew-corner-shape: superellipse(1.7)`（保留 `border-radius` 回退，组件里不写别的数值）。全圆角胶囊接近 Apple Music 搜索栏的长胶囊（用户指定）：半径固定 `--bew-pill-radius`（9999px，两端尺寸由控件高度决定，中间上下直边保留，不随宽度拉伸；长条不用 `50%`，那会变成椭圆），形状 `--bew-corner-shape-capsule` 为轻度的 `superellipse(1.1)`（用户给的参考：高 56px、圆角 28px 即半高、`superellipse(1.1)`、`border-box`；9999px 会被钳到半高，与之等价）（只比 round 略收，两端柔和过渡到直边，不做偏方的 squircle；`pnpm preview:capsule` 与 round 及 1.2 / 1.3 并排对比、可用滑块微调），包括 Dock 外壳、顶栏工具胶囊、搜索框、分段控件、Switch 轨道、徽标与按钮胶囊、原生页适配里的胶囊。嵌在胶囊端部的方形元素（Dock 按钮与选中滑块、分段项与滑块、顶栏胶囊内的按钮、搜索框内的按钮、Switch 滑块）用同一形状，保持同心嵌套。只有真实圆形用 `--bew-corner-shape-round`：头像、圆点、色块、独立的圆形按钮（小电视圆、头像圆用 `sidebarSurface.floating(round)`，模板里用 `.bew-shape-circle`）。UnoCSS 的平滑圆角规则：全圆角（pill / 控件参数）取胶囊形状，`50%` 取圆形。
- 同一容器四角来自同一 token；局部直角只用于明确的拼接结构。子元素共享裁切轮廓时用 `inherit`，不用 `calc(父圆角 - 任意像素)` 猜。
- 卡片与封面角落里的控件（三点菜单、删除）用平滑圆角矩形：离角内距小于父圆角时取同心值（父圆角 − 内距，下限 tiny），否则用 `--bew-interactive-radius`。视频与动态封面上不放操作按钮（稍后再看在右键菜单里）。
- 胶囊与面板之间做动画时，起点用胶囊的真实几何半径，不从 `--bew-pill-radius` 插值。
- 视频封面由最外层媒体容器唯一裁切，图片、预览、骨架、遮罩继承同一圆角，悬停预览前后不跳角、不露底、无双边框。

### 颜色

- 深色只有无色调中性灰一种（用户指定，OLED 纯黑与深色色调已移除；毛玻璃的深色色调是用户指定的例外，见“材质与玻璃”）：中性色对固定为 `#141414` / `#ebebeb`（`appearancePalette.scss` 的 `pigments`），其他深色底色只经外观设置的“背景色”（`appearanceColors.dark.background`）自定义，没有单独的“深色背景”选项。
- 主题色只用于：主操作按钮、当前位置圆点、开关与进度、未读圆点、链接和关键词、Logo、文本选区，以及 Dock 选中项的图标与名称（`--bew-dock-navigation-active-color` = `--bew-accent-solid`，即用户选择的原色，不用对比度压暗的 `--bew-theme-foreground`，用户指定）。选中面、普通徽标、导航文字、装饰和编辑反馈用中性色。
- 共享状态色 `--bew-selected-bg` / `--bew-hover-bg` / `--bew-pressed-bg`；`--bew-theme-surface*` 只是中性兼容别名。主按钮用 `--bew-accent-solid` / `--bew-on-accent-solid`，保持用户选择的原色，亮色主题配深色文字，不压暗或混色换白字。链接与关键词用对比度校正的 `--bew-theme-foreground`，小圆点用 `--bew-accent-marker`。`--bew-on-theme-color` 按主题色亮度选黑白，并同步到 document 根节点和 `#bewly` 宿主。
- 主题色设置 `themeColor` 是十六进制色或 `NEUTRAL_THEME_COLOR`（“无主题色”，设置里与预设并列）：无主题色时 `--bew-theme-color` 及派生值浅色取黑、深色取白，`--bew-on-theme-color` 随之取反。所有 token 由 `utils/themeColor.ts` 的 `getThemeColorTokens` 计算、`applyThemeColorTokens` 统一写入，不另加开关。品牌标志的彩色强调用 `--bew-brand-accent`（有主题色时等于主题色，无主题色时为 `--bew-bili-pink`）。
- 自定义主题色须与纯白、纯黑页面都保持至少 1.8:1 对比度（`THEME_COLOR_MIN_PAGE_CONTRAST`，最低的预设 `#fda4af` 为 1.89:1）：`clampThemeColor` 保持 OKLCH 色相、只移动明度（必要时降色度进 sRGB）；颜色选择器输入与存储规范化（`normalizeThemeColor`）都经它钳制，`verify:color-policy` 约束预设在范围内。
- 表面从同一中性色对按用途派生：内容轻抬、独立浮层分离、输入内嵌，不按等差亮度逐层抬高；浅色、深色分别校准。
- 灰、黑、白的半透明或实色不受主题色限制。玻璃自身色调和既有装饰渐变不用于表达控件状态。深色中性渐变（`useLinearGradientThemeColorBackground`）只铺在页面背景上（顶栏不是一条栏，没有自己的渐变或背景）。
- 线条只有三种角色（用户批准的边框体系）：分隔线 `--bew-separator-color`（面板内的分组、工具栏、密集列表；能用间距就不画）、外缘 `--bew-edge-color`（卡片、面板、浮层、菜单、玻璃、弹窗、选项与小胶囊的轮廓）、输入框 `--bew-field-edge-color`（悬停 `-hover`；输入框、文本框、选择框）。另有画在图片之上的 `--bew-media-edge-color`（封面、动态大图）。浅色为前景 12% / 14% / 18% / 20.5%，深色为 12% / 16% / 18% / 20.5%（深色阴影几乎看不见，由外缘承担分层），均在 11.5–20.5% 内；`prefers-contrast: more` 提高到 28% / 32% / 40% / 48%。分隔线与外缘宽 `--bew-hairline`（普通屏 1px、2 倍屏以上 0.5px，即一个设备像素；UnoCSS 写 `border="hairline …"` / `border-t-hairline`），输入框保持 1px；组件参数宽度（开关、分段控件）可保留。边框只用这些 token，不写字面量颜色；选中、聚焦与悬停不改边框颜色。旧名 `--bew-border-color` / `surface-border-color` / `glass-border-color` / `message-card-border` / `notifications-card-border` / `input-border-color` / `comment-tree-line-color` / `media-edge-width` 已删除。`scripts/borderPolicy.ts` 在 `pnpm test` 中约束；原生页适配沿用原站宽度但用同一组 token。浅色 `--bew-shadow-1..4` 各带一层 1–2px 贴边接触阴影，深色阴影不变。
- 数据图表（lieflat-charts 风格）：不透明 Mono 灰阶、刻度与细线，复用 `--bew-chart-*`、`dataChart.scss`、`ChartRungs.vue`，主题色只点亮当前读数或编辑点。投票每刻度 1%，保留小数末刻度、多选独立分母与零值无数据标记；通知柱用共同单位、标记总数有界，未知值不当零。不引入模板字体、图表 CDN 或演示数据。

### 材质与玻璃

- 毛玻璃默认开启，服从全局模糊强度。`disableFrostedGlass` 是唯一开关（设置里叫“毛玻璃”，键 `settings.frosted_glass`），开启后关闭毛玻璃并改用实色 token；顶栏 `TopBarHeader` 本身不绘制任何背景（关闭毛玻璃时也不铺整条实色带），只有其中的浮动控件随之变实色；不恢复 `enableFrostedGlass`、`enableTopBarGradient`、`alwaysUseTransparentTopBar` 等旧状态。
- 玻璃之上不再叠玻璃：玻璃内的文本、按钮、选项、搜索框、菜单用实色或无滤镜表面，实色背景不加 backdrop-filter，也不用低模糊代替移除。只有延伸到原玻璃边界之外的覆盖层才可有独立玻璃（Teleport 本身不算理由）。唯一额外例外：`CountBadge.vue` 的未读胶囊可叠在 Dock 与顶栏玻璃上（复用全局滤镜与实色降级）。
- 所有毛玻璃只有一种材质（用户指定）：色调 `--bew-glass-tint`（实色降级 `--bew-glass-tint-solid`，悬停 `-hover`）、不透明度 `--bew-glass-opacity`（只给玻璃用，与内容表面的 `--bew-content-opacity` 分开；关闭毛玻璃时为 1）、模糊 `--bew-filter-glass-1`（`--bew-filter-glass-2` 已删除）、边框（用户指定，2026-10-29）：所有毛玻璃物体（左侧持久侧栏 `PersistentSidebar` 与资料库 / 私信侧栏、折叠成的小电视圆、热搜卡片、Dock 与其旁的浮动按钮、顶栏与首页搜索框、顶栏胶囊与头像圆、侧栏按钮、Composer 等）用同一条统一宽度的细边框：`--bew-glass-edge-width`（= `--bew-hairline`）+ `--bew-glass-edge-color`，颜色比普通外缘亮，像 iOS 玻璃（浅色 `rgb(230 230 230 / 80%)`：白页上是一条浅灰线，图片上是亮线；深色白 24%）；没有加粗的唇边或内侧高光；关闭毛玻璃与高对比模式下用 `--bew-edge-color`。Dock 选中项的滑块没有边框（`--bew-liquid-indicator-shadow: none`，用户指定）。浮动的玻璃控件（Dock、顶栏与首页搜索框、顶栏右侧胶囊、小电视圆与头像圆）共用同一阴影 `--bew-glass-shadow`（= shadow-2），不在宿主里另配阴影或边框颜色，阴影按层级。按 iOS 调校（用户指定，2026-10-29）：浅色色调为 raised 白混 3% 前景、不透明度 0.6（更通透，又能在白页上看出玻璃）；深色在纯黑背景上透出来是 `#20211f`（用户指定，色调 × 不透明度 0.72，是“深色只有无色调中性灰”的玻璃例外）。侧栏、小电视圆、顶栏胶囊（`--bew-sidebar-background*` 是别名）、浮层（`--bew-popover-surface-background`）、Dock、搜索框、侧栏按钮、Composer、私信、播放页控制栏、原生页适配的玻璃栏、刷新提示都用它，不在组件里另配玻璃色调；图片查看器等媒体遮罩是深色遮罩，不算玻璃色调。普通毛玻璃用于：Dock、播放页底部控制栏、独立搜索框、侧栏按钮、私信导航；顶栏弹窗是实色窗口。弹窗窗口（设置、`Dialog`、`ConfirmDialog`）都是实色（见“浮层与弹窗”），其中的输入框与内嵌菜单也是实色。
- 液态玻璃已完整移除（含 2026-10-28 试过的实验性材质，用户看过后决定去掉）：没有 SVG 位移 / 色散 / 折射层、`vLiquidGlass`、`LiquidGlassSurface.vue`、`utils/liquidGlass.ts`、`.liquid-glass` 类与 `--bew-filter-glass-surface / modal / shell / capsule / round` 几何 token、“悬浮表面材质”或“液态玻璃 · 实验”设置（`liquidGlassMaterial`）、`@wxperia/liquid-glass-vue`，不恢复；`--bew-filter-glass-1` 就是普通磨砂模糊。`enableDockLiquidGlass`、`dockLiquidGlass*`、`liquidGlassMaterial` 只在退役字段表中。`LiquidSegmentIndicator` 是纯几何滑块（实色选中表面，不采样背景），不受影响。
- 渐变模糊只用 `ProgressiveBlur.vue`（`utils/progressiveBlur.ts`）：五层 backdrop 模糊半径逐层翻倍、遮罩窗口逐层向强端收缩，强度默认取 `--bew-glass-blur-radius`（随全局模糊强度，关闭毛玻璃时不渲染），淡入淡出用组件的 `visible`（祖先降不透明度会让模糊失效）。模糊层与所需取样内容之间不能隔着 backdrop root（祖先有 `backdrop-filter` / `filter` / `mask` / `opacity < 1`）：它会截断向该祖先外部的取样；若来源内容本就在同一祖先内（如通知列表和边缘模糊一起做页面淡入），则仍能正确取样。内部取样的调用方用 `sample-within` 明确包含全部来源内容的最近祖先，开发检查只在到达该边界前检查 backdrop root，圆角裁切检查仍遍历完整祖先链；需要外部背景的悬停模糊不指定边界，保持完整检查。宿主是玻璃时把玻璃移到背景层（如 `.context-menu-container::before`），渐变层祖先也不能同时使用平滑圆角与 `overflow: hidden/clip/auto/scroll`：Chromium 会丢弃子层的渐变遮罩，绘成矩形带；让背景、滚动列表与各模糊层各自裁切，保留平滑圆角。开发构建会检查 backdrop root（含透明度、clip-path、混合与 will-change）及这种圆角裁切并在控制台警告；所有调用方都用组件，不直接调用层生成函数或淡化整组祖先。不给渐变模糊加饱和度，叠在玻璃上会给带区染色。禁止单层 `backdrop-filter` 配渐变 / 径向遮罩：那只是清晰图和定强模糊图按比例混合，会留下矩形或椭圆边界。`pnpm verify:style-invalidation` 用 `scripts/maskedBlurPolicy.ts` 扫描所有样式（按元素合并 BEM 修饰类与伪元素）和内联 `backdropFilter` + `maskImage`，只放行该组件的层。
- 保留的模糊：会话与通知主内容区的滚动边缘模糊，位置、尺寸、强度与层级不改，实现统一为 `ProgressiveBlur`。顶栏没有渐进模糊或雾色层（用户要求移除，不恢复）。设置窗口与其他弹窗都没有顶部模糊（设置的 `PanelTopBlur.vue` 已删除，用户要求）。
- 卡片与面板内的纵向滚动列表用 `styles/scrollEdgeFade.scss` 的 `vertical` mixin（`.bew-scroll-edge-fade`）：只在该方向还有内容时渐隐，由 scroll-driven 动画驱动，不加监听；遮罩只放在不绘制玻璃的滚动元素上。边缘本就是屏幕边缘或底部有固定输入栏时用 `vertical($bottom: false)` / `.bew-scroll-edge-fade--no-bottom`，状态相关时设 `--bew-scroll-edge-bottom-off: 1`。
- 左侧栏不用渐隐（用户指定：遮罩会让边缘行的图标变暗、把封面与预览洗成白色渐变）：资料库 / 动态 / 消息 / 首页关注侧栏里的滚动层（`LibraryWorkspace` 侧栏滚动层、直播列表、收藏筛选的选项区与私信搜索结果）用同一文件的 `lines` mixin，只在该方向还有内容时在上 / 下缘显示 `--bew-separator-color` 发丝线，同样由元素自身的滚动时间线驱动，放得下时没有线；底边是屏幕边缘时 `lines($bottom: false)`。动态页侧栏的正在直播列表是侧栏最后一块、下缘就是屏幕边缘，同样不画底线。紧接在常驻分隔线下方的滚动层（`--ruled` 工具区下的收藏夹 / 订阅列表、私信工具区下的会话列表与消息搜索结果）不画顶线，只保留上方那一条，并且滚动上沿就在这条线上（用户指定）：中间的侧栏间距或内距放进滚动层的上内距（收藏页由 nav 把 `--bew-sidebar-section-gap` 收进来、列表以负外边距接走），内容滚到线处才被截断，不在线下方留一截空白。滚动层左右通到侧栏边缘（负外边距抵消侧栏内距再内收），祖先只做纵向裁切（`overflow: visible clip`）；自带动画的滚动层把它与 `bew-scroll-edge-line-*` 写在同一个 `animation` 列表里。
- 玻璃内的实色控件可以无边框，保留必要的分隔线。

### 控件

- 分段控件、标签栏、图标切换器用 `src/styles/segmentControl.scss` 的 `.bew-segment-control` / `__item`；页面只负责定位、宽度和响应式。选项带 `data-segment-item`，激活项 `data-active="true"`；没有指示器的分组加 `--static`。
- 滑块指示器只用 `src/components/LiquidSegmentIndicator.vue`（`active-key` 传当前值，必要时 ref 调 `updateIndicator(true)`），不手写 DOM 或直接调 `useLiquidSegmentIndicator`。滑块圆角在 `.bew-segment-control` 上取 `--bew-control-item-radius`，变体改项圆角即同步滑块（`--rect` 也改其形状），不另设 `--bew-liquid-indicator-radius`；外观页“显示模式”的大预览选项按同心公式：预览 8 + 内距 8 = 项与滑块 16，+ 轨道 2 = 轨道。始终启用，不恢复 `enableLiquidSegmentIndicator` 设置。
- 有底板的横向选择组必须是轨道滑块 `.bew-segment-control--track`：滑块与轨道四周差 2px（`--bew-space-0-5`，用户指定），未选中项 hover 只把文字提亮到 text-1，只有滑块画底色。适用于首页 Tab / 布局 / 推荐模式 / 频道菜单、设置分段控件、Logo 样式、搜索结果分类与筛选、播放页右栏标签。例外：顶栏置顶频道（快捷链接）与首页频道菜单（单个触发器）；由 `verify:targeted-fixes` 扫描约束。顶栏 Pop 内无轨道的透明滑块保持 4px 内距，静态筛选维持原 hover。
- 同一行同类控件用一致的表面、高度、padding、gap、圆角、阴影和状态。
- 紧凑默认规格：外层高 36px、padding 4px、gap 4px、内部项高 28px、文字 13/16 400、图标 16px；文字项水平 padding 12px，页面主标签 `--wide` 16px，纯图标 `--icon`。
- 覆盖 default / hover / focus-visible / active / disabled。选中或聚焦任何元素都不额外加强调边框（用户指定）：`--bew-focus-ring` 为 none、`--bew-focus-shadow` 与 `--bew-selected-ring` 为透明、`--bew-focus-ring-color` 等于普通边框色，状态只靠 `--bew-selected-bg` / hover 底色与文字明暗表达；`main.scss` 全局兜底、MAIN world 与原生页注入样式同样遵循，不写死 outline、描边或外扩阴影环。布局编辑器的目标框是编辑器自身界面，用 `--bew-layout-editor-outline-color`。
- 点击目标不小于 24×24，普通文字对比度不低于 4.5:1。
- 侧栏里卡片与分段控件之外的整行图标 + 文字按钮用 `.library-sidebar-action`（`sidebarAction.scss`）：命中区等宽居中、内容靠左，首个图标或文字对齐滚筒标题（侧栏内距 + `--bew-sidebar-label-inset`，比搜索框左缘内收 8px）；常态透明，hover 亮 / 暗色略加深。行高 `--bew-sidebar-action-height`（32px），同组的行（`.library-rail-actions`）之间没有间隙（用户指定：行间文字间距收紧到原来的一半），批量管理按钮与其下的操作同在一组；骨架是居中的一行文字高的条。侧栏操作不用黄色提示色（暂停记录、移除已看完等用常规前景，用户指定）；清除全部这类不可逆操作用 `--bew-destructive-foreground`（浅色 `#d70015`、深色 `#ff453a` 的警示红，不用较柔和的 `--bew-error-foreground`）。
- 滚筒选择器 `WheelSelector.vue`：字号与几何取共享 token，无箭头或选中背景，hover 只提亮文字；鼠标按下不提前移动焦点，单击同时切换分类与页面；方向键预览、Enter / Space 确认；支持连续与反向滚动、惯性尾巴抑制。选项首尾相接成环：首项上方显示尾项，在首项上滑（滚轮或 ↑）到尾项、在尾项下滑到首项，弹簧沿同一方向转过去（游标不设边界，显示项取模）；Home / End 仍跳到首 / 尾。
- 圆形操作用 `IconButton.vue`，关闭浮层用 `CloseButton.vue`（用户指定，任何状态都没有边框：默认 `plain` 常态只有一个 ×、text-2，悬停铺 `--bew-hover-bg` 并提亮，按下 `--bew-pressed-bg`；形状是平滑圆角矩形，与所在卡片的外角同心：宿主设 `--bew-close-button-radius` = 外圆角 − 按钮离角内距（`modalWindow.header` 让按钮离窗口顶、右各 8px、高为控件高，即 24 − 8 = 16），可设 `--bew-close-button-size`；浮在嵌入网页或视频上的用 `floating`（实色底 + 阴影，无边框，如动态详情弹窗），图片查看器用 `overlay`），删除标签或搜索历史用 `TagRemoveButton.vue`，不在页面里复制。

### 浮层与弹窗

- 同类 Pop（顶栏搜索、设置搜索、搜索筛选）默认与触发控件等宽，用实色 `.bew-popover-surface`；搜索框的面板见“首页与搜索”，是胶囊自身向下长出的实色表面；顶栏的固定弹窗 `.bew-popover`（头像面板、动态、收藏、观看历史、稍后再看、投稿、更多与首页分区浮层）是与设置窗口相同的实色窗口（用户指定）：`popover.scss` 里 `@include modalWindow.surface`（`--bew-elevated-solid`、`--bew-hairline` + `--bew-edge-color`、`--bew-modal-radius`、`--bew-shadow-4`），没有毛玻璃。
- 顶栏媒体弹窗（动态、收藏、历史、稍后再看，用户指定）是实色窗口（见上），尺寸放宽（用户指定）：动态、观看历史、稍后再看宽 `--bew-popover-panel-width`（440px），收藏带收藏夹栏宽 `--bew-popover-panel-wide-width`（560px），高 `--bew-popover-panel-height`（640px 与可用高度取小），头像面板宽 340px；用与设置窗口相同的发丝线分区：`popover.scss` 的 `bew-popover__header`（标题或标签 + 右端图标操作，高为控件高 + 上下 8px，底边 `--bew-separator-color` 发丝线，列表的滚动上沿就在这条线上）与 `__list`，行样式只在 `TopBar/styles/popoverCards.scss`：行左右通到弹窗边缘、内距 `--bew-popover-inset`（16），行间是从内容线开始的内缩发丝线；悬停或键盘聚焦时整行铺 `--bew-hover-bg` 并隐去相邻两条线，不用圆角底板。封面不叠文字或按钮（时长、作者在信息行，“·”分隔；只保留底边进度线），封面带 `contentCard.media-frame`。行操作（稍后再看、从稍后再看 / 观看历史中移除、播放并移除、普通页打开）是信息行末端 24px 的 `.bew-popover__action` 图标按钮，悬停或聚焦时显现、始终占位（触屏常显），删除悬停变 `--bew-error-color`；顶栏操作（播放全部、查看全部、添加播放标签页）同样是带 Tooltip 的图标按钮，不再是文字链接。动态弹窗顶部没有续读按钮行与新视频计数（用户指定；书签、自动补新与阅读分界照旧），阅读分界是带横线的说明，加载失败时的重试是透明文字按钮行（`momentReading.scss`）；收藏夹栏用 `settingsNav` 的栏与行。
- Pop 与视口或所属面板至少留 8px；结果数量会变的 Pop 按下方可用空间限制 `max-height`，内部滚动并 `overscroll-behavior: contain`。
- 弹窗窗口（用户指定，仿 Claude Code 设置，设置窗口、`Dialog`、`ConfirmDialog` 一致）共用 `styles/modalWindow.scss`：一个实色窗口（`fill` = `--bew-elevated-solid`，`edge` = 发丝线 `--bew-edge-color` + `--bew-modal-radius` + `--bew-shadow-4`），用 `--bew-separator-color` 发丝线分成顶栏（标题 subheading 字号、可选说明、右端关闭，高为控件高 + 上下 8px）、内容与可选的底栏（操作按钮靠右），内容与标题从 `$inset`（20px）开始；没有毛玻璃、顶部模糊、文字光晕或内容遮罩。窗口打开时页面统一变暗（用户指定）：三者的遮罩都用 `backdrop` mixin 的 `--bew-modal-backdrop`（浅色黑 36%，深色黑 56%），随窗口动效淡入淡出，点击遮罩关闭。顶栏的玻璃弹窗（头像面板与动态、收藏、观看历史、稍后再看）和搜索面板打开时同样把页面遮暗（用户指定）：开启方经 `composables/usePageDim.ts` 的 `usePageDim(打开状态)` 持有（指针在顶栏页面组胶囊上时也持有，在按钮之间移动不会一暗一亮，用户指定），App 只画一层 `.page-dim`（同一 `backdrop` mixin，`--bew-z-page-dim` 在页面、Dock 与侧栏之上、顶栏与首页搜索框之下，moderate 淡入淡出，减少动态效果时直接切换）；遮暗层不拦截指针，关闭仍走各弹窗自己的外部点击与悬停规则。投稿、更多这类小菜单与右键菜单不遮暗。顶栏弹窗打开时顶栏宿主升高一层（`top-bar-host--popover-open`，`--bew-z-topbar-host` + 1），盖过同层级、DOM 更靠后的首页吸顶搜索框。`Dialog` 的外缘画在可滚动内容之上（`.dialog__edge`），`show-border=false` 只去掉细线；`content-flush` 让 iframe、图片贴边。弹窗里的输入框用内嵌的 `--bew-input-bg`，不用窗口自身的颜色。`Dialog` 不再有 `frostedGlass` 参数，也没有玻璃嵌套判断（`GLASS_SURFACE_CONTEXT` 已删除）。
- 居中弹窗与确认框用 `useSourcePanelMotion` / `useGlassPanelMotion`：从本次触发控件缩放进入，关闭沿原路返回并提前淡出；App 捕获本次激活来源，无来源时居中轻缩放。只动画 transform 与独立绘制层 opacity，玻璃祖先不淡化，中途取消从当前状态继续，离场 inert、结束后恢复焦点。菜单与日期选择器保持锚定。
- 图片查看器全扩展只有一个（用户指定合并动态、私信与原生详情页的三套实现）：`components/ImageViewer/ImageViewer.vue`，由 App 的 `ImageViewerHost` 按需加载挂载；动态卡片大图、评论图片、私信图片都用 `useImageViewer().open({ urls, index, trigger, getOrigin, onClose })` 打开，不另写查看器。嵌入的原生详情页（动态详情弹窗、抽屉）把图片与缩略图位置经 `useIframeImageViewerBridge` 交给父页面全窗口显示，关闭后画廊跟到最后看的那张；父页面 180ms 内不应答时在 iframe 自己的 Bewly 应用里打开同一个查看器。外观是任何主题下都深色的媒体房间：`--bew-image-viewer-*` 深色遮罩 + 全局模糊，工具胶囊等控件实色、不叠玻璃，层级在抽屉之上。动效：图片从缩略图形变展开（transform + clip-path，按 object-fit: cover 裁切与圆角对齐），关闭时回到 `getOrigin` 给出的位置（旋转过或缩略图不在屏幕上时缩小淡出），离场结束前保留当前图像与缩放；切图时旧图向一侧滑出、新图从另一侧滑入；按钮与键盘的缩放平滑过渡，拖动、滚轮与捏合直接跟手；全部经 `holdAnimation` 登记，减少动态效果时只切换不移动。交互：适应窗口时不放大小图；滚轮、触控板捏合与双指以指针为中心缩放（最高 400%）；放大后拖动平移，越界按三分之一阻尼、松手回弹；双击（触屏双击）在适应窗口与原始尺寸之间切换；触屏左右滑切图、下拉关闭；触控板横扫每个手势一张；点空白处关闭；键盘 ← → Home End 切图、+ − 缩放、0 适应、1 原始尺寸、R 旋转、Esc 关闭，Tab 在查看器内循环，关闭后焦点回到缩略图。底部是缩略图条与工具胶囊（序号、缩小、百分比〈点按在适应 / 原始尺寸间切换〉、放大、旋转、新标签页打开原图），加载用 `LoadingRing`，失败可重试，相邻两张预载。
- 设置页从 Dock 设置按钮的 `DOMRect` 展开并保留 KeepAlive，只缩放最外层窗口，遮罩、窗口表面、顶栏与各栏淡入淡出（`useSettingsMotion`）。
- 左下新版本提示与重载提示共用 `--bew-surface-radius` + round。顶栏登录按钮用实色主题背景与 `--bew-on-theme-color`。
- 头像悬停资料卡保留原生 `bili-user-profile` 与关注逻辑，经 MAIN world 既有 Lit 桥注入 `userProfile.scss`：surface 圆角，control 高度按钮，已关注 / 发消息为中性，未关注为实心主题色；从头像锚点轻缩放淡入。发消息用原生 UID 构建 Bewly 私信深链在新标签页打开，目标会话按 ID 单独读取，新联系人用临时入口，不伪造历史。

### 动效

- 处处支持 reduced-motion。
- 运行中的分段滑块（含 Dock）、滚筒弹簧与面板缩放经 `utils/motionPriority.ts` 登记（`holdMotion` / `holdAnimation`）。页面切换引起的界面动画必须在导航的同一轮刷新里登记（同步 watch 或过渡的 before 钩子），以目标页而不是仍在显示的页驱动：侧栏收展（`PersistentSidebar` 以 `activatedPage` 判断）与顶栏胶囊按钮增减都先于新页面挂载与加载。`useReadyPageTransition` 把旧内容淡出拉长到剩余动画时长，动画结束（`afterMotion`，最长 800ms）后才挂载新内容。新增的 JS 驱动或缩放类动画同样登记。
- 页面切换只作用于主内容与首页 Tab，不改页头、侧栏的结构、几何、材质或滚筒：代码就绪后 60ms 淡出、150ms 淡入（`--bew-page-exit-duration` / `--bew-page-enter-duration`，用户要求调快），外壳不参与，滚动在旧内容退场后恢复；减少动态效果为 30/70ms 纯透明度。
- 项目不使用发光效果（Dock、Logo、滚筒、Toast、进度条均无），不恢复相关设置。唯一保留：Dock 深 / 浅色切换按钮深色悬停时的月光光晕（月盘随按钮改为图标大小，在图标后面）与其他按钮同步变暗，原样维持。
- 主题切换的圆形裁切保持终态直到 `ViewTransition.finished`，取消的旧回调不得重新提交主题。揭示期间新视图是实时的，主题翻转与页面和 Shadow DOM 里临时的 `transition: none` 同一步挂上、揭示结束后移除（否则所有颜色 / 背景 / 阴影过渡在揭示期间跑在主线程上掉帧，用户反馈）；这是“不写以 `*` 结尾的选择器”的唯一例外，只在切换期间存在。通知 B 站原生页的 `global.themeChange` 等揭示结束后再发。
- 删除动画全扩展只有一个（用户指定）：被删除的可见元素整体粒子化飘散，由 `utils/particleDissolve.ts` 的 `dissolveElements(元素或元素列表)` 实现，各页面不另写退场（WatchLater 的 `library-list` 淡出已删除）。一次读取元素子树（背景、已加载的图片与视频帧、文字行画成色条）在 OffscreenCanvas 上画成低分辨率图，粒子是它的格子，画在一张 fixed、`pointer-events: none` 的 canvas 上（`--bew-z-dissolve`），只绘制不回读，跨域封面无需 CORS；粒子总数有上限（`PARTICLE_BUDGET`，并发的删除分摊），只算视口内部分，结束即移除 canvas 并清空画布；时钟经 `holdMotion` 登记，时长 `--bew-dissolve-duration`；元素自身只淡出 opacity（WAAPI，fill 保持隐藏并 inert），减少动态效果时只淡出（`--bew-duration-fast`），不放粒子。不引入 html2canvas 等截图库，不整页截图。
- 删除的交互全扩展统一（用户指定）：单项移除（取消收藏、从稍后再看中移除、播放并移除、从观看历史中删除、搜索历史、筛选规则、屏蔽词）按下即删，没有卡片内确认、撤销占位或“重新加入”（`useCardRemoval` 与 `CardRemovalPanel` 已删除，不恢复）；只有不可逆或成批的删除先弹确认框（删除自己的动态与评论、删除收藏夹、批量操作、清空）。按下（或确认后）立即 `dissolveElements` 开始飘散，同时写入；写入成功且 `released`（约 0.4 倍时长，元素已淡出）后才移除数据，粒子继续在自己的 canvas 上飘散；写入失败或未确认调 `restore()` 让元素回来；不能先移除再播。数据由 store / 事件移除、可能早于 `released` 时也可以（粒子立即接替元素；同一元素再次调用会加入正在进行的飘散）。在原位显示撤销遮罩的“不感兴趣”与首页卡片的稍后再看开关不算删除。其余元素用 `useLayoutMotion` 平滑补位（只动 transform，进入的行才淡入），移除计数或数据身份作 source；数据在别处移除的列表以 `isDissolving` 为 `enabled`，只让删除留下的空位动起来；页面级列表传 `scroller`，被删的行都在视口外（成批删除伸到视口上方）时经 `scrollToPosition` 让首个可见行留在原位。

### 加载反馈

- 布局已知的内容用骨架：`SkeletonBlock.vue` + `src/styles/skeleton.scss` 的 `[data-bew-skeleton]`。骨架复用真实内容的列数、封面比例、字号行高与布局设置；已有数据保持可读，只占位缺的部分，不用全页骨架盖住可用的旧内容；加载完卸载，离屏图片停动画。
- 结果未知的区域（单个图标位、操作提交中、预览缓冲、通用 iframe、尺寸未知的媒体）用 `LoadingRing.vue`（`styles/loadingRing.scss`，非 Vue DOM 用 `utils/loadingRing.ts` 的 `createLoadingRingElement`）：3/4 弧旋转，完成时闭合后再恢复内容；图标位把原图标传入默认插槽同格切换。要等圆环闭合才退场的容器用 `useLoadingRingPhase`；时长取 `--bew-loading-ring-*`，减少动态效果时闭合为 0。
- 数量未知的加载（用户指定：搜索、筛选扫描、按条件读取）不显示骨架，也不显示“已扫描 N 个 / 匹配 M 个”、暂停 / 继续之类的进度提示或计数：列表为空时只在中间显示 `LoadingFill.vue` 的圆环，已有结果后续读只在尾部显示 `SmoothLoading` 的圆环（`PageLoadingIndicator` 不显示文字，“加载中”只给读屏）。宿主用 `useLoadingRingPhase` 让圆环闭合后再换成结果、空状态或错误。`VideoCardGrid` 的 `indeterminate` 即这种模式；收藏筛选、动态搜索与过滤、历史与稍后再看的筛选都用它。数量已知的加载（不带条件的首页、固定页大小的分页）仍用骨架。只覆盖部分已读页的数字（如收藏筛选里 UP 主的条目数）同样不显示。
- 原生播放器的缓冲提示不动；LIVE 状态图标不是加载动画。
- 发送按钮（私信、弹幕）共用 `src/styles/sendButton.scss`：圆形上箭头；状态 ready / idle（空输入，暗淡静止）/ pending（发送、上传、冷却中才转圈）/ blocked（原生禁用或 `canSend=false`，暗淡感叹号并说明原因），交叉淡入淡出。原生弹幕按钮保留原节点、事件与禁用权威。

### Composer

- 评论、私信、动态转发共用 `styles/composer.scss`（工具栏的图标按钮与附图的移除控件都是 `IconButton` + `composer.tool` / `composer.attachment-remove`，圆形安静控件，附图角落的移除按钮与缩略图同心）：32px `--bew-shell-radius` 普通磨砂外壳（只采样一次背景），上方透明正文区，下方表情 / 图片等图标工具栏与圆形发送按钮；关闭磨砂时用实色。外置表情 / @ / 话题面板共用 `useComposerPicker`，只在展开时监听定位与外部点击。
- 动态卡片展开评论即常驻 `MomentReplyComposer.vue`，固定在评论容器底部，列表按编辑器实测高度预留空间；只有表情 / @ 面板 Teleport 到卡片外。点回复复用同一实例，提示回复对象并隐藏图片与“同时转发”，取消回复恢复，草稿保留；回复对象只在编辑器顶部出现一次；常驻的空闲编辑器不锁住虚拟列表。顶层评论支持表情、真实 MID 的 @、JPG/PNG 图片与同请求 `sync_to_dynamic`；楼中回复只有表情和 @。
- “转发到动态”是全透明按钮：常态灰字，hover / 选中只提亮文字，选中后尾部的勾随共享动效显现。
- 评论图片为撑满正文宽度的统一三列网格，单 / 多图同尺寸，间距 4px。
- 转发输入允许空文案（不套评论的空输入禁用）。
- 原生评论增强复用原生 Lit 更新与编辑器局部 input 事件，保留原按钮、事件、校验与禁用权威，不加全局键盘监听或轮询（播放页的外置输入框是例外，见播放页）。
- 写入事务：根 / 父评论 ID 保持字符串；只合并服务端确认的结果；图片上传完成后再核对账号归属再发；未确认的公共写入不自动重试；收起或换号清理临时内容与图片 URL。验证时不代用户真实发布。

## 页面

### Dock、顶栏与页面模式

- 在展开的 Dock 上双指左右滑（`deltaX`）或滚轮（`deltaY`）切换到相邻页面，每个手势只切一页（`utils/wheelStep.ts` 的 `createWheelStepper({ oncePerGesture: true })`，惯性尾巴不连跳）；滚轮步进规则只此一份，`WheelSelector` 同样复用。
- Dock 默认在底部，只允许底部和右侧（旧左侧值迁移到底部）。完整胶囊。Dock 的每一项（页面、页面模式、明暗、设置、收起）都仿 iOS 标签栏（用户指定，2026-10-29）：图标下方紧贴（间距 2px）常显 caption 字号（11/14）的名称，没有悬停名称或 Tooltip（页面模式的名称是“页面模式”，当前模式由图标表示，说明留在读屏文字里）；项是全圆角的胶囊矩形（`--bew-corner-shape-capsule`），高 `--bew-dock-item-height` 56px（各宽度一致，用户指定）、最小宽 72px（宽屏 80px），左右内距 12px（2026-10-29 用户要求放大、避免拥挤），页面项等宽（取最长名称），相互贴合、无间隙。页面项与页面模式、明暗、设置、收起在同一个玻璃外壳里，中间一条发丝线分隔线（`--bew-hairline` 宽、`--bew-separator-color`，底部 Dock 时上下各留 12px、左右各留 4px，右侧 Dock 时方向对调；用户指定：变细而不拆成两个胶囊）。未选中项的图标与名称是二级强调 text-2，悬停时颜色过渡回一级强调 text-1（这就是悬停动画；按下图标缩小，减少动态效果时不缩），不铺底色、不显示名称；唯一例外是“深色模式 / 浅色模式”切换项（用户指定）：保持原样，常态 text-1，悬停图标轻跳放大并带月光光晕；样式只在 `styles/dockTab.scss`（Dock 与 `PageModeSwitcherButton` 共用）。选中项是无边框、比玻璃更深的底板 `--bew-dock-navigation-active-bg`（浅色前景 14%，深色黑 36%），图标与名称用主题色，无小点。外壳内距 4px（`--dock-shell-rim`，即选中底板到外壳边缘的距离，用户指定）。设置“显示 Dock 名称”（`showDockItemNames`，默认开）关闭时不渲染名称，项高换成 `--bew-dock-item-height-icon-only` 48px，外壳随之变矮，名称留在读屏文字里；“显示 Dock 角标”（`showDockBadges`，默认开）控制图标右上角的未读 / 新动态 / 待看数量，只影响显示，不改已读状态，外壳尺寸由项高派生。指示器动画与刷新后严格居中保留。
- 收起模式 `button / hidden / automatic`：按钮模式在设置按钮后显示收起入口；隐藏模式不提供收起；自动模式指针离开后收起、悬停圆球立即展开。圆球保持展开 Dock 的几何中心；同一玻璃外壳先沿主轴变化尺寸，再让按钮组进出，收起时顺序相反。不用 Teleport、第二套状态或两个表面交叉淡入。
- 三档页面模式（Bilibili / Bewly / 自定义）及其持久化保持一体。全局、顶栏与各页模式统一在“Bewly 页面 → 页面模式”，复用 `settingsStore`；Dock 内容只控制排序、显隐与新标签页。全 Bewly 用 Bewly 顶栏，全原版用原生 `.bili-header`，自定义按配置选择。
- 不适配第三方顶栏（Bilibili Evolved 已移除），不恢复 `BewlyOrBiliTopBarSwitcher.vue` 等旧切换入口。上游新的顶栏视觉或交互改动，移植前先取得用户同意。
- 顶栏铺满窗口：左侧内距是小电视的位置，搜索框紧跟小电视（不再居中，最宽 `--bew-search-bar-max-width` 680px），置顶频道在搜索框之后；有侧栏的页面搜索框（与置顶频道）紧跟侧栏右缘：由侧栏的目标状态 `railOpen` 驱动、按侧栏收展时长平移（translate，不改布局），与侧栏形变同步。首页搜索框与顶栏搜索框是两个实例，切页时经 `utils/searchHandoff.ts` 交接：离开的一方记录位置（首页的一方立即隐藏），出现的一方从该位置滑入（`composite: 'add'`，登记动效优先级），任何经 Dock 的切换都不让搜索框跳变。TopBar 的 DOM Ref 注册表不用深层 `reactive`（会自动解包）。
- 顶栏右侧没有消息按钮（连同消息弹层、消息抽屉与“以抽屉打开通知页”设置一并移除，不恢复；未读数只在 Dock 显示）。顶栏按钮不显示数字（用户指定）：只有动态在有新动态时显示主题色圆点（`.unread-dot`，`--bew-accent-marker`），角标类型只有“圆点 / 不显示”；稍后再看的数量是列表长度不是未读，不显示标记；旧的 `number` 值由 `normalizeSettings` 规范化为圆点。右侧按钮分三组（用户指定），各是一个玻璃胶囊 `.top-bar-tools`：页面组（动态、收藏、观看历史、稍后再看；窄于 lg 时只剩“更多”菜单）、创作组（创作中心与投稿，窄于 lg 时收起）与头像圆，组之间只靠间距、没有分隔线；按钮间距 `--top-bar-tools-gap` 尽量放宽（用户指定）：按动态页上右侧的实际内容（三个页面按钮、两个创作按钮、头像圆）算出不越过热搜卡片左缘的最大值，在 4–8px 之间，组间再多 4px；胶囊与小电视的圆共用 `sidebarSurface.floating`（侧栏材质、边框与 `--bew-shadow-1`），高度同小电视；玻璃画在按钮后面的 `::before` 层，弹层不落进它的 backdrop root。胶囊内图标不再走头图页白色强制。顶栏左内距是小电视位置（`--bew-home-logo-inline-start`），右内距是页面内容内距 `--bew-page-inline-inset`（与动态页右栏到右缘一致）。头像在同材质的玻璃圆正中，圆与头像是一个整体 `.avatar-orb`：悬停只把它放大一点（1.06），点击才打开用户面板（`setupTopBarItemHoverEvent('userPanel', { openOnClick: true })`，再点、点外部或 Esc 关闭；头像本身不再跳转，个人空间从面板里的名字进入）。面板在头像下方打开（默认锚定位置与 `slide-in`），不盖住胶囊按钮；打开时整个圆带着头像移入面板右上角并放大，圆在途中淡出，收回时圆在面板处先淡入再随头像回到原位。面板与其他顶栏弹窗同为设置窗口的实色表面（`modalWindow.surface`），圆角 `--bew-modal-radius`，右上角与放大后的头像同心（`--avatar-panel-face-radius` + space-2，round）；位移按 `computeAnchoredPopoverPosition` 的 8px 间距与 16px 边距推算，身份信息为头像留出空间。面板内与顶栏媒体弹窗同一套发丝线分区（用户指定）：顶部身份条（名字 subheading、硬币与 B 币 caption）高为放大头像加上下 space-2，底边发丝线是下方滚动区的上沿；其下依次是等级、三项计数（竖向内缩发丝线分隔）、两组链接与退出登录，各区之间用通到边缘的 `--bew-separator-color` 发丝线，行左右通到面板边缘、悬停整行铺 `--bew-hover-bg`，不用底板或阴影卡片。等级区所有等级一致（用户指定）：当前等级徽标 + 进度条（`--bew-accent-solid`）+ 下一级徽标，LV6 为满格且不显示下一级；最后登录时间与地点对所有等级显示，`hideTopBarUserPanelLastLogin` 关闭时不显示也不请求登录记录。
- 顶栏始终显示：没有滚动自动隐藏、个人空间强制隐藏或视频页显示方式（`autoHideTopBar`、`videoPageTopBarConfig` 已退役，原版顶栏也不再被隐藏），不恢复。只在 Bewly 宽屏播放页与原页面固定页头（含个人空间吸顶导航）出现时让位，避免两层页头重叠。
- 胶囊内按钮（含分隔线）增减或轮换时统一用 `top-bar-item` 过渡，三段时间线：离开的按钮先淡出（fast），然后所有槽位一起以匀速曲线 `--bew-ease-in-out` 收起 / 展开（moderate，胶囊随之伸缩），最后进入的按钮淡入；轮换时胶囊不会先长后缩；只有这些小按钮在变化期间布局（宽度动画的用户指定例外），首屏不播放，减少动态效果时直接切换。
- 右侧按钮在其目标页上不显示：正在动态、收藏、历史或稍后再看页（Bewly 页面或对应原版页面）时隐藏该按钮（`isCurrentTopBarItemPage`）。
- 小电视点击只回首页；分区浮层在首页标签栏右侧。图标样式的小电视与持久侧栏（`PersistentSidebar`）是同一块玻璃：有侧栏的页面（资料库、动态、消息）小电视没有容器、直接放在侧栏上，图标左缘与侧栏内容线（侧栏内距 + `--bew-sidebar-label-inset`，即滚筒标题与操作图标）对齐；无侧栏页面小电视位置不变，侧栏收成它背后的圆（`.logo-circle`，同侧栏材质与边框加 `--bew-shadow-1`，几何来自 `--bew-home-logo-inline-start` / `-block-start`）。切换时侧栏玻璃层 `.persistent-sidebar__surface` 以流体形变收进 / 铺出圆（窄成液柱、缩成水滴、挤压回弹，`--bew-sidebar-morph-duration`，经 `holdAnimation` 登记，可中途反向，减少动态效果时直接切换），结束后交给小电视的圆；形变只改这个无子节点的固定层的几何，内容层只淡入淡出。小电视经 `useSidebarHost` 的 `logo` / `railOpen` / `morphing` 与侧栏协作；没有图标小电视时侧栏照旧平移收起。hover 只把图标变为 `--bew-brand-accent`，玻璃不变。图标 `--bew-icon-size-lg`，viewBox 裁到图形自身的居中方框。字标样式不变。
- 动态尾页先追加 `items` 再设结束状态；稍后再看用显式页码、aid 去重与完整集合刷新；History 补屏保持单一 async 请求链。
- 动态续读默认关闭，只在全部 / 视频动态与顶栏视频动态启用；本窗口阅读书签与服务端视频未读分界分开表达。普通读取用非空 offset，只有主动回到最新才请求首页；未知未读响应不当空集合。向上补页每次至多三页，缺口与剩余游标随 owner 保留，接上原始区间才算完整；无进展和失败允许重试。插入沿现有虚拟布局和 scrollIntent 保持卡片锚点，不以总高度差补偿。动态页的续读按钮（`MomentsReadingActions.vue`，用户指定）是热搜卡片正下方的浮动玻璃胶囊（`sidebarSurface.floating`，侧栏按视口高度让热搜列表收缩以保证按钮可见）：第一行“回到上次正在看的动态”，第二行“回到最新”与常驻的“刷新动态”。“回到上次正在看的动态”只回到读者最后互动过的那张卡片（用户指定）：点击（打开、展开、点赞、评论、转发等，网格上的捕获阶段 `click`）、右键，或鼠标在卡片上静止停留 600ms 且期间页面没有滚动（滚动时滑到指针下的卡片不算）；按分类与 UP 主筛选分别记录（`lastInteraction`，含卡片顶边在视图中的位置）。卡片在视图内（虚拟布局的可见集合）时不显示，离开后出现；卡片仍在列表中时平滑滚回同一视图位置（`getCardScrollTop` + `scrollToPosition(..., 'smooth')`），已不在列表中时只在支持续读的分类里从该处重新加载。不再以阅读位置或服务端视频未读分界作为跳转目标（未读分界标记与续读设置不变）。“回到最新”与“刷新动态”行为相同（与 Dock 的回到顶部合并）：先平滑滚到顶部，滚动结束后再加载最新动态，不在滚动途中替换列表；“回到最新”只在列表不是从最新开始或读者已离开首张卡片时出现。Dock 在动态页不再显示回到顶部与刷新按钮。按钮变化按步骤依次播放（用户指定）：受影响的按钮先缩小淡出（fast），完成后布局一次性切换，再让新布局里的按钮放大浮现（moderate）；第一行增减时第二行也随之退出再浮现。动画进行中再有变化，等这一轮结束后再播下一轮。只用 WAAPI 动画 transform 与 opacity（合成线程，不随左侧滚动的主线程负载变慢，`holdAnimation` 登记），不做 FLIP、列宽或 grid 轨道过渡；减少动态效果时直接切换。按钮区固定为两行高（`contain: layout size style`），行的增减只在框内布局。模板只读布尔值（`showJumpToLastSeen`、`showJumpToLatest`），不读随滚动变化的对象；可见状态在既有的视口回调里写成布尔值，只有翻转时才触发。`scrollToPosition` 的平滑滚动返回滚动结束的 Promise；距离超过两屏时先瞬间跳到离目标一屏处再平滑滚动，避免逐屏渲染整段虚拟列表。
- 推荐快捷项只有一份有序 `{ mode, visible }[]` 偏好；零项合法，全部模式在设置中可选。排序与显隐不进入推荐请求身份，拖动完成且配置未被外部更新时才提交。

### 首页与搜索

- 推荐过滤按批次异步返回结果；普通关键词在页面内处理，正则只在 `src/regex/worker.ts` 执行，复用 `regexBatchRunner` 与扩展同源宿主。保留原 JS 正则语法，宿主预算 250ms，超时/退出终止 Worker；失败不回退到主线程。规则变更和页面退出释放旧任务，游标与列表只能在当前请求过滤成功后提交。
- APP 点赞筛选开启后，先做其他过滤和去重，再经现有 `getVideoInfo` 为有真实 aid 的普通稿件读取点赞数，最多三个并发；结果只写入未发布批次的 `normalized.likeCount`。不补发布日期或卡片统计，不将季 ID 当 aid；未知值不当零。页面隐藏、换配置、换账号或退出时取消未完成读取；筛选变化清理旧撤销历史，恢复缓存时核对筛选签名。

- 首页默认整合搜索页并复用单个 SearchBar：初始位置带聚焦人物，滚到顶栏后原实例吸顶、人物隐藏，吸顶后继续下滑的 `--bew-home-search-dock-travel` 内随滚动从居中平移到小电视之后（`--bew-home-search-dock-start`，与其他页顶栏搜索同列）：用页面滚动层的具名时间线 `--bew-page-scroll` 驱动的 CSS 滚动动画，只动 translate，居中位置只在 layout 帧测量；不支持滚动时间线的浏览器保持居中，不生成第二个搜索框。独立搜索页由单一反向开关控制；关闭时 `AppPage.Search` 归一到首页，Dock 不显示搜索项。两种形态共用同一组搜索设置；搜索框最大宽度 `--bew-search-bar-max-width`（680px）。聚焦时搜索框保持同一胶囊形状、材质与阴影，不变方、不变不透明；没有聚焦时的全屏模糊 / 暗化遮罩及其设置（`disableSearchFocusEffect` 已退役），不恢复。
- 搜索面板（用户指定，仿命令面板，首页与顶栏两个实例相同）：聚焦即展开，面板是胶囊自身向下长出的实色表面（`SearchBar.vue` 的 `.search-panel`）：与胶囊等宽、圆角取胶囊半高 `--b-search-bar-current-radius`，顶部让出胶囊高度，展开期间胶囊的玻璃、唇边与阴影让位（`search-wrap--open`，玻璃不叠玻璃）；进出只动 transform 与 opacity（WAAPI，`holdAnimation` 登记，减少动态效果时直接切换）。窄窗口的顶栏面板改为落在顶栏下方的独立实色面板。面板依次是：范围轨道分段（`SearchBarFilters.vue`：综合 / 视频 / 番剧 / 影视 / 直播 / 专栏 / 用户，即 B 站的搜索分类；输入框里 Tab / Shift+Tab 切换）与漏斗按钮，漏斗展开排序 / 日期 / 时长三行轨道分段（`useMeasuredDisclosure`，只在综合与视频下出现）；其下发丝线分区（`--bew-separator-color`，行通到边缘，指针或方向键所在行铺 `--bew-hover-bg`，没有圆角底板）：空输入时左栏是搜索历史（最多 8 条，`TagRemoveButton` 删单条、标题右端的图标按钮清空、Shift+Delete 删除选中行）与快捷操作，右栏是热搜（面板宽 ≥600px 时左右两栏、竖向发丝线分隔，否则上下排）；有输入时是快捷操作与联想建议。方向键在所有行之间移动（越过首尾回到输入框），Enter 执行选中行，未选中时按当前范围与筛选搜索；面板内按下不夺走输入框焦点。
- 搜索范围与预筛选只经 URL 生效：`utils/searchUrl.ts` 的 `buildPluginSearchResultsUrl` 是唯一构建入口（Bewly 结果页参数 `category`、`order`、`duration`、`time_range`、`pubtime_begin` / `pubtime_end`、`tids`；综合带视频筛选时打开视频结果，因为综合接口不接受筛选），原生页由 `pageMode.ts` 的 `buildNativeSearchUrl` 从它转换（`order`、`duration`、`tids`、`pubtime_begin_s` / `pubtime_end_s`），原生链接经 `getPluginSearchResultsUrl` 反向转回；`resolveSearchNavigationTarget(keyword, scope, filters)` 按设置二选一。Bewly 结果页的视频筛选与 URL 双向同步（不再只存页面视图状态），面板在结果页打开时取当前搜索的范围与筛选。分区筛选（B 站“维护升级中”）没有可用的分区列表接口，面板不显示该行，但 `tids` 已贯通 URL、结果页请求与原生转换，接口恢复后只需加一行选项。
- 快捷操作（`composables/useSearchCommands.ts`，标识解析在 `utils/searchShortcuts.ts`，都是真实动作，不伪造结果）：BV / av / ep / ss / cv 号直接打开视频、番剧或专栏；`uid:` 或纯数字打开个人空间（纯数字同时给出直播间）、`live:` / `直播间` 打开直播间；B 站或 b23 链接直接打开，按搜索框的打开方式设置执行；有关键词时“在动态 / 收藏 / 观看历史中搜索”（只在该页是 Bewly 页面时出现，经 `utils/pageSearch.ts` 的一次性路由参数 `q` 交给页面，页面用 `usePageSearchIntent` 应用为自己的搜索后删掉参数；收藏搜索全部收藏夹）；跳到观看历史、稍后再看、收藏、动态、消息（经 Dock 的页面跳转，图标取 Dock 项）与“搜索设置”，输入可按名称筛选。不注册全局快捷键，行尾的回车图标只提示选中行可执行。
- 首页 Tab 切换只替换内容网格：页头、搜索区与人物装饰不重建；未到内容顶部时保持当前滚动，已吸顶时恢复该 Tab 自己的位置（不低于内容顶部）。首页外层 `KeepAlive max=1`，不活跃的网格卸载并释放请求、预览、观察器，靠数据缓存恢复。其他页面只保留按账号隔离的内存视图状态，不缓存私信正文、请求所有者或 DOM。
- 视频抽屉复用真实历史项，底层逻辑路由保持原页；返回 / 前进不丢查询、不重复压栈。
- 广告识别靠明确的广告标记、广告反馈入口与推广 URL；缺少“不感兴趣”菜单不算证据。首页 / 原版搜索用现有列表 Observer 标记外层广告槽位，不删 Vue 拥有的 DOM，不对简介、标签和操作弹窗做文本关键词过滤。广告只隐藏不丢弃。动态的推广识别只有 `utils/momentPromotion.ts`（文本规则在 `momentPromotionText.ts`）：商品卡 / 带货附加卡与电商口令（`8(口令码):// CA1831`、`¥…¥`、`€…€` 这类口令格式，或“复制 / copy 本段话打开手淘 / 淘宝 / 拼多多 / 京东 / 抖音下单 / 领券”）都算明确的广告证据，单独出现即可，转发的原动态逐层同样识别（用户指定，是“不做文本关键词过滤”的窄口例外）；“Bug价”“拼手速”之类话术与普通提到淘宝的动态不算。命中的 `commerce` 在“屏蔽广告”（`blockAds`）开启时隐藏，不另设开关；警示、避雷语境降为 `suspected` 只加徽标。

### 内容卡片

- 视频卡片只有统一布局（旧 `videoCardLayout` 仅在退役字段中）。自适应网格不再按断点设列数：`repeat(auto-fill, minmax(--bew-video-card-min-width, 1fr))`，封面最小 320×168，统一 40:21（同宽时为旧 16:9 高度的 14/15，约 0.933 倍），CSS 用 `--bew-video-cover-aspect-ratio`，JS 估算用 `VIDEO_CARD_COVER_ASPECT_RATIO`，能放几列放几列；JS 窗口化用同一公式 `getAdaptiveGridColumnCount(width, gap)`（`VIDEO_CARD_MIN_WIDTH`）。`gridColumns`、`videoGridColumns` 已退役。首页内容到窗口两侧用 `--bew-page-inline-inset`（24px，与动态页右栏到右缘一致）。封面与信息区不放操作按钮：稍后再看、收藏、不感兴趣等全部在 `VideoCardContextMenu`，由卡片右键（触屏长按、键盘菜单键）打开，Shift + 右键或已选中文字时保留浏览器菜单；页面专属项（如收藏页“取消收藏”）经 `VideoCardGrid` 的 `getMenuExtraGroups` 追加，不回到封面。
- 卡片菜单（`VideoCardContextMenu`）是独立浮层毛玻璃：`--bew-popover-surface-background` + `--bew-filter-glass-1`（服从全局模糊强度与关闭毛玻璃）+ `--bew-edge-color`，入场只缩放不淡化。列表被裁断的上 / 下端用 `ProgressiveBlur`（只在该方向还有内容时显示），不显示箭头；这是“玻璃不叠玻璃”的用户指定例外。右键所在布局区域时追加“编辑此布局 / 打开对应设置”（`findLayoutEditableTarget` + 应用 provider 的 `openLayoutEditorSetting`）。
- 菜单项不再隐藏：`videoCardContextMenuAdvanced` 列出的项收进底部“高级选项”折叠区（`useMeasuredDisclosure`，收起时 inert），其余直接显示；默认收起复制原始链接、BV 号、AV 号。“复制链接”复制净化后的链接（`cleanBilibiliUrl`，按设置附标题）。没有“抽屉打开”菜单项。
- 视频卡片不显示标签、徽标（已浏览、推荐 / 视频标签）和作者头像；唯一的标记是作者名右侧的中性“已关注”胶囊。仿 Apple Music 专辑封面排版：封面用 `--bew-media-radius`（16px，圆角体系的锚点），不叠播放量、点赞、弹幕、时长等统计；信息区与封面左缘齐平、无左右内收，封面下 12px 起标题，最多两行、按实际行数自然增高，不给真实标题预留两行高度。标题后 4px 紧跟次要信息“UP 主 [已关注] · 发布时间”（同一字号，取 UP 信息字号设置，时间不换行），单行与双行标题都保持这一间距。标题用 text-1、字重 400，与全局原生文字层级一致；只有骨架保留两行占位。首页、历史网格和稍后再看网格统一复用 `useVideoCardSharedStyles` 与 `contentCard.scss` 的 `video-details / video-title / video-subtitle`，不在独立卡片中另设字号、字重或两行最小高度；网格的用户名不附头像，保持与封面左缘对齐。
- 裸卡（`contentCard.bare`）常态与 hover 都透明，hover 整卡放大 `--bew-card-hover-scale` 并抬到相邻卡片之上（`contentCard.hover-lift`，动态卡片也用它）；视频卡片 hover（仅鼠标）时才渲染居中的 `ProgressiveBlur edge="center"`（`hover-halo` / `hover-halo-layer`，强度 `--bew-card-hover-blur-radius`），以卡片中心向外渐变模糊被遮挡的邻卡。减少动态效果时不放大。
- 视频封面统一用 `contentCard.media-frame`：画在图片之上的 `--bew-media-edge-color` 发丝线内描边（`::after`）+ `--bew-media-shadow`。裸卡 / 表面卡交互复用 `contentCard.scss`，间距与封面控件用 `--bew-card-*` / `--bew-cover-*`；行距由网格管理，卡片不加底部 margin。
- 作者常态中性前景，悬停与键盘聚焦用主题前景。动态卡片用视频封面的圆角与边框（用户指定）：卡片圆角 `--bew-media-radius`（`--bew-moment-card-radius` 已退役），表面用 `contentCard.media-frame`（细描边画在内容之上 + `--bew-shadow-1`，hover / 聚焦 `--bew-shadow-2`，外层卡片不再自带阴影）；骨架同此。动态卡片上新增的选中、显隐、形变与位移都有过渡并支持减少动态效果，各分支由 `verify-sidebar-continuity.mjs` 实际运行（层叠淡入淡出、图片显现记忆、取色缓存与注册）。hover 与视频卡片统一（用户指定）：`contentCard.hover-lift` 整卡放大并抬到相邻卡片之上，倍率略小（`--bew-moment-card-hover-scale` 1.05，卡片比视频卡大得多），仅鼠标、减少动态效果时不放大；评论或转发展开后照样放大。封面、预览、模糊与渐变都在同一个缩放元素里，不单独变换。卡片自己打开的菜单或 Composer 表情 / @ 面板（`useComposerPicker`）在指针仍在卡片上时打开的，打开期间保持放大（`useHoverLiftHold` + `moment-card--lift-held`），免得指针移进面板时卡片缩回、面板离开锚点。瀑布流高度、标题行数与展开高度一律读布局尺寸（`viewportGeometry.ts` 的 `getLayoutHeight`），不用会带上缩放的 `getBoundingClientRect`。卡片表面不透明：用 `--bew-elevated-over-page`（`--bew-elevated-solid` 按 `--bew-content-opacity` 混 `--bew-homepage-bg`，即半透明表面在页面上的样子，骨架同此），放大后叠在邻卡上不透出下面的卡片。每张动态卡片 `isolation: isolate`（表面的 z-index 留在卡片内），悬停的卡片（z-index 1）盖在所有邻卡之上；`hover-lift` 离开悬停时 z-index 延后到缩回结束才降，缩回途中不钻到邻卡下面。不画悬停晕影，没有上移与按下缩小。动态页没有分割线（用户指定）：卡片底栏、评论区、评论楼之间、转发编辑区与骨架只靠间距分隔。卡片内距 16 等于圆角，按“内距不小于外圆角不必同心”的规则，卡片内的无图视频封面等仍用 `--bew-media-radius`；引用块（被转发的动态）用更小的嵌套圆角（见下）。
- 有图片的动态（`hasTopCover`，`moment-card--top-cover`：视频投稿 / 合集 / 番剧与直播的封面，图文动态的图片）：封面放在卡片最顶部、作者行之前，左右与顶部无内距铺满，自身只裁上方两角（`--bew-media-radius`），底部 `--bew-space-6` 内先是 `ProgressiveBlur edge="bottom"`（向上减弱，卡片就绪且入场动画结束后挂载，挂载时用 `@starting-style` 按同一时长淡入）再叠一层渐变到卡片颜色 `--bew-elevated-over-page`，关闭毛玻璃时只剩渐变。这类卡片的表面不做溢出裁切（平滑圆角 + overflow 裁切会让 Chromium 丢掉渐变模糊的遮罩）。预览一开始（含加载圆环阶段，`previewActive`）模糊经 `visible` 与渐变层一起按 `--bew-duration-moderate` 缓慢淡出（`ProgressiveBlur` 的淡化时长取 `--bew-progressive-blur-fade`，默认 fast），预览停止后淡回（减少动态效果时直接切换）。顶部封面与其图片不铺深色底或占位底，渐变层向下多伸 1px 盖住封面底边像素：放大后底边落在半像素上，图片与深色底在边缘像素混合会画出一条暗线。封面与视频卡片一样不叠信息（用户指定）：没有播放量、时长、稍后再看按钮或充电徽标（充电状态在正文与解锁块里），只保留直播的 LIVE 标记（`LiveMark.vue`）；悬停预览保留。宽卡（≥880）封面在左列贴齐顶与左缘、跨作者行与正文两行，作者行与正文在右列。没有封面图的视频 / 直播仍在正文区用内嵌文字封面。图文动态（`hasTopImages`，用户指定）用同一个封面区与底部模糊渐变，不另写一套：顶部一次只显示一张整宽大图（比例取首图，横向最宽 2:1，`object-fit: cover`），切换是新图加载好后在旧图之上淡入（`--bew-duration-moderate`），不左右平移：已绘制的图按层叠放（`utils/crossfadeLayers.ts`），淡入淡出由 WAAPI 从当前绘制的不透明度开始（`holdAnimation` 登记），连续快切时下层继续淡入、切回时上层从当前位置淡出，全部结束才只留当前图；首图与封面、缩略图在加载后淡入，加载过的（`utils/pictureRevealMemory.ts`，与 `LazyPicture` 共用）重挂载时直接显示；触控板横向轻扫每个手势切一张（`createWheelStepper({ oncePerGesture: true })`，纵向滚轮照常滚页面），触屏横滑与 ← / → 同样切换，点大图打开图片查看器。只挂载看过的大图。多张时渐变下方 8px 是一条缩略图条：全部图片 48px 方块首尾相接、之间 `--bew-hairline` `--bew-edge-color` 细线，整条按缩略图收宽、圆角 `--bew-interactive-radius`（内距 16 等于卡片圆角，圆角缩小嵌套），横向滚动复用 `elasticScroll`（只接管横向滑动），当前图不透明、其余半透明，切图时把当前缩略图滚进可见区。单图图文在宽卡里与封面一样占左列。原来正文区的九宫格图集、“+N” 与充电徽标已移除（充电状态在正文与解锁块里）。顶部媒体（封面 / 单张大图与缩略图条 / 底部模糊渐变 / 竖图）只由 `MomentMediaStage.vue` 实现，卡片顶部与引用块共用；圆角、内距、缩略图条圆角与渐变终点颜色经 `--moment-media-corners`、`--moment-media-inset`、`--moment-media-strip-radius`、`--moment-media-base` 由宿主决定，竖图取色由 `useImageTone` 提供。高度估算按整卡宽计算封面。右键视频封面、直播封面、无图文字封面或转发视频封面打开全局视频卡片菜单（`MomentMoreMenu` → `VideoCardContextMenu`，与三点按钮同一菜单，在指针处打开；Shift + 右键或已选中文字时保留浏览器菜单，触屏长按与键盘菜单键同样触发），定位与视频卡片共用 `utils/floatingMenu.ts` 的 `getContextMenuPlacement`；稍后再看在菜单里。直播间按 `live` 类型只给适用项（打开、复制链接、查看封面、关注 / 加入黑名单，无收藏与 BV / AV），动态自己的举报 / 删除追加在后。
- 引用块（被转发的视频、直播与图文动态，用户指定）：与卡片同一套样式的小卡片 `.moment-card__quote`：顶部是同一个 `MomentMediaStage`（视频 / 直播封面带悬停预览、LIVE 标记与右键菜单，图文为单张大图交叉淡入加缩略图条，竖图同样限高并让引用块取图片颜色），底部模糊渐变到引用块颜色（中性前景 5% 混卡片表面），下面是作者行（头像、名字、动作）、标题与两行正文，不显示播放量等统计。圆角与卡片嵌套：卡片内距 16 等于卡片圆角，引用块取 `--bew-interactive-radius`，其缩略图条（内距 12 大于 8）再取 `--bew-radius-tiny`。引用块与卡片表面都不做溢出裁切（渐变模糊的遮罩）。被转发的直播间封面由适配层的 `forward.liveCover` 提供，外层不再显示“直播动态”文字封面，原动态标题只在引用块里显示。非视频引用块整体可点打开原动态（`role="button"`），视频引用块由封面与标题打开视频。
- 竖向媒体（用户指定）：高不小于宽（≥ 1:1）的竖屏视频、直播与图片由 `utils/portraitMedia.ts` 的 `isPortraitRatio` / `isPortraitDimension` 统一判定，卡片带 `data-bewly-portrait`。动态卡片顶部是竖图时（`moment-card--portrait-top`）：上部照常显示，清晰部分至少一个横向视频封面高（竖图必然满足）、最高 `PORTRAIT_MAX_CLEAR_HEIGHT` = 1.2 倍卡片宽，其下以 `padding-bottom` 加出 48px（`--bew-space-12`）更长的模糊渐变；卡片下部（`moment-card--toned`）以图片被截处的主体颜色为底（`utils/imageTone.ts` 的 `readImageBandTone`：取 64w 小图的 CORS 副本，在 OffscreenCanvas 上平均截断处以上 15% 高的带区，按 URL 与带区缓存），渐变终点同色。卡片内全部文字（正文、评论、Composer 等）按底色用 `getContrastingForeground` 取黑或白，填充、边框、悬停、选中、链接与 Composer 玻璃色调都由同一前景派生（玻璃色调与全局 token 同构：实色降级取底色，`--bew-glass-tint` 是它按 `--bew-content-opacity` 的半透明版，评论输入框仍是磨砂玻璃，不改成不透明）；多图时随当前图更新。取色前卡片用自身颜色（回退值在卡片上、覆盖在表面上，避免互相引用）；`--moment-tone` / `--moment-tone-fg` 以 `registerToneProperties` 注册为颜色，表面对二者做 moderate 过渡，取到颜色与切图换色时所有派生色（含渐变）一起缓变；已取过的颜色经 `peekImageBandTone` 首帧即用，重挂载不重播。视频卡片等其他位置的标记暂无样式。已标：动态顶部图片（按 `imageRatios`，单张大图与整卡）、视频卡片 `Video.portrait`（App 推荐的竖屏 `vertical`、排行榜与热门的 `dimension`）。动态里的视频与直播、稍后再看等列表的数据不带宽高，暂未标。
- 封面下方信息区左右内收到封面圆角的直线切点、底部留同等空白（`contentCard.scss` 的 `under-cover`，内收值直接取对应媒体圆角）；视频卡片例外（与封面左缘齐平，见上）；横向图文不套用；可截断文本元素不加底部 padding。

### 播放页

- 临时旋转、镜像和声音延后绑定 MAIN 确认的稿件 / CID / EP，不按 blob URL 重置。画面用可单独释放的叠加变换，声音延后复用本地响度处理的唯一媒体源与输出。关闭临时能力不关闭响度均衡，隐藏入口不清除调整；声音延后为 0 且无响度需求时不建立音频图。BTR 安装状态与当前 MSE 接管状态只经现有媒体桥读取，不操作其设置、下载器和媒体源。

布局（2026-10-21 左右分区）：

- 左侧视频区宽约窗口 50%（右栏不足 360px 时收窄，几何由 `styles/cardLayout.ts` 共享给骨架），贴齐窗口上、下与外侧边缘，整窗高、直角，播放器上下留黑边。窄窗口（≤900px）单列：16:9 视频区在上，右栏在下。
- 右栏依次是信息模块 `.bewly-widescreen-info`（右栏首个子元素，最高约 45%，超出内部滚动）、标签栏、面板。右栏只负责布局：透明，无边框、圆角、阴影、毛玻璃或内嵌底板，不新增背景采样，不用负 z-index 伪元素做整栏模糊。四周有页面内距、底部除外，面板滚到窗口底边，`--bewly-widescreen-rail-bottom` 让末尾内容避开停靠的输入框。保留右栏左右位置设置；`layoutPriority`、`centerVideo`、`sidebarWidth` 及边缘展开、拖动调宽、收起按钮已删除。
- 底部控制栏是玻璃卡，圆角不变，距视频区两侧和底边 `--bewly-widescreen-card-inset`；显隐沿用统一控制栏显隐值。控制栏只放控件，应用控件与弹幕控件间 1px 分隔线；Tabler 图标要给图标盒与字形显式尺寸（Bpx 控制栏 `font-size: 0`）。
- 视频左上角原生头像 + 关注（`.bpx-player-top-left-follow` / `.bpx-player-top-follow`）隐藏，其他左上入口保留。该角预留空位 `.bewly-widescreen-player-toolbar`（card-inset 处，高 36px，宽 4 个 36px 图标加 8px 间隔），目前为空、不绘制、不拦截点击，将来的图标自己开启 pointer-events；铺满与缩放中隐藏。
- 播放页内的 Bewly 辅助按钮复用底部控制栏表面。隐藏浮动小电视 Logo，改由停靠在控制栏的 SideBar 提供“首页”按钮（在页面模式切换之前）。

显示模式（`card` / `fill`）：

- 控制栏末尾的“铺满窗口”按钮（Tabler maximize / minimize）取代被隐藏的原生宽屏、网页全屏和全屏按钮；铺满只显示视频并让右栏淡出且 inert，Esc 返回，F 仍走原生全屏。
- 切换不改地址、不重建播放器：播放器立即跳到终态几何（一次原生 resize），再从当前绘制帧（含中途反向）按画面宽度与中心缩放。位移缩放是只用 transform 的合成器动画，`inset()` 裁切用同时序的主线程动画，两端都是直角；从视频区放大时由背板 `::before` 画播放器底色补齐黑边。期间控制栏隐藏、跳过几何测量、壳层降到播放器下方，并经 `holdAnimation` 登记；减少动态效果时直接切换。
- 起始帧只改不继承的样式；播放器模式样式与面板 `inert` 会重算整棵原生 / 评论树，经 `heldRestMode` 延到落定帧。B 站可能整体重渲染 `.app-v1`，由 `watchAnchoredPlayerAncestry` 在观察器微任务内重新锚定。
- 模式与缩放状态只写在播放器（`data-bewly-display-mode` / `data-bewly-zooming`）、外壳、背板和 `#bewly` 宿主上，不写 `body` class（会整页重算样式 30–40ms）；锚定几何变量用 `@property` 注册为不继承。

右栏内容：

- 对齐网格优先于容器：信息区每行从右栏内容线开始；标签栏、面板内容、输入框、原生评论头像与弹幕列表首列共用这条线，滚动层只向外扩 space-1 容纳悬停与焦点环。
- 作者与操作分两行。第一行：头像 + 名字 / 发消息 + 单行签名占满剩余宽度（按宽度省略），充电 / 关注贴右缘，名字区窄于约三个头像宽时按钮才换行。第二行：点赞 / 投币 / 收藏 / 分享 / 稍后再看是中性 fill-1 胶囊（36px、interactive 圆角、宽随内容，稍后再看为正方形），hover 换 fill-2 并提亮文字，已操作态用 `--bew-selected-bg`。充电为中性填充，主题色只留在关注（未关注 hover 轻微提亮）。按下缩到 0.97（减少动态效果时不缩）。分享计数取消原生固定宽度与绝对定位。
- 间距：标题→元信息 8px、元信息→作者 16px、作者→操作 12px、操作→简介 16px。简介与标签上下排列、不加容器；标签是中性 fill-1 胶囊。
- 元信息行是克隆：在线人数镜像进来并保持在末尾（`syncViewerCount`）；去掉“未经作者授权，禁止转载”（`.copyright`，原生节点不动）；原生没画图标的项补 Tabler `clock` / `info-circle`（sm，`prepareMetadataClone`）；监听原生节点迟到的图标填充并刷新克隆（导航中不刷新）。
- 选集与推荐同一行规格：120px 缩略图、13/16 两行标题、caption 元信息、同心圆角悬停底；正在播放为 `--bew-selected-bg` 加 `--bew-accent-marker` 圆点；合集后的推荐以“接下来播放”分组。选集面板子元素 border-box，合集框透明、对齐栏宽，订阅合集与收起同为中性描边按钮。
- 文字层级（含原生评论 Shadow DOM，经 MAIN 既有样式补丁）沿用全局 macOS 角色，不在播放页另设字号：heading `17/22` 给视频标题；title `13/16` 给“评论”“接下来播放”、合集标题、作者名；body `13/16` 给评论正文（text-1）与简介（text-2）；control `13/16` 给标签栏、按钮、操作胶囊、标签、排序、列表标题与评论用户名；caption `11/14` 给元信息、签名、发消息、地区、评论时间与点赞 / 回复、“共 N 条回复”、计数、时长角标、自动连播。评论操作行 hover 提亮，已点赞保留原生色。
- 缩进统一 52px（40px 头像 + space-3）：作者行、评论与楼中楼都从这里开始；评论头像由原生 48px 以 `scale: 5/6` 自左上角缩到 40px（绝对定位，不改布局）。节奏：组内 4–8px、组间 16px、区块 24px；评论头部 host 改为 block、`#contents` 去顶部内距。
- 弹幕列表表头在“发送时间”前加“用户”列：按发送者分组（弹幕多的在前、组内按播放时间），再点反转。列表仍是原生实例：MAIN 在一次原生表头点击期间临时替换排序比较器（`sortNativeDanmakuListBySender`，结束即还原 `Array.prototype.sort`），并让该列停在倒序；只用 `uhash`，不显示用户名。弹幕输入框不迁出原生播放器树；历史弹幕按钮只改视觉位置。
- 播放器弹窗共用 `styles/layout.ts` 的 `PLAYER_POPOVER_SURFACE`（实色 `--bew-elevated-alt-solid`、发丝线外缘、surface 圆角与阴影、无背景采样）：控制栏菜单 / 提示、弹幕模式与设置、播放反馈面板。原生反馈面板（`.b-back-panel`）用同一表面并重排（标题行 + 分隔线、28px 关闭、两列选项、共享输入 token、主操作主题实色），保留原生节点与提交逻辑；只按 B 站自己设色的类名重设颜色，不写以元素类型或 `*` 结尾的选择器。

评论：

- 评论区用与动态卡片相同的 `MomentReplyComposer`（`App.vue` 中 `PlaybackCommentComposer.vue` 经 Teleport 渲染）：绝对定位在 `.bewly-widescreen-panels` 右栏底部内距处，评论面板按 ResizeObserver 实测的 `--bewly-widescreen-composer-height`（写在评论面板自身、不继承）预留末尾空间；只在评论面板显示时出现，铺满时随右栏淡出并 inert。面板带 `data-bewly-external-composer` 时，MAIN 用 `:host-context` 隐藏原生输入框，并改写 `bili-comment-thread-renderer.handleReply` 把回复目标经 page bridge 交给 Bewly；列表 `commentBoxDisabledState`（未登录、关闭评论）时走原生路径。服务端确认后经 bridge 写入原生 `newItems`（根评论置顶、楼中回复追加）。这是“评论增强保留原生输入控件”在播放页的例外。
- 加载统一为单个 `LoadingRing`：评论面板加载态、加载遮罩右栏，以及原生 `bili-comments-spinner`（MAIN 以遮罩画同一 3/4 弧，首帧前注入，保留无障碍文字）；面板圆环在评论就绪时先闭合再淡出。

原生节点与加载时序（细节见 `docs/maintenance/widescreen-native-adaptation.md`）：

- 优先保留原生作者、关注、充电、消息、评论和播放器节点，不为换材质重建业务控件、不克隆业务按钮、不复用已释放的节点。原生评论排版经 MAIN world 既有 Shadow DOM 样式桥，限定在 `#bewly-widescreen-root`。
- 简介、标签和原生操作根节点的迟到更新或替换由既有侧栏 Observer 处理。普通 BV/AV 页的作者、操作栏、简介和标签移交前经 `videoMetadataBridge` 确认 MAIN world 的原生 Vue 组件已挂载并拥有该节点（ISOLATED 不读 `__vue__`；DOM 存在或 API 统计不算就绪）；组件销毁通知走侧栏刷新与统一清理。缺少原生工具栏时侧栏不算完整，超时提供刷新 / 退出入口，迟到恢复后清除错误。
- 侧栏水合只计页面可见时间（隐藏时暂停，重新可见后重开 12s 预算）。原生评论首屏仍在请求（`#spinner-container`）时最多保持加载态到 30s；之后显示恢复提示但继续以 1s 节奏观察并保持评论预热到 60s，迟到的节点到达后自动清除提示（`resolveWidescreenSidebarHydrationPhase`）。评论缺失时每次水合经 page bridge 调 `wakeNativeCommentLists` 释放懒加载等待；12s 预算后首屏仍在转圈，每个预算只请求一次原生 `reload()`。
- Bewly 播放栏在原生控制栏、弹幕栏和辅助按钮布局稳定后退出初始化骨架（`playing` 事件不算布局就绪）：原生结构齐备时 DOM 解析后即可提交，不等 `load`；提交后 4s 仍不稳定则照常揭示外壳；骨架期间只有自动连播可因 `playing` 提前撤骨架。

### 消息页

消息页与稍后再看页的外观已由用户解冻（2026-10-25），按与其他页面相同的设计体系演进。下列为行为与结构要点，视觉细节以源码为准（历史细节见存档与 `docs/notifications/`）。

- 结构：Notifications 是 Native Message Center。`reply / at / love / system` 是 Vue Native Feed；`whisper` 是支持会话管理、文本与图片发送、历史搜索的 hybrid workspace。普通用户、官方助手、未关注和拦截的一对一会话都在 Bewly 内读取；粉丝团和不支持的会话进 Native fallback 详情，只有用户点“打开原版私信列表”才离开。不隐式挂载原版私信或 System iframe（原版 System URL 保留为显式失败入口）。未选会话时显示 `ConversationInsights.vue` 与“全部标为已读”。
- 布局：分类、搜索、筛选与会话列表在持久侧栏（贴齐左、上、下，内部避让顶栏，只采样一次毛玻璃，材质为共享玻璃 `--bew-glass-tint`），切换分类不卸载列表；分类用 `WheelSelector.vue`。消息顶栏 absolute，层级依次为搜索控件、侧栏、内容，Dock 高于底部模糊。
- 通知 Feed：四类共用加载、错误、刷新、分页、滚动锚点、账号隔离与 read-commit 生命周期，但 items、cursor、read commit、single-flight、缓存与 scrollTop 各自独立；同一时间只渲染当前一个 Feed DOM，隐藏分类不保留长列表、Observer 或监听，不用 KeepAlive 留多套。自动激活、未读变化与可见性刷新用 `merge-head` 保留历史与锚点，手动刷新用 `replace` 回顶部；分页检查 cursor 或唯一条目是否前进，停滞即停止自动请求；Retry 按 `failedOperation` 精确重试。System 用专用模型与单一 string cursor，只用已验证的 `unified + user` 首屏、legacy cursor 历史与 `update_cursor` 已读，不猜图片、按钮或 module。解析或分页规则变更要同步脱敏 fixture 并通过 `pnpm verify:notifications`。
- 已读：服务端成功后只经 `topBarStore`（`syncUnreadMessageState()`）同步未读与跨标签 broker，不建第二套 unread Store；System 先成功提交 `update_cursor` 再建 read commit，无逐条证据不推导红点。“全部标为已读”只在用户点击时经 `useMarkAllMessagesRead` 读取其他分类并遍历私信分页，按服务端 seqno 确认，期间新到的保持未读，部分失败可重试。
- 通知卡片：Reply / At / Love 为头像 + 正文两列、正文下引用区，System 为单色线框图标 + 标题 / 来源 / 正文；可用宽度 ≥880px 时 `WindowedMasonryGrid.vue` 按自然高度放入较短列，DOM 保持时间顺序，分页不重排已有卡片。窗口复用 `momentColumnIndex` / Fenwick 索引，只挂载视口与缓冲区及焦点项；按分类保存列分配与测量值用于滚动恢复。骨架高度一致，使用 CSS 网格，不添加逐项测量器。
- Insights：可用宽度 ≥720px 等宽两列四卡（未读柱状、活动折线、私信来源比例、四个最近会话），间距 12、内距 16、环图 96，卡片内底透明，窄屏单列。近 7 天折线只统计已载入会话的最近活动日，不伪称完整历史；未知计数用短线，真实零值显示 0。
- 私信协议：Web IM 走后台 `api.vc.bilibili.com` Web endpoint，复用 WBI 签名，对已确认的 ID / seqno 字段窄范围无损解析；正文与草稿不持久化。历史按 `msg_seqno` 分页、`msg_key` 去重；ACK 只在会话可见且位于最新区域时提交，成功后才清本地未读。会话详情按页面级 LRU 淘汰（当前会话与 ACK 中的不淘汰），每会话消息数受设置上限、只保留最新并保留分页边界；离开 Notifications 释放数组并失效旧请求。
- 发送：普通用户与 transient recipient 显示文本与图片 Composer，官方助手与不支持会话不开放，只读会话显示禁用 Composer。`send_msg` 的 WBI 只签 `w_sender_uid / w_receiver_id / w_dev_id`，`wts / w_rid` 只进 URL query；每账号一个 UUID v4 `dev_id` 存 extension local storage。Chromium 只对精确的 `web_im/v1/web_im/send_msg` POST 改写消息站 Origin/Referer。API `code=0` 且历史对账确认后才显示成功，已接受未确认的不自动重发；HTTP `412` 归为 `risk-control`。图片选择只生成本地预览，明确发送后才上传；换号、切会话或卸载停止未发出的步骤并释放对象 URL。表情按账号读取原生用户表情目录。文本与图片入口在开发与打包构建中一致，`experimental` 只是目录名，不是运行时门禁。
- 会话：点击会话先展开透明右侧容器，展开结束再请求历史并逐条浮现（不用历史骨架；关闭、切换或卸载取消待发请求）。切换用户只淡出消息、外框与输入栏保持同一实例；再点当前用户关闭详情。换号立即清理旧视图。输入栏在右侧内容区避让 Dock，桌面下按整屏中线左右等距。私信视频封面经 `usePrivateMessagePreviews` 复用 `useMomentPreviews` / `MomentVideoPreview`，悬停即请求并播放，离开、离屏、切换或隐藏时释放。头像（有效 MID 时链接个人空间）与选择按钮是兄弟元素，不嵌套交互控件。隐藏的会话不继续读取或 ACK。失效卡片用 288×96 响应式占位；转发媒体卡片封面默认 384px 宽、16:9、外侧 8px 留白，随消息区收窄。
- 视觉例外（用户授权）：对方气泡左上角、自己气泡右上角为直角；会话内搜索定位用无圆角整行渐变（`--bew-message-search-highlight`，收到的从左向右消失、发出的反向，覆盖到屏幕右边缘，不改变消息内缩）。无符合条件的会话时只居中显示文案，不挂插图。
- 会话菜单（`ContextMenu` / `Dialog` + `usePrivateSessionActions`）：置顶、免打扰、内容推送按当前客户端协议提交并回读，黑名单复用共享关系修改；举报须用户选理由并确认，最多 10 条证据消息只读、不 ACK、不持久化。读回未确认时不重复提交。协议见 `docs/maintenance/2026-10-11-private-session-actions.md`。
- 搜索：左栏输入框无 placeholder、只有一个清除按钮；有关键词时显示“用户 / 消息”分类，退出恢复原筛选与滚动。用户搜索即时筛选已载入会话，350ms 停顿后查询完整关注列表（每页 10 条，串行限速自动加载到底），再请求全站用户（每页 10 条，最多三页手动续载）；两组按 MID 去重，无结果只居中显示“没有找到相关用户”。没有会话的结果是内存中的 transient recipient，首条消息确认后换成真实 session。消息搜索在选“消息”或提交关键词后开始，串行限速分轮扫描（每页 20 条），暂停、改查询、隐藏、离开或换号即停止；结果不持久化、不 ACK、不进普通会话缓存；群聊与不可读会话标注未覆盖。同一关键词切换分类保留两类内存结果与位置。防抖、间隔与批量参数集中在 `privateSearchPolicy.ts`。匹配导航在输入栏右侧，Enter / Shift+Enter 切换匹配，Escape 退出并恢复输入焦点。
- 消息设置只在全局“Bewly 页面 → 消息页”，Notifications 内没有设置分类；旧 `notificationView=settings` 在渲染前规范化并打开该设置页。服务端设置值不写入本地 settings，每字段独立提交并以回读对账；屏蔽词 `words` 为 null 或缺省视为空列表（额度字段须合法），读取、增删与已提交未确认分别呈现，增删需先读到额度，未确认前不重复提交。

### 资料库（收藏 / 稍后再看 / 观看历史）

- 三页复用 `LibraryWorkspace.vue` 的贴边持久左栏（宽度与消息页一致，单层共享玻璃与实色降级），保持页面级主滚动与原有分页 / 虚拟列表。标题用 `LibrarySidebarHeading.vue`（WheelSelector），搜索用 `LibrarySearchField.vue`（全圆角、常驻细边框、单一清除按钮；保留 IME 与空查询门禁）。不再用视频封面作左栏背景；首屏骨架用同一左栏布局。层级：顶栏搜索与菜单 > 侧栏。收藏侧栏不在滚筒上方重复显示标题。
- 三页按动态页的四条思路设计（用户指定，2026-10-25）：侧栏背景平铺、横向滚动穿透、图文沉浸、所有动作都有动画。
- 侧栏平铺：模块不加底板，直接放在侧栏玻璃上，分组用 `railSection.flat`（左右通到侧栏边缘的发丝线）；搜索框（收藏视频还有其下的排序与管理按钮行）用 `.library-rail-tools--ruled` 以一条通到边缘的发丝线收尾（用户指定，私信页的会话工具区同样始终画这条线，不因置顶会话隐藏），之后的日期范围只画底线；侧栏内容的直接子元素有 `max-width: 100%` 上限，靠负外边距通到边缘的分区（`railSection.flat`、`--ruled`、日期范围）都要 `max-width: none`，否则右端会短一截；选中（展开）的收藏夹或订阅合集学竖屏动态卡片（用户指定）：封面从顶部展开铺满整行（`--bew-video-cover-aspect-ratio`，与操作区同一组展开动画），底部渐变进封面截断处的取色（`useImageTone` + `toned-surface`，整张卡以该色为底、文字与填充按底色取黑或白，边框为 `contentCard.media-frame`）；行以平滑圆角裁切封面（与 `overflow` 裁切同用会让渐进模糊的遮罩失效），这里只用渐变、不加渐进模糊；小缩略图随之收起。没有封面时仍用侧栏选中底色 `--bew-sidebar-selected-bg`。展开后卡片若被列表顶部或底部挡住（用户指定），展开动画结束时平滑滚到完整可见（`utils/selectionScrollAnchor.ts` 的 `revealSelectionRow`：移到最近一侧并留 space-2，比列表还高时对齐顶部；经 `scrollToPosition`，用户滚动优先，减少动态效果时直接跳到位）。卡片内的操作是一行（用户指定，不要竖排占满全宽的按钮）：“播放全部”占剩余宽度，其后是 36px 图标按钮（批量管理 / 管理合集、更多），置顶、编辑、清除失效、删除（合集为连播方式、取消收藏）收进“更多”菜单（`ContextMenu`）；批量管理时同一行换成已选数量与全选、复制、移动、取消收藏、退出图标。收藏视频排序（最近收藏 / 最多播放 / 最新投稿）用 `SettingsSegmentedControl` + `.library-rail-segments`，旁边的管理按钮 36px。管理菜单保留 hover / focus / touch 入口。
- 筛选：所有侧栏（动态、收藏、历史、稍后再看、私信）的筛选都在搜索框右端的漏斗菜单里（用户指定，以动态页为范例：`LibraryFilterMenu`，分组单选、选中即生效，有生效中的条件时漏斗提亮）：历史为时长 / 观看时间 / 设备 / 排序（最近 / 最早观看），稍后再看为进度 / 添加时间 / 时长 / 排序（最近 / 最早添加）/ 布局（列表 / 网格，开启网格布局切换时才有）（用户指定：排序与布局不再是搜索框下的一行按钮；最早优先也让漏斗提亮，布局是偏好不算条件），收藏视频为搜索范围（当前 / 全部收藏夹）与分区，订阅为订阅类型，其他收藏为搜索字段，私信为会话类型；时间组选“自定义日期”时，侧栏在搜索框下方展开平铺的 `LibraryDateRange`（`open` 驱动的测量式展开，收起后才卸载，收起时连同前面的侧栏间距一起不占空间），回到其他选项即清空日期。收藏视频的标题关键词就是搜索框里的文字（不另设关键词列表），UP 主由内容顶部的 UP 主方块栏选择（侧栏不再列出），侧栏没有筛选面板（`FavoriteFilterPanel`、`WatchLaterFilterSection` 已删除）；分区在漏斗菜单打开时才读取（按收藏夹缓存），读取中“全部分区”的勾位显示圆环（选项的 `pending`），失败时组末出现“重新读取分区”（选项的 `action`）；收藏筛选扫描（`useFavoriteFilterScan`）没有状态条与暂停按钮：每轮至少读 25 页且读到新结果才停，网格滚到底时继续读，页面隐藏时暂停、可见后恢复，失败或停滞走网格的重试。
- 横向穿透栏（`LibraryBleedStrip` + `bleedStrip.scss`，与动态页关注栏同一套样式）：放在内容最顶部，穿过侧栏玻璃伸到窗口左缘，滚轮 / 触控板弹性滚动；页面下滚时停在原位，被后面的内容盖住并淡出（`bleedStrip.bar`，后面的内容要定位以盖住它）。收藏夹为本收藏夹的 UP 主方块栏（观看历史没有顶部横向栏，日期在侧栏的日期树里，见“观看历史”），点一下即按该 UP 主筛选（再点或点“全部”清除），与漏斗菜单的分区共用同一 applied 状态。首屏加载时栏用同尺寸的骨架占位（收藏方块边长 `--bew-library-uploader-tile-size`，页面级 `PageAsyncLoading` 同此），结果到达时头图与内容不跳动；带筛选的读取不占位。
- 头图（`LibraryHero`）：左右排列（用户指定），信息在左、封面在右：卡片高度与形状同改版前（`--bew-library-hero-height` = 原封面带高 + 内距 + 两行标题），左侧信息约占 30%（不窄于 240px），封面占其余宽度、与卡片等高，左缘经横向渐进模糊（`edge="left"`）与渐变过渡进卡片，整张卡以封面左缘的颜色为底（`useImageTone` 的 `edge: 'left'`，即 `readImageBandTone` 的 `columns` 带区，取左侧 15%；封面以 `object-fit: cover` + `object-position: left` 铺满，取色处始终与信息相接），文字按底色取黑或白（`toned-surface`）。左侧信息流三页一致，由头图自己排版，页面不另设字号：可选的眉题（caption）、标题（display，最多两行）、元信息行（callout），其下是默认插槽，操作沿底部排成一行（`actions`）。观看历史没有头图（用户指定，内容区顶部直接是各时段的行）；稍后再看为标题 + 视频数 + 播放全部按钮与其后叠放的队列封面（`WatchLaterPlayAllCard` 横排）；收藏为标题 + 条目数，底部是创建者与点赞 / 收藏 / 分享（`FavoriteFolderSocial`）。头图是一排卡片（`LibraryHeroCarousel`，用户指定）：当前卡片约占内容宽的 85%（`85cqi`，容器是这一排本身），右侧露出下一张（在最后一张时改为左侧露出上一张）；这一排像横向栏一样穿过侧栏玻璃伸到窗口两侧（视口用 `--bew-bleed-strip-start` 负外边距，轨道内收回内容线），上一张在侧栏玻璃下可见；邻卡盖一层遮罩变暗（不降卡片自身不透明度，那会停掉渐进模糊）；当前卡片两侧各保持 `LIBRARY_HERO_RENDER_RADIUS`（2）张挂载（`constants/library.ts`），滑一两次进来的卡片已加载好；收藏夹封面比渲染范围多读一张、由近到远，走封面读取器独立的 `hero` 通道（与侧栏可见行的读取各自串行，排在侧栏队列里的封面被头图接走，不重复请求），不等侧栏封面或内容请求（用户指定）；横向拖动是无级的（用户指定）：触控板横向滚动与触屏横滑让这一排直接跟手移动（每帧最多写一次轨道自身的 `transform`，不改继承的变量；越过两端按 0.3 阻尼），松手（触控板停止事件 140ms，含惯性尾巴）后新卡片进来超过一半才切换，否则回弹；点露出的卡片直接滑过去；纵向滚动交给页面（`touch-action: pan-y`）。先动画后加载（用户指定）：回弹或切换都是一个登记的 WAAPI 位移动画（`holdAnimation`，只动 transform，时长按剩余距离），动画结束才发出 `select`，宿主随后才切换页面状态、请求与挂载新邻卡；拖动途中不提交、不加载。切换时卡片不重建（用户指定）：每张卡片是同一个 `LibraryHero` 实例，当前与邻卡用同一份封面、标题与计数（收藏夹封面取侧栏读到的那张），只有变化的部分重新加载并淡出淡入：卡片的操作区（`library-hero-swap` 过渡）、邻卡的遮罩（隐藏而不卸载）、收藏页的 UP 主栏与视频网格（`page-fade` 先出后入）、历史的时段行。宿主切换页面状态：收藏的卡片是侧栏列出的收藏夹（或订阅），切换走与侧栏点击相同的 `changeCategory` / `changeSeason`，侧栏选中、UP 主栏、网格与头图一起变，管理或操作中不可切换；稍后再看只有一张。加载时用同形状的 `LibraryHeroSkeleton`（当前卡片 + 露出的下一张，稍后再看一张）：页面级加载收藏与稍后再看用它；收藏在收藏夹列表读取前保留一张加载中的邻卡，邻卡封面在侧栏的封面读取器读到前显示骨架。这一排像顶部横向栏一样固定（`bleedStrip.bar` 的 `$start`）：滑到顶栏下方后停住，后面的内容（要定位）从下方盖上来，盖住期间按页面滚动时间线渐隐，只在固定之后才开始消失；宿主在 `LibraryHeroCarousel` 上经 `--library-hero-pin`（固定前要滚过的距离，即其上横向栏的高度与间距）、`--library-hero-gap`（到后面内容的距离）、`--library-hero-margin`（自身的下外距）告诉它位置，页面不得给头图另设 `position`。收藏夹用收藏夹封面（无则首个条目）承载标题、数量与创建者 / 点赞 / 收藏 / 分享；稍后再看承载标题、数量与叠放封面 + 播放全部（`WatchLaterPlayAllCard`，已从侧栏移来）。批量管理时稍后再看的头图让位。封面地址未到时宿主传 `media-pending`，封面区先用骨架占住；封面加载后淡入，看过的封面（`pictureRevealMemory`）直接显示。稍后再看筛选无结果时“没有匹配”显示在头图下方，不替换整页。头图的进出用 `<Transition name="library-hero" :duration="300">`：只淡化各层（表面颜色、阴影、描边、图片、文字、模糊层自身），不淡化头图或表面本身（祖先降不透明度会让模糊失效）。
- 观看历史（用户指定）：按设置 `historyGroupInterval`（每小时 / 每时段 / 每天，默认每天；时段从 04:00 起算，用户指定：04–12 上午时段、12–20 下午时段、20–次日 04 午夜时段，凌晨 0–4 点归前一天的午夜时段；时段标题与日期树都显示名称，每小时显示 `08:00–09:00`）分组，`historyGroups.ts` 的 `createHistoryGroupIndex` 是唯一分组实现。每组是 `HistoryGroupRow.vue`：现有时间风格的标题（`HistoryDayToggle`，日期加时段，可折叠，测量式展开）下一条横向滚动栏（`LibraryBleedStrip`，穿过侧栏玻璃），卡片直接用共享 `VideoCard`，宽度等于自适应视频网格的一列（`getAdaptiveGridColumnCount`，`--history-card-width`）；观看时间、类型与进度写在卡片日期位置（`capsuleText`），看过的进度线经 `VideoCard` 的 `coverBottom` 插槽画在封面底边。卡片上没有删除按钮，“从观看历史中删除”在卡片统一右键菜单里（`getMenuExtraGroups`）。纵向按组窗口化（`useCardWindow`，一组一行），行间距 48px（`--bew-space-12`，用户指定：行间的空白是滚轮滚动页面而不是横向栏的区域）；没有头图，内容顶部也没有日期栏；点侧栏日期树里的某天或某个时段即让下方列表从该处开始（`selectStartGroup` / `shownGroups`，只在最新优先、无搜索无筛选时生效，当前起点所在行铺 `--bew-sidebar-selected-bg`），点第一项回到完整列表；加载占位是同样的行（`HistoryGroupSkeleton.vue`，页面级加载同此）；切换间隔不重新请求，整组行淡出淡入。原列表 / 网格布局（`historyLayout`）已退役。分组按钮与日期树在侧栏最后一块（`railSection.flat($bottom: false)`，上方一条通到边缘的发丝线），读到更多日期只让侧栏末尾变长、不推动其上的操作。分组按钮是一棵树的根（用户指定，仿 Claude 桌面应用侧栏里主会话下的子会话）：常态显示“分组：每天”，点击后只显示“分组：”，其下一级缩进换成三个间隔选项（每小时 / 每时段 / 每天，当前项铺 `--bew-sidebar-selected-bg`），选一项或再点按钮（Esc 同样）回到日期；批量管理的操作区切换淡入淡出。日期树（`HistoryDayNode.vue`）：已载入的日期（今天 / 昨天 / 日期）是一级缩进，每天下面二级缩进列出该日按当前间隔分出的时段（text-2、等宽数字）；间隔为每天时没有时段，也没有箭头。每级缩进左侧一条分支线（`historyTree.scss` 的 `branches`，宽 `--bew-tree-line-width` 即两倍发丝线、`--bew-edge-color`）从父级垂直向下，在已载入的最后一个子项处以圆角拐向它、停在行前不接触；一级的线在分组按钮图标正下方，二级的线在日期文字右侧 4px。有时段的日期行右端是向下的 `ChevronIcon`（收起时转向右），点它折叠或展开该日的时段（`useMeasuredDisclosure`，默认展开，折叠状态按页面视图状态保存）；点日期行本身让列表从该日第一组开始。后续分页读到的新日期以测量式展开从 0 长到自身高度（`useMeasuredDisclosure`，经 `holdMotion` 登记，减少动态效果时直接出现），长完后不再跟踪高度；已有日期新增的时段由该日的折叠区同样平滑变长；首次显示、重新挂载与从间隔选项回到日期时，已有的日期不播放。
- 封面不叠文字：历史与稍后再看的时长、进度时间与“直播 / 番剧”标签都移到信息区文字里，封面上只保留底边的进度线。
- 动画：历史与稍后再看沿用 `useLayoutMotion`；收藏网格经 `VideoCardGrid` 的 `layout-motion`（按数据键而不是虚拟窗口触发，滚动不测量）在取消收藏、移动与排序时让剩余卡片平滑补位。
- 稍后再看以 `topBarStore` 的完整 `aid` 集合为唯一成员状态，其他组件不各自维护真值；修改后经专用失效消息跨标签重新获取。
- 单项移出稍后再看与取消收藏按下即删（粒子飘散后补位，见“动效”），成员、计数与批量选择属于原数据 owner；写入失败时卡片恢复并提示。批量操作与清空仍先确认。

### 动态页

- 五类筛选（全部 / 视频投稿 / 图文动态 / 追番追剧 / 专栏）、个人资料、发布入口、直播列表整合在 `LibraryWorkspace` 侧栏，分类用滚筒；三个模块受原设置控制，但窄窗口或关闭模块不隐藏分类导航。右侧是关注用户栏与动态流，按实际内容宽度算列数。
- 侧栏滚筒下方是共享搜索框 `LibrarySearchField`（用户指定）：回车或搜索按钮应用关键词，搜索框右端的筛选图标打开共享的 `LibraryFilterMenu`（基于 `ContextMenu`），分“类型”（全部 / 原创 / 转发 / 视频 / 图文 / 直播 / 专栏；内容类型按动态本身判断，转发只算“转发”，视频含番剧，图文是不属于其他类型的原创动态）与“时间”（全部 / 一天 / 一周 / 一个月 / 一年内）两组单选（`ContextMenuOption.section` 给分组加标题），选中即生效。动态接口没有关键词与时间查询，搜索是本地筛选：`momentSearch.ts` 的 `matchesMomentSearch` 与设置里的内容过滤同在 `passesMomentSettings`，改动后从已读缓存重新筛选，继续按筛选流扫描后续页；时间范围外的页（流按时间倒序）即结束分页。搜索对各分类与 UP 主筛选都生效，按账号隔离，无结果时显示“没有找到符合条件的动态”。已读缓存里没有符合条件的动态时继续读后续页；搜索的首屏与“已有结果全被筛掉、继续往后读”时只在中间显示圆环（不放骨架），流的尾部只有圆环，闭合后才显示“没有更多动态了”。
- 个人资料与正在直播没有卡片底板，直接放在侧栏玻璃上（用户指定）：文字与头像从侧栏内容线（`--bew-sidebar-label-inset`）开始、左对齐（统计数字也左对齐），右端的图标与计数（直播图标、直播人数、发布入口的外链图标）离右缘同样距离。个人资料上下各一条 `--bew-separator-color` 发丝线，左右通到侧栏两侧边缘（负外边距抵消侧栏内距 `--bew-sidebar-inline-padding`，内容再内收回内容线）。头像（资料与直播）用 `contentCard.media-frame` 的媒体细描边。直播行右侧只是图标，没有圆形底。直播预览圆角比视频封面小一级（`--bew-thumb-radius` + 平滑圆角），边框用视频封面的媒体细描边（`contentCard.media-frame`，不带阴影：展开动画的裁切会切掉它）；所有行的直播图标同为 text-1，列表不加遮罩（见“材质与玻璃”的滚动边缘例外）。预览加载中只显示统一的半透明黑色蒙版（`--bew-cover-scrim`）加中间的 `LoadingRing`（用户指定）：`MomentVideoPreview` 在拿到直播流地址之前就挂载，由它的同一层蒙版与圆环覆盖整个加载过程，预览框自身透明，不另放占位圆环、底色或渐变。
- 热搜复用 `searchExperience` 的请求、缓存与可见性生命周期，不另建轮询：宽窗口位于关注用户栏下方，随页面滚到距顶栏 space-4 时吸顶（卡片标题固定、内部列表滚动），过窄时改为动态流上方的紧凑区域。
- “图文动态”没有服务端类型：`momentFeedTypes.ts` 让它请求 `type=all`，按筛选批次扫描（每批两页），在 `momentFeedReader` 里只保留 `DYNAMIC_TYPE_WORD`（纯文字）与 `DYNAMIC_TYPE_DRAW`（图片，可带文字）；转发、视频、直播、合集、专栏都不显示，原始页仍用于记录 UP 主最新视频时间。按 UP 主筛选时同样适用。
- 关注用户栏（含“全部动态”）没有容器、边缘按钮或渐变模糊，放在 `MomentsContentLayout` 之前（热搜随之在它下方，也不在容器查询的层叠上下文里）：头像是与视频卡片最小封面等高的正方形（`--bew-moments-up-tile-size`，`--bew-media-radius` + `contentCard.media-frame`），用户名与头像左对齐，hover 用视频卡片同款放大（`contentCard.bare`），首块对齐内容线；滚动层向左伸到窗口左缘（`--library-content-inline-padding` 与侧栏宽度推算），往左滑时从侧栏毛玻璃下方经过、被它遮蔽（留在页面层，不设 z-index），向右伸出内容边界，末端停在右上角头像右缘（右内距 = 内容内距）。滚轮与触控板由 `utils/elasticScroll.ts` 接管（纵向滚轮也横滑），两端橡皮筋拉伸、停顿后回弹（登记动效优先级，减少动态效果时直接复位）；触摸与键盘仍是原生滚动。左右滚动按钮的代码保留但不渲染（`SHOW_UP_LIST_ARROWS`），等新外观。向下滚动时栏不随页面上移（用户指定）：`position: sticky` 停在原位（内容区顶部内距），动态流（容器查询自带层叠上下文、在 DOM 中更靠后）向上盖过它；静止时动态流在名字下方 space-8 处开始（`--moments-up-list-gap`，给悬停放大与阴影留空间；栏用 `display: flow-root`，滚动层的 -16px 上外距不得穿透折叠，否则 sticky 会把整栏下推 16px 压到动态流上；页面级加载骨架 `PageAsyncLoading` 的栏位高度与间距相同）；从卡片碰到栏底边（滚过该间距）到盖到栏顶边，栏随页面滚动时间线 `--bew-page-scroll` 逐渐淡出，完全盖住时 `visibility: hidden` 不再接收指针（栏高由磁贴、间距与一行名字的 token 算出，`--moments-up-list-height`）；不支持滚动时间线时只被卡片盖住。栏的横向滚动位置存在按账号隔离的页面视图状态（`upListScrollLeft`），重新挂载后在行足够长（或加载完成后按行尾截取）时恢复。
- 骨架（`MomentCardSkeleton` 的 `variant`）跟随卡片：video 16:9 封面、image 单图 4:3、gallery 方图加缩略图条（48px 方块、细线、`--bew-interactive-radius` 收宽条）、text 无图；图片贴顶铺满、底部同样渐变到 `--bew-elevated-over-page`，卡片不透明、无分割线，宽卡单图 / 封面占左列。各筛选的混排由 `MomentCard/utils.ts` 的 `getMomentSkeletonVariant` 统一决定（全部：视频、多图、文字、单图轮换；视频与追番：封面；图文：多图、文字、单图；专栏：单图），动态页与页面级加载（`PageAsyncLoading`）共用。
- 长文“展开 / 收起”按钮让正文高度在截断高度与全文高度之间以 200ms 标准曲线过渡（Web Animations，`holdAnimation` 登记，中途再点从当前绘制高度反向；收起动画结束才恢复行数截断），期间与评论展开一样通知瀑布流暂停中间高度，结束后提交最终高度。
- 评论 / 转发展开共用 `useMeasuredDisclosure` 与 `momentDisclosure.scss`：内层保持自然布局，只有外层裁切高度按 200ms 标准曲线变化（不用过冲曲线、0fr 挤压或磨砂祖先淡入）；内容迟到时平滑重定目标，缓存的初始展开不重播。展开期间用既有交互保活保留卡片，瀑布流跳过中间高度的虚拟窗口提交，结束后提交最终高度。

### 设置页

- 当前设置结构以 `src/logic/storage.ts` 默认值为准。视觉设置搜索目录与四套 locale 与实际入口同步，共享文案（如 `common.close`）不改回硬编码。
- 通用页分“常规 / APP 授权 / 设置数据”；授权入口不依赖推荐模式，云同步、导入、导出与重置在设置数据。设置搜索按 `data-setting-id` 定位，沿用布局编辑描述的 ID；条件子项提供稳定的父控件目标，不在搜索时修改用户设置。外观页的“高级”分组默认收起（用户指定），搜索命中其中的项时自动展开；关于页的许可是两行设置项（项目协议、第三方依赖许可），各带一个“查看”按钮打开对话框。
- 窗口结构（用户指定，仿 Claude Code 设置）：一个实色窗口（`.settings-window__surface` 与顶栏用 `modalWindow.scss`，与其他弹窗一致；没有毛玻璃、没有顶部模糊或内容遮罩），用 `--bew-separator-color` 发丝线分成区域：顶栏横跨全宽，标题是到当前页面的路径“设置 › 分类 › 页面”（用户指定；当前一级用 text-1，前面的用 text-2，过长时各级右端渐隐；页面一级由 `SettingsCategoryLayout` 经注入的 `setSettingsPageTitle` 按分类上报并记住，切换页面只原位换字、回到打开过的分类立即完整显示，只有页面一级出现或消失时淡入淡出），右端是关闭；其下依次是一级分类栏、竖线、二级页面栏、竖线、页面内容，各自独立滚动。搜索框固定在一级分类栏顶部（用户指定），图标与各行图标对齐，结果浮层从搜索框左缘向右展开；分类列表在它下面单独滚动。两栏导航共用 `styles/settingsNav.scss`（`column` / `row` / `group-label`）：平铺在窗口表面，行常态透明，悬停 `--bew-hover-bg`，当前项 `--bew-selected-bg` 且图标提亮到 text-1，不用主题色；分类之间用间距分组，不画线。二级页面栏由 `SettingsCategoryLayout` 渲染，在内容滚动层里 sticky 并与之等高（滚动层是 size 容器，`100cqh`），随分类切换一起淡出淡入；没有子页面的分类（视觉风格、关于）内容占满两栏。页面顶部是 `SettingsSectionHeading` 的标题（heading 字号，不带说明），分组（`SettingsItemGroup`）是平铺的段落：subheading 标题、发丝线分隔的行、组间 32px，没有卡片底色或边框。窄窗口按窗口容器宽度变化：≤820px 一级栏只剩图标，搜索框也收成图标，使用时在原位展开到 240px 并盖住相邻一栏（仍在分类栏的流里，下面的行不移动）；内容区 ≤520px 时二级页面改为内容上方换行排列。没有面包屑。
- 内存节省相关项集中在“通用 → 内存节省”，各自保留原 key。
- 播放设置集中在“播放 → 布局 / 控件 / 播放行为”，复用原有页面模块。明确的播完暂停和单集循环优先于自定义顺序；单视频只保留一个连播推荐选项。自定义顺序关闭或不适用时由原生结束策略处理，暂停事件不当作播放完成。
- 搜索入口形态、打开方式和结果行为集中在“Bewly 页面 → 搜索”；稍后再看布局与观看历史分组间隔在“列表与布局”。消息页同时呈现本地角标与 B 站接收规则，后者继续独立读写服务端。普通卡片与动态预览保留独立配置，标题明确作用范围。毛玻璃 UI 正向表达，底层仍只有 `disableFrostedGlass`。

## 运行时与数据

- 几何：同一滚动所有者每帧测一次并合并分发；滚动帧只读 IntersectionObserver 预载状态，提交、恢复和尺寸变化后补查一次。
- 分页：只在成功响应后推进，异步响应按局部 generation 隔离；尾页先消费数据再结束；游标未推进是 `paginationStalled`（停止自动请求），不是“没有更多”。动态页例外：进度只由 `momentFeedReader` 按原始页判断（页面不再用筛选后的卡片复判，否则被筛掉的整页会被误当停滞），出现未见过的动态即算推进（全站、UP 主、追番追剧、图文都一样；UP 主与追番的 offset 可能为空或不变，UP 主还按页码翻页），空页或重复页即判定为已全部加载，与服务端 `has_more=false` 同样结束：动态流底部正中显示“没有更多动态了”（`moments.no_more`，无动态时显示空状态文字），不出现“加载更多”或“重新加载”按钮；只有请求失败才有重试按钮。动态一律自动加载，标签页重新可见、恢复的列表与删除卡片后都会补查一次是否需要继续加载。恢复位置用 `scrollIntent` 的位置声明，显式跳转与用户滚动优先。
- 列表数据：推荐与动态的已接受列表是唯一可写真值（`useHomeTabState` / `usePageViewState` 的 `shallowRef`，替换根的不可变更新；首页各标签与搜索结果同此）。收藏内容与观看历史长列表用 `shallowReactive`、行对象整体替换；收藏夹目录因原位编辑保持深响应式。去重索引与广告可见投影由 `recommendationFeed.ts` 按批维护；行高与列总高经 `CardRowMetrics.append/truncate`、`momentColumnIndex` 增量维护。停放缓存按条目估算预算，先收缩可重建字段再整体淘汰，列表、游标与锚点成对保留。
- 媒体：图片队列按几何版本复用优先级并为可见图片留槽位；HLS `recoverMediaError` 每实例有界，稳定播放后恢复预算；全屏监听经 `fullscreenChange.ts` 由实际持有媒体元素的预览订阅。评论树分 topology / content / geometry 更新，深链只协调目标线程。原生工具栏与播放页会话先有界发现，再只观察已挂载宿主与浅层祖先。
- 账号隔离：推荐、动态、关注等的缓存、分页与本地状态按 MID 隔离（未登录单独一份），换号后旧请求失效、旧响应不写入。
- 消息投递：扩展消息统一经 `src/utils/messaging.ts`。共享状态经 `background/stateConsumers.ts` 只投递给实际使用该主题、仍在展示的同隐私上下文文档；隐藏页面只标记 stale，恢复后对账一次；不对所有标签页广播。broker 按记录持久化与串行。
- 扩展失效：重载后的旧 content script 把 context invalidated、端口关闭、接收端缺失视为终止状态，停止轮询（TopBar 刷新批次交给共享协调器统一停止）。Shadow DOM 主样式就绪前插件容器保持隐藏，加载失败就卸载容器，不暴露无样式的 UI。
- 设置存储：本地捕获逐字段比较并只克隆变化分支；规范化按依赖字段决定是否复用，canonical 应用、导入和重置时完整执行。存储初读失败不当作空存储回写默认值。Cloud Sync 保留 pending / quota blocked / failed / synced 语义与有上限退避；MV3 App Auth 用 `browser.alarms` 保持 token 新鲜。
- 样式：内容样式只编译一次，由 `scripts/contentStyleSplit.ts` 拆成宿主 `style.css` 与 Shadow 副本。默认模式下保留字体、主题与原生页适配所需的内部样式注入。
- 页面专属 CSS（`adaptedStyles/pages/*`）以 `?inline` 文本按路由注入单个 `<style data-bewly-route-style>`，放在文档最前（原生样式仍赢同优先级），不进 manifest 样式与 Shadow 副本；原生子站入口用 `selectNativeSiteCss` 只注入当前站点的 `nativeSites` 规则。新增页面样式照此接入，不 `import` 进全局入口。
- 样式重算（细节见 [2026-10-22 样式重算](docs/maintenance/2026-10-22-style-recalc.md)）：常驻样式（manifest 两份、Shadow 副本、播放页注入 CSS）不在主体以外的位置写 `[class*=…]` 等类名属性选择器，主体只是 `picture` / `img` 时除外，由 `pnpm verify:style-invalidation` 约束；需要按 CSS Module 祖先限定时，由 JS 给祖先打 data 属性（如 `data-bewly-action-animation`）。运行时不在 `body`、`html` 或大容器上改继承的自定义属性：显隐类状态直接写各表面的属性值，只被一个元素读的尺寸写在读取者上并以 `@property … inherits: false` 注册，Shadow DOM 内改用内联样式。高频事件里先读完几何再写状态。
- 路由：站内导航只用 `useRouteState.ts` 单例（pushstate / replacestate / popstate / hashchange + 一个低频 fallback）。
- 快捷键：不注册 Bewly 全局键盘监听（会与原站冲突）；Dialog、Drawer、图片查看器、菜单与输入控件的局部键盘交互保留。
- URL：`src/utils/bilibiliUrl.ts` 是当前页与分享链接的统一净化来源，保留 `p`、`t`、hash 等语义。

## 上游同步

远端：`origin`（STERILITZIA02/Bewly_Nocturne，Nocturne 开发与发布）、`upstream`（keleus/BewlyCat，只读，永不推送）、`contrib`（STERILITZIA02/BewlyCat，贡献给上游的修复）。流程细节见 [upstream-workflow.md](docs/maintenance/upstream-workflow.md)。

- 可独立贡献的修复：从 `upstream/main` 建 `fix/*`，只推 `contrib`，PR 只含最小修复（不带 Nocturne 的 `AGENTS.md`、品牌 README、维护文档、产物或无关格式化）。
- 移回 Nocturne：从 `origin/main` 建 `port/*`，`git cherry-pick -x <sha>`，不 merge 整个 `fix/*`。
- 同步上游：从 `origin/main` 建 `sync/*`，`git merge --no-ff upstream/main`，不在 `main` 直接 merge。逐块解决冲突，以本文件的产品规则为保护基线；语义不明的 UI 冲突列出差异请用户决定，不整文件选 ours/theirs。

## 已移除，不要恢复

各页面自写的图片查看器（动态页 `moment-image-viewer`、私信 `PrivateMessageImageViewer.vue`、原生详情页 `bewly-opus-viewer`）与只转发参数的 `Picture.vue`；背景图片 / 壁纸；用户自定义样式及其编辑器与注入；液态玻璃全套；Bewly 全局播放器 / 页面快捷键（`src/utils/keyboard.ts`、`shortcuts.ts`）；Bilibili Evolved 兼容；`BewlyOrBiliTopBarSwitcher.vue` 与搜索框下方悬浮切换器；Dock 与 Logo 发光设置；图片隐藏开关；popup / options 入口与 `build:web`、`dev:web`；`enableLiquidSegmentIndicator` 可见设置；播放页 `layoutPriority`、`centerVideo`、`sidebarWidth`、边缘展开与拖动调宽；Dock 左侧位置；Notifications 内的消息设置分类；观看历史的列表 / 网格布局（`historyLayout`）；旧 `videoCardLayout`；`enableFrostedGlass`、`enableTopBarGradient`、`alwaysUseTransparentTopBar`；OLED 纯黑与深色色调（`enableOledDarkMode`、`enableDarkModeTint`、`darkModeBaseColor`、`oled-dark` class、`--bew-dark-base-color`）；只对 LV6 生效的 `hideTopBarUserPanelLv6LastLoginLocation`（已由全等级的 `hideTopBarUserPanelLastLogin` 取代）；顶栏渐进模糊与雾色层；搜索框聚焦变形与全屏模糊遮罩（`SearchFocusOverlay`、`disableSearchFocusEffect`）；实验性液态玻璃材质（`liquidGlassMaterial`、`utils/liquidGlass.ts`、`.liquid-glass` 与几何滤镜 token）；首页沉浸式推荐 / 沉浸流（`ImmersiveFeed.vue`、`ImmersiveVideoFrame.vue`、`ImmersivePlaybackRail.vue`、`contentScripts/immersiveFrame.ts`、`utils/immersivePlayback.ts`、`utils/immersiveRecommendation.ts`、`utils/iframeActivity.ts`、`constants/immersive.ts`、播放页右栏的“推荐”标签，以及 `showImmersiveModeEntry`、`immersiveWheelSwitch`、`immersiveKeyboardSwitch`、`immersiveAutoPlay`、`immersiveAutoNext`、`immersivePreloadNext`）。相关旧字段只在 `RETIRED_SETTINGS_FIELDS` 中清理。
