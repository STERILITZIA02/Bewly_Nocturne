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
- `src/manifest.ts`、`src/_locales/`（四套 locale 与设置搜索目录 `searchCatalog.ts` 随入口同步）
- 主 UI 跑在 Shadow DOM 内，注意样式隔离

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
| 分段控件与滚筒 | `segmentControl.scss` + `LiquidSegmentIndicator.vue`、`WheelSelector.vue` |
| 加载反馈 | `SkeletonBlock.vue`、`LoadingRing.vue`、`useLoadingRingPhase` |
| 输入框 | `composer.scss`、`useComposerPicker`、`MomentReplyComposer.vue`、`sendButton.scss` |
| 卡片与网格 | `contentCard.scss`、`useCardWindow`、`useGridLayout`、`WindowedMasonryGrid.vue`、`cardRowMetrics.ts` |
| 侧栏页面 | `LibraryWorkspace.vue`、`LibrarySearchField.vue`、`LibrarySidebarHeading.vue`、`sidebarAction.scss` |
| 滚动边缘渐隐 | `scrollEdgeFade.scss` |
| 按钮与弹窗 | `IconButton`、`CloseButton`、`TagRemoveButton`、`Dialog`、`ConfirmDialog` / `useConfirmDialog`、`ContextMenu` |
| 列表视图状态 | `useHomeTabState`、`usePageViewState` |
| 图片 | `imageLoadQueue.ts`、`LazyPicture.vue` |
| 扩展消息与共享状态 | `utils/messaging.ts`、`background/stateConsumers.ts` |
| MAIN ↔ ISOLATED 页面桥 | `utils/pageBridgeChannel.ts`、`constants/pageBridge.ts` |
| 路由 | `useRouteState.ts` |
| 账号隔离与取消 | `utils/accountScope.ts`、`utils/abort.ts` |
| 链接净化 | `utils/bilibiliUrl.ts` |

## 设计系统

### Token

- 全局视觉 token 在 `src/styles/variables.scss`，组件不重复定义同义的尺寸、字号、字重或颜色。
- 通用控件 token 用 `--bew-control-*` / `--bew-segment-*`；只属于 TopBar 的才用 `--bew-top-bar-*`。
- JS 读 CSS 动效时长用 `utils/motionTiming.ts` 的 `getMotionDuration`（压缩会把 `300ms` 写成 `.3s`）。滑块与滚筒的移动时长用 `getTravelDuration`：一格 300ms，距离越远越长（次线性），不写死。

### 排版

- 整个扩展的文字层级、字号与对比度按 macOS 原生应用校准（用户指定）。默认角色为 caption `11/14`、callout `12/15`、control / body / title `13/16`、subheading `15/20`、heading `17/22`、display `22/26`，大号数据用 26px；统一使用 `--bew-font-size-*` / `--bew-line-height-*`。字号与行高都是 `Npx × --bew-font-scale`：启动时 `utils/browserFontScale.ts` 优先取浏览器暴露的 `env(preferred-text-scale)`，没有有效的非默认系统比例时取浏览器默认字号 / 16，不把两者相乘；只在不等于 1 时写到宿主与 html。JS 需要像素值时读元素的计算 `font-size`，不要读 token 字符串。视频卡片字号设置 xs/sm/base/lg 对应 caption/control/title/subheading，不用 Tailwind `text-*`。不新增无语义的 px/rem 字号，需要时先扩 token。
- 字重只用 400/500/600/700 的 `--bew-font-weight-*`。层级同时靠字号、字重与前景明暗表达：页面 / 区块标题用 600（`--bew-heading-weight` / `--bew-subheading-weight`），分组标签、人名、徽标、滚筒用 500；正文、视频卡片标题与控件文字用 400（`--bew-control-label-weight`）；内联 strong 与关键数字 600，700 留给品牌字标。同组控件选中与未选中字重相同。
- 共享文字类：`.bew-page-heading`、`.bew-subheading`、`.bew-section-label`、`.bew-ui-label`、`.bew-help`。标题、正文与字段标签用 text-1，分组和次要信息用 text-2，辅助说明用 text-3，禁用与占位用 text-4；辅助说明使用 callout 字号。文字对比从同一中性前景派生，浅色次要 / 辅助为 70% / 64%，深色与 OLED 为 70% / 60%；`prefers-contrast: more` 自动提高到 88% / 76%。设置分组内容按 `--bew-settings-level-indent` 每级内缩 8px。
- 字体栈 `--bew-fonts-ui` 优先 `system-ui`，启用光学字号，禁止合成粗体或指定 SF 的字体文件名。默认模式下原生页保留原站字体，推荐 / 自定义模式沿用既有覆盖。正文用比例数字，计数、时间、进度、统计用 tabular-nums；中文不加字距。
- 同组标签选中与未选中字重相同，靠颜色、背景和指示器区分。
- 圆形或胶囊里的数字（封面排名、`CountBadge`、序号）用 `main.scss` 的 `.bew-centered-numeral`，数字包在 `<span>` 里。

### 图标

- 功能图标统一 UnoCSS `i-tabler:*`（线性 1.75px），激活态用该族实际存在的 filled 版本或同一线性图形。`@iconify/vue` 只留给 Dock / SideBar 的明暗切换按钮和无 UnoCSS 的专栏 iframe 图库（描边统一为 1.75，由 `verify:ui-icons` 约束）。
- 图标尺寸 `--bew-icon-size-xs/sm/md/lg/xl`：caption 旁用 xs（14px），control 旁用 sm（16px）；Dock 右侧按钮与导航图标 20px。
- “全 Bewly”页面模式用品牌标志 `src/assets/branding/bewly-mark.svg`（`.bew-mark-icon`），“自定义”用 Tabler `adjustments-horizontal`，同步 UnoCSS safelist。
- 用户指定的 `ChevronIcon` 2.5px 描边保留，不被全局 SVG 规则覆盖；品牌、内容图形和发送 / 加载专用状态图形保留。

### 间距

- 4px 网格，`--bew-space-*`：4/8/12/16/20/24/32/40/48。2px 只用于边框、焦点环和光学微调（例外见分段轨道与 Dock 内距）。
- 紧密内联 4、控件内部与紧凑列表 8、关联元素组 12、组件与栏位之间 16–24、页面区块之间 32–48。同层级卡片、列表、工具栏用相同 gap；需要 3/5/7/10/14/18 这类一次性值时写注释说明原因。
- 公共间距用容器 padding 和 gap，不用子元素 margin 拼。

### 圆角

- `--bew-radius-sm/half/md/lg/xl/2xl/full` = 4/6/8/12/16/24/full。优先语义 token：`--bew-card-radius`、`--bew-media-radius`、`--bew-panel-radius`、`--bew-modal-radius`、`--bew-popover-radius`、`--bew-interactive-radius`、`--bew-badge-radius`。卡片 12、内部按钮与菜单项 8、小状态块与骨架条 4–6、头像 50%。
- 平滑圆角：普通圆角矩形用 `--bew-corner-shape: superellipse(1.7)`（保留 `border-radius` 回退，组件里不写别的数值）；真实圆形与完整胶囊用 `--bew-corner-shape-round`（头像、圆形按钮、关闭按钮、Switch、主 Dock）。
- 同一容器四角来自同一 token；局部直角只用于明确的拼接结构。子元素共享裁切轮廓时用 `inherit`，不用 `calc(父圆角 - 任意像素)` 猜。
- 卡片与封面角落里的控件（动态卡片稍后再看、三点菜单、删除）用平滑圆角矩形：离角内距小于父圆角时取同心值（父圆角减内距，下限 `--bew-radius-sm`，见 `--bew-card-media-action-radius`），否则用 `--bew-interactive-radius`。
- 胶囊与面板之间做动画时，起点用胶囊的真实几何半径，不从 `--bew-radius-full` 插值。
- 视频封面由最外层媒体容器唯一裁切，图片、预览、骨架、遮罩继承同一圆角，悬停预览前后不跳角、不露底、无双边框。

### 颜色

- 深色默认为无色调中性灰。`enableDarkModeTint` 默认关闭，关闭时保留 `darkModeBaseColor`；所有主题入口经 `resolveDarkModeBaseColor` 取值。深色网页底色由 `--bew-dark-base-color` 在 OKLCH 中约束明度与色度派生为 `--bew-dark-page-bg`，不用简单混黑。
- 主题色只用于：主操作按钮、当前位置圆点、开关与进度、未读圆点、链接和关键词、Logo、文本选区。选中面、普通徽标、导航文字、装饰和编辑反馈用中性色。
- 共享状态色 `--bew-selected-bg` / `--bew-hover-bg` / `--bew-pressed-bg`；`--bew-theme-surface*` 只是中性兼容别名。主按钮用 `--bew-accent-solid` / `--bew-on-accent-solid`，保持用户选择的原色，亮色主题配深色文字，不压暗或混色换白字。链接与关键词用对比度校正的 `--bew-theme-foreground`，小圆点用 `--bew-accent-marker`。`--bew-on-theme-color` 按主题色亮度选黑白，并同步到 document 根节点和 `#bewly` 宿主。
- 主题色设置 `themeColor` 是十六进制色或 `NEUTRAL_THEME_COLOR`（“无主题色”，设置里与预设并列）：无主题色时 `--bew-theme-color` 及派生值浅色取黑、深色取白，`--bew-on-theme-color` 随之取反。所有 token 由 `utils/themeColor.ts` 的 `getThemeColorTokens` 计算、`applyThemeColorTokens` 统一写入，不另加开关。品牌标志的彩色强调用 `--bew-brand-accent`（有主题色时等于主题色，无主题色时为 `--bew-bili-pink`）。
- 自定义主题色须与纯白、纯黑页面都保持至少 1.8:1 对比度（`THEME_COLOR_MIN_PAGE_CONTRAST`，最低的预设 `#fda4af` 为 1.89:1）：`clampThemeColor` 保持 OKLCH 色相、只移动明度（必要时降色度进 sRGB）；颜色选择器输入与存储规范化（`normalizeThemeColor`）都经它钳制，`verify:color-policy` 约束预设在范围内。
- 表面从同一中性色对按用途派生：内容轻抬、独立浮层分离、输入内嵌，不按等差亮度逐层抬高；浅色、深色、OLED 分别校准。
- 灰、黑、白的半透明或实色不受主题色限制。玻璃自身色调和既有装饰渐变不用于表达控件状态。暗色主题色渐变由 `useLinearGradientThemeColorBackground` 统一控制页面与顶栏。
- OLED：`enableOledDarkMode` 只在有效深色主题下通过 `oled-dark` class 把 `--bew-bg`、`--bew-homepage-bg` 和插件 viewport 底层设为 `#000`，同步到相关 iframe；卡片、面板、输入框仍用各自层级。不覆盖 Bilibili `body`、滚动层或布局容器。播放页 URL（含视频抽屉 iframe）暂不启用纯黑（`useDark` 的 `isOledDark` 为 false），等用户补充设计后再移除此例外。
- 边框：`--bew-border-color`（普通分隔线）、`--bew-surface-border-color`（表面）与输入框边框，浅色为前景 14% / 16% / 18% / 20.5%，深色与 OLED 在 `:root.dark` 为 12% / 12% / 16% / 20%，均在 11.5–20.5% 内（`scripts/serve-border-preview.mjs`）。浅色 `--bew-shadow-1..4` 各带一层 1–2px 贴边接触阴影，深色阴影不变。
- 数据图表（lieflat-charts 风格）：不透明 Mono 灰阶、刻度与细线，复用 `--bew-chart-*`、`dataChart.scss`、`ChartRungs.vue`，主题色只点亮当前读数或编辑点。投票每刻度 1%，保留小数末刻度、多选独立分母与零值无数据标记；通知柱用共同单位、标记总数有界，未知值不当零。不引入模板字体、图表 CDN 或演示数据。

### 材质与玻璃

- 毛玻璃默认开启，服从全局模糊强度。`disableFrostedGlass` 是唯一开关，开启后同时关闭毛玻璃与普通顶栏渐变并改用实色 token；不恢复 `enableFrostedGlass`、`enableTopBarGradient`、`alwaysUseTransparentTopBar` 等旧状态。
- 玻璃之上不再叠玻璃：玻璃内的文本、按钮、选项、搜索框、菜单用实色或无滤镜表面，实色背景不加 backdrop-filter，也不用低模糊代替移除。只有延伸到原玻璃边界之外的覆盖层才可有独立玻璃（Teleport 本身不算理由）。嵌套判断用 `useGlassPanelMotion.ts` 的 `GLASS_SURFACE_CONTEXT`。唯一额外例外：`CountBadge.vue` 的未读胶囊可叠在 Dock 与顶栏玻璃上（复用全局滤镜与实色降级）。
- 普通毛玻璃（`--bew-filter-glass-1` + 边框 + 阴影）用于：Dock、播放页底部控制栏、独立搜索框、顶栏浮层、侧栏按钮、私信导航、设置窗口、外侧纵向导航、普通 Dialog。设置内的输入框、内嵌菜单和嵌套 Dialog 用实色。
- 液态玻璃已完整移除：没有 SVG 位移 / 色散 / 折射层、`vLiquidGlass`、`LiquidGlassSurface.vue`、“悬浮表面材质”设置或 `@wxperia/liquid-glass-vue`，不恢复。`enableDockLiquidGlass`、`dockLiquidGlass*` 只在退役字段表中。`LiquidSegmentIndicator` 是纯几何滑块（实色选中表面，不采样背景），不受影响。
- 渐变模糊只用 `ProgressiveBlur.vue`（`utils/progressiveBlur.ts`）：五层 backdrop 模糊半径逐层翻倍、遮罩窗口逐层向强端收缩，强度默认取 `--bew-glass-blur-radius`（随全局模糊强度，关闭毛玻璃时不渲染），淡入淡出用组件的 `visible`（祖先降不透明度会让模糊失效）。它不能放在 backdrop root 里（祖先有 `backdrop-filter` / `filter` / `mask`）：那样各层只看得到祖先自身的绘制、看不到后面的页面，带区会显出矩形；宿主是玻璃时把玻璃移到背景层（如 `.context-menu-container::before`、`.settings-content__surface`），渐变层祖先也不能同时使用平滑圆角与 `overflow: hidden/clip/auto/scroll`：Chromium 会丢弃子层的渐变遮罩，绘成矩形带；让背景、滚动列表与各模糊层各自裁切，保留平滑圆角。开发构建会检查 backdrop root（含透明度、clip-path、混合与 will-change）及这种圆角裁切并在控制台警告；所有调用方都用组件，不直接调用层生成函数或淡化整组祖先。不给渐变模糊加饱和度，叠在玻璃上会给带区染色。禁止单层 `backdrop-filter` 配渐变 / 径向遮罩：那只是清晰图和定强模糊图按比例混合，会留下矩形或椭圆边界。`pnpm verify:style-invalidation` 用 `scripts/maskedBlurPolicy.ts` 扫描所有样式（按元素合并 BEM 修饰类与伪元素）和内联 `backdropFilter` + `maskImage`，只放行该组件的层。
- 保留的模糊：设置窗口的 `PanelTopBlur.vue`、会话与通知主内容区的滚动边缘模糊，位置、尺寸、强度与层级不改，实现统一为 `ProgressiveBlur`。顶栏没有渐进模糊或雾色层（用户要求移除，不恢复）。其他弹窗没有顶部模糊。设置装饰层不绘制背景或边框、不承担裁切，遮罩在边界前衰减，清晰边框在模糊层上方单独绘制。
- 卡片与侧栏内的纵向滚动列表用 `styles/scrollEdgeFade.scss` 的 `vertical` mixin（`.bew-scroll-edge-fade`）：只在该方向还有内容时渐隐，由 scroll-driven 动画驱动，不加监听；遮罩只放在不绘制玻璃的滚动元素上。边缘本就是屏幕边缘或底部有固定输入栏时用 `vertical($bottom: false)` / `.bew-scroll-edge-fade--no-bottom`，状态相关时设 `--bew-scroll-edge-bottom-off: 1`。
- 玻璃内的实色控件可以无边框，保留必要的分隔线。

### 控件

- 分段控件、标签栏、图标切换器用 `src/styles/segmentControl.scss` 的 `.bew-segment-control` / `__item`；页面只负责定位、宽度和响应式。选项带 `data-segment-item`，激活项 `data-active="true"`；没有指示器的分组加 `--static`。
- 滑块指示器只用 `src/components/LiquidSegmentIndicator.vue`（`active-key` 传当前值，必要时 ref 调 `updateIndicator(true)`），不手写 DOM 或直接调 `useLiquidSegmentIndicator`。始终启用，不恢复 `enableLiquidSegmentIndicator` 设置。
- 有底板的横向选择组必须是轨道滑块 `.bew-segment-control--track`：滑块与轨道四周差 2px（`--bew-space-0-5`，用户指定），未选中项 hover 只把文字提亮到 text-1，只有滑块画底色。适用于首页 Tab / 布局 / 推荐模式 / 频道菜单、设置分段控件、Logo 样式、搜索结果分类与筛选、播放页右栏标签。例外：顶栏置顶频道（快捷链接）与首页频道菜单（单个触发器）；由 `verify:targeted-fixes` 扫描约束。顶栏 Pop 内无轨道的透明滑块保持 4px 内距，静态筛选维持原 hover。
- 同一行同类控件用一致的表面、高度、padding、gap、圆角、阴影和状态。
- 紧凑默认规格：外层高 36px、padding 4px、gap 4px、内部项高 28px、文字 13/16 400、图标 16px；文字项水平 padding 12px，页面主标签 `--wide` 16px，纯图标 `--icon`。
- 覆盖 default / hover / focus-visible / active / disabled。选中或聚焦任何元素都不额外加强调边框（用户指定）：`--bew-focus-ring` 为 none、`--bew-focus-shadow` 与 `--bew-selected-ring` 为透明、`--bew-focus-ring-color` 等于普通边框色，状态只靠 `--bew-selected-bg` / hover 底色与文字明暗表达；`main.scss` 全局兜底、MAIN world 与原生页注入样式同样遵循，不写死 outline、描边或外扩阴影环。布局编辑器的目标框是编辑器自身界面，用 `--bew-layout-editor-outline-color`。
- 点击目标不小于 24×24，普通文字对比度不低于 4.5:1。
- 侧栏里卡片与分段控件之外的整行图标 + 文字按钮用 `.library-sidebar-action`（`sidebarAction.scss`）：命中区等宽居中、内容靠左，首个图标或文字对齐滚筒标题（侧栏内距 + `--bew-sidebar-label-inset`，比搜索框左缘内收 8px）；常态透明，hover 亮 / 暗色略加深、OLED 略提亮。
- 滚筒选择器 `WheelSelector.vue`：字号与几何取共享 token，无箭头或选中背景，hover 只提亮文字；鼠标按下不提前移动焦点，单击同时切换分类与页面；方向键预览、Enter / Space 确认；支持连续与反向滚动、惯性尾巴抑制。
- 圆形操作用 `IconButton.vue`，关闭浮层用 `CloseButton.vue`（surface 变体用 elevated solid），删除标签或搜索历史用 `TagRemoveButton.vue`，不在页面里复制。

### 浮层与弹窗

- 同类 Pop（顶栏搜索、设置搜索、搜索筛选）默认与触发控件等宽，用实色 `.bew-popover-surface`；伸出顶栏边界的固定 `.bew-popover` 可有独立玻璃，其内部仍是实色。
- Pop 与视口或所属面板至少留 8px；结果数量会变的 Pop 按下方可用空间限制 `max-height`，内部滚动并 `overscroll-behavior: contain`。
- 居中弹窗与确认框用 `useSourcePanelMotion` / `useGlassPanelMotion`：从本次触发控件缩放进入，关闭沿原路返回并提前淡出；App 捕获本次激活来源，无来源时居中轻缩放。只动画 transform 与独立绘制层 opacity，玻璃祖先不淡化，中途取消从当前状态继续，离场 inert、结束后恢复焦点。菜单与日期选择器保持锚定。图片查看器离场结束前保留当前图像与缩放。
- 设置页从 Dock 设置按钮的 `DOMRect` 展开并保留 KeepAlive，只动画最外层面板，遮罩独立淡入淡出，不缩放顶部模糊层。
- 左下新版本提示与重载提示共用 `--bew-panel-radius` + round。顶栏登录按钮用实色主题背景与 `--bew-on-theme-color`。
- 头像悬停资料卡保留原生 `bili-user-profile` 与关注逻辑，经 MAIN world 既有 Lit 桥注入 `userProfile.scss`：popover 圆角，control 高度按钮，已关注 / 发消息为中性，未关注为实心主题色；从头像锚点轻缩放淡入。发消息用原生 UID 构建 Bewly 私信深链在新标签页打开，目标会话按 ID 单独读取，新联系人用临时入口，不伪造历史。

### 动效

- 处处支持 reduced-motion。
- 运行中的分段滑块（含 Dock）、滚筒弹簧与面板缩放经 `utils/motionPriority.ts` 登记（`holdMotion` / `holdAnimation`）。页面切换引起的界面动画必须在导航的同一轮刷新里登记（同步 watch 或过渡的 before 钩子），以目标页而不是仍在显示的页驱动：侧栏收展（`PersistentSidebar` 以 `activatedPage` 判断）与顶栏胶囊按钮增减都先于新页面挂载与加载。`useReadyPageTransition` 把旧内容淡出拉长到剩余动画时长，动画结束（`afterMotion`，最长 800ms）后才挂载新内容。新增的 JS 驱动或缩放类动画同样登记。
- 页面切换只作用于主内容与首页 Tab，不改页头、侧栏的结构、几何、材质或滚筒：代码就绪后 90ms 淡出、210ms 淡入，外壳不参与，滚动在旧内容退场后恢复；减少动态效果为 30/70ms 纯透明度。
- 项目不使用发光效果（Dock、Logo、滚筒、Toast、进度条均无），不恢复相关设置。唯一保留：Dock 深 / 浅色切换按钮深色悬停时的月光光晕、其他按钮同步变暗及图标过渡，原样维持。
- 主题切换的圆形裁切保持终态直到 `ViewTransition.finished`，取消的旧回调不得重新提交主题。

### 加载反馈

- 布局已知的内容用骨架：`SkeletonBlock.vue` + `src/styles/skeleton.scss` 的 `[data-bew-skeleton]`。骨架复用真实内容的列数、封面比例、字号行高与布局设置；已有数据保持可读，只占位缺的部分，不用全页骨架盖住可用的旧内容；加载完卸载，离屏图片停动画。
- 结果未知的区域（单个图标位、操作提交中、预览缓冲、通用 iframe、尺寸未知的媒体）用 `LoadingRing.vue`（`styles/loadingRing.scss`，非 Vue DOM 用 `utils/loadingRing.ts` 的 `createLoadingRingElement`）：3/4 弧旋转，完成时闭合后再恢复内容；图标位把原图标传入默认插槽同格切换。要等圆环闭合才退场的容器用 `useLoadingRingPhase`；时长取 `--bew-loading-ring-*`，减少动态效果时闭合为 0。
- 原生播放器的缓冲提示不动；LIVE 状态图标不是加载动画。
- 发送按钮（私信、弹幕）共用 `src/styles/sendButton.scss`：圆形上箭头；状态 ready / idle（空输入，暗淡静止）/ pending（发送、上传、冷却中才转圈）/ blocked（原生禁用或 `canSend=false`，暗淡感叹号并说明原因），交叉淡入淡出。原生弹幕按钮保留原节点、事件与禁用权威。

### Composer

- 评论、私信、动态转发共用 `styles/composer.scss`：32px `--bew-composer-radius` 普通磨砂外壳（只采样一次背景），上方透明正文区，下方表情 / 图片等图标工具栏与圆形发送按钮；关闭磨砂时用实色。外置表情 / @ / 话题面板共用 `useComposerPicker`，只在展开时监听定位与外部点击。
- 动态卡片展开评论即常驻 `MomentReplyComposer.vue`，固定在评论容器底部，列表按编辑器实测高度预留空间；只有表情 / @ 面板 Teleport 到卡片外。点回复复用同一实例，提示回复对象并隐藏图片与“同时转发”，取消回复恢复，草稿保留；回复对象只在编辑器顶部出现一次；常驻的空闲编辑器不锁住虚拟列表。顶层评论支持表情、真实 MID 的 @、JPG/PNG 图片与同请求 `sync_to_dynamic`；楼中回复只有表情和 @。
- “转发到动态”是全透明按钮：常态灰字，hover / 选中只提亮文字，选中后尾部的勾随共享动效显现。
- 评论图片为撑满正文宽度的统一三列网格，单 / 多图同尺寸，间距 4px。
- 转发输入允许空文案（不套评论的空输入禁用）。
- 原生评论增强复用原生 Lit 更新与编辑器局部 input 事件，保留原按钮、事件、校验与禁用权威，不加全局键盘监听或轮询（播放页的外置输入框是例外，见播放页）。
- 写入事务：根 / 父评论 ID 保持字符串；只合并服务端确认的结果；图片上传完成后再核对账号归属再发；未确认的公共写入不自动重试；收起或换号清理临时内容与图片 URL。验证时不代用户真实发布。

## 页面

### Dock、顶栏与页面模式

- 在展开的 Dock 上双指左右滑（`deltaX`）或滚轮（`deltaY`）切换到相邻页面，每个手势只切一页（`utils/wheelStep.ts` 的 `createWheelStepper({ oncePerGesture: true })`，惯性尾巴不连跳）；滚轮步进规则只此一份，`WheelSelector` 同样复用。
- Dock 默认在底部，只允许底部和右侧（旧左侧值迁移到底部）。完整胶囊；未选中项无底板，选中项是无阴影的灰色半透明底板 `--bew-dock-navigation-active-bg` + 实心图标（浅色黑、深色白），无小点。按钮 36px（宽屏 44px），外壳内距 6px（`--dock-shell-rim`，用户指定），外壳尺寸由按钮派生。指示器动画与刷新后严格居中保留。
- 收起模式 `button / hidden / automatic`：按钮模式在设置按钮后显示收起入口；隐藏模式不提供收起；自动模式指针离开后收起、悬停圆球立即展开。圆球保持展开 Dock 的几何中心；同一玻璃外壳先沿主轴变化尺寸，再让按钮组进出，收起时顺序相反。不用 Teleport、第二套状态或两个表面交叉淡入。
- 三档页面模式（Bilibili / Bewly / 自定义）及其持久化、与 Dock 内容设置的同步保持一体。顶栏模式只作为 `DockAndSidebar.vue`“Dock 内容调整”里的特殊配置项：不是导航项、不参与拖拽、没有“新标签页”选项。全 Bewly 用 Bewly 顶栏，全原版用原生 `.bili-header`，自定义按配置选择。
- 不适配第三方顶栏（Bilibili Evolved 已移除），不恢复 `BewlyOrBiliTopBarSwitcher.vue` 等旧切换入口。上游新的顶栏视觉或交互改动，移植前先取得用户同意。
- 顶栏铺满窗口：左侧内距是小电视的位置，搜索框紧跟小电视（不再居中，最宽 550px），置顶频道在搜索框之后；有侧栏的页面搜索框紧跟侧栏右缘（顶栏左内距为侧栏宽度，小电视占位隐藏）。TopBar 的 DOM Ref 注册表不用深层 `reactive`（会自动解包）。
- 顶栏右侧没有消息按钮（连同消息弹层、消息抽屉与“以抽屉打开通知页”设置一并移除，不恢复；未读数只在 Dock 显示）。除头像外的右侧按钮放在一个玻璃胶囊 `.top-bar-tools` 里，与小电视的圆共用 `sidebarSurface.floating`（侧栏材质、边框与 `--bew-shadow-1`），高度同小电视；玻璃画在按钮后面的 `::before` 层，弹层不落进它的 backdrop root。胶囊内图标不再走头图页白色强制。顶栏左内距是小电视位置（`--bew-home-logo-inline-start`），右内距是页面内容内距 `--bew-page-inline-inset`（与动态页右栏到右缘一致）。头像在同材质的玻璃圆正中，圆与头像是一个整体 `.avatar-orb`：悬停只把它放大一点（1.06），点击才打开用户面板（`setupTopBarItemHoverEvent('userPanel', { openOnClick: true })`，再点、点外部或 Esc 关闭；头像本身不再跳转，个人空间从面板里的名字进入）。面板在头像下方打开（默认锚定位置与 `slide-in`），不盖住胶囊按钮；打开时整个圆带着头像移入面板右上角并放大，圆在途中淡出，收回时圆在面板处先淡入再随头像回到原位。面板材质同为 `sidebarSurface.floating`，右上角圆角与放大后的头像同心（`--avatar-panel-face-radius` + space-2，round）；位移按 `computeAnchoredPopoverPosition` 的 8px 间距与 16px 边距推算，身份信息为头像留出空间。
- 顶栏始终显示：没有滚动自动隐藏、个人空间强制隐藏或视频页显示方式（`autoHideTopBar`、`videoPageTopBarConfig` 已退役，原版顶栏也不再被隐藏），不恢复。只在 Bewly 宽屏播放页与原页面固定页头（含个人空间吸顶导航）出现时让位，避免两层页头重叠。
- 胶囊内按钮（含分隔线）增减或轮换时统一用 `top-bar-item` 过渡，三段时间线：离开的按钮先淡出（fast），然后所有槽位一起以匀速曲线 `--bew-ease-in-out` 收起 / 展开（moderate，胶囊随之伸缩），最后进入的按钮淡入；轮换时胶囊不会先长后缩；只有这些小按钮在变化期间布局（宽度动画的用户指定例外），首屏不播放，减少动态效果时直接切换。
- 右侧按钮在其目标页上不显示：正在动态、收藏、历史或稍后再看页（Bewly 页面或对应原版页面）时隐藏该按钮（`isCurrentTopBarItemPage`）。
- 小电视点击只回首页；分区浮层在首页标签栏右侧。图标样式的小电视与持久侧栏（`PersistentSidebar`）是同一块玻璃：有侧栏的页面（资料库、动态、消息）小电视没有容器、直接放在侧栏上，图标左缘与侧栏内容线（侧栏内距 + `--bew-sidebar-label-inset`，即滚筒标题与操作图标）对齐；无侧栏页面小电视位置不变，侧栏收成它背后的圆（`.logo-circle`，同侧栏材质与边框加 `--bew-shadow-1`，几何来自 `--bew-home-logo-inline-start` / `-block-start`）。切换时侧栏玻璃层 `.persistent-sidebar__surface` 以流体形变收进 / 铺出圆（窄成液柱、缩成水滴、挤压回弹，`--bew-sidebar-morph-duration`，经 `holdAnimation` 登记，可中途反向，减少动态效果时直接切换），结束后交给小电视的圆；形变只改这个无子节点的固定层的几何，内容层只淡入淡出。小电视经 `useSidebarHost` 的 `logo` / `railOpen` / `morphing` 与侧栏协作；没有图标小电视时侧栏照旧平移收起。hover 只把图标变为 `--bew-brand-accent`，玻璃不变。图标 `--bew-icon-size-lg`，viewBox 裁到图形自身的居中方框。字标样式不变。
- 动态尾页先追加 `items` 再设结束状态；稍后再看用显式页码、aid 去重与完整集合刷新；History 补屏保持单一 async 请求链。

### 首页与搜索

- 推荐过滤按批次异步返回结果；普通关键词在页面内处理，正则只在 `src/regex/worker.ts` 执行，复用 `regexBatchRunner` 与扩展同源宿主。保留原 JS 正则语法，宿主预算 250ms，超时/退出终止 Worker；失败不回退到主线程。规则变更和页面退出释放旧任务，游标与列表只能在当前请求过滤成功后提交。

- 首页默认整合搜索页并复用单个 SearchBar：初始位置带聚焦人物，滚到顶栏后原实例吸顶、人物隐藏，吸顶后继续下滑的 `--bew-home-search-dock-travel` 内随滚动从居中平移到小电视之后（`--bew-home-search-dock-start`，与其他页顶栏搜索同列）：用页面滚动层的具名时间线 `--bew-page-scroll` 驱动的 CSS 滚动动画，只动 translate，居中位置只在 layout 帧测量；不支持滚动时间线的浏览器保持居中，不生成第二个搜索框。独立搜索页由单一反向开关控制；关闭时 `AppPage.Search` 归一到首页，Dock 不显示搜索项。两种形态共用同一组搜索设置；搜索框最大宽度 550px。聚焦时搜索框保持同一胶囊形状、材质与阴影，不变方、不变不透明；没有聚焦时的全屏模糊 / 暗化遮罩及其设置（`disableSearchFocusEffect` 已退役），不恢复。
- 首页 Tab 切换只替换内容网格：页头、搜索区与人物装饰不重建；未到内容顶部时保持当前滚动，已吸顶时恢复该 Tab 自己的位置（不低于内容顶部）。首页外层 `KeepAlive max=1`，不活跃的网格卸载并释放请求、预览、观察器，靠数据缓存恢复。其他页面只保留按账号隔离的内存视图状态，不缓存私信正文、请求所有者或 DOM。
- 视频抽屉复用真实历史项，底层逻辑路由保持原页；返回 / 前进不丢查询、不重复压栈。
- 广告识别靠明确的广告标记、广告反馈入口与推广 URL；缺少“不感兴趣”菜单不算证据。首页 / 原版搜索用现有列表 Observer 标记外层广告槽位，不删 Vue 拥有的 DOM，不对简介、标签和操作弹窗做文本关键词过滤。广告只隐藏不丢弃。

### 内容卡片

- 视频卡片只有统一布局（旧 `videoCardLayout` 仅在退役字段中）。自适应网格不再按断点设列数：`repeat(auto-fill, minmax(--bew-video-card-min-width, 1fr))`，封面最小 320×168，统一 40:21（同宽时为旧 16:9 高度的 14/15，约 0.933 倍），CSS 用 `--bew-video-cover-aspect-ratio`，JS 估算用 `VIDEO_CARD_COVER_ASPECT_RATIO`，能放几列放几列；JS 窗口化用同一公式 `getAdaptiveGridColumnCount(width, gap)`（`VIDEO_CARD_MIN_WIDTH`）。`gridColumns`、`videoGridColumns` 已退役。首页内容到窗口两侧用 `--bew-page-inline-inset`（24px，与动态页右栏到右缘一致）。封面与信息区不放操作按钮：稍后再看、收藏、不感兴趣等全部在 `VideoCardContextMenu`，由卡片右键（触屏长按、键盘菜单键）打开，Shift + 右键或已选中文字时保留浏览器菜单；页面专属项（如收藏页“取消收藏”）经 `VideoCardGrid` 的 `getMenuExtraGroups` 追加，不回到封面。
- 卡片菜单（`VideoCardContextMenu`）是独立浮层毛玻璃：`--bew-popover-surface-background` + `--bew-filter-glass-1`（服从全局模糊强度与关闭毛玻璃）+ `--bew-surface-border-color`，入场只缩放不淡化。列表被裁断的上 / 下端用 `ProgressiveBlur`（只在该方向还有内容时显示），不显示箭头；这是“玻璃不叠玻璃”的用户指定例外。右键所在布局区域时追加“编辑此布局 / 打开对应设置”（`findLayoutEditableTarget` + 应用 provider 的 `openLayoutEditorSetting`）。
- 菜单项不再隐藏：`videoCardContextMenuAdvanced` 列出的项收进底部“高级选项”折叠区（`useMeasuredDisclosure`，收起时 inert），其余直接显示；默认收起复制原始链接、BV 号、AV 号。“复制链接”复制净化后的链接（`cleanBilibiliUrl`，按设置附标题）。没有“抽屉打开”菜单项。
- 视频卡片不显示标签、徽标（已浏览、推荐 / 视频标签）和作者头像；唯一的标记是作者名右侧的中性“已关注”胶囊。仿 Apple Music 专辑封面排版：封面用 `--bew-video-cover-radius`（xl，比其他媒体大一级），不叠播放量、点赞、弹幕、时长等统计；信息区与封面左缘齐平、无左右内收，封面下 12px 起标题，最多两行、按实际行数自然增高，不给真实标题预留两行高度。标题后 4px 紧跟次要信息“UP 主 [已关注] · 发布时间”（同一字号，取 UP 信息字号设置，时间不换行），单行与双行标题都保持这一间距。标题用 text-1、字重 400，与全局原生文字层级一致；只有骨架保留两行占位。首页、历史网格和稍后再看网格统一复用 `useVideoCardSharedStyles` 与 `contentCard.scss` 的 `video-details / video-title / video-subtitle`，不在独立卡片中另设字号、字重或两行最小高度；网格的用户名不附头像，保持与封面左缘对齐。
- 裸卡（`contentCard.bare`）常态与 hover 都透明，hover 整卡放大 `--bew-card-hover-scale` 并抬到相邻卡片之上；视频卡片 hover（仅鼠标）时才渲染居中的 `ProgressiveBlur edge="center"`（`hover-halo` / `hover-halo-layer`，强度 `--bew-card-hover-blur-radius`），以卡片中心向外渐变模糊被遮挡的邻卡。减少动态效果时不放大。
- 视频封面统一用 `contentCard.media-frame`：`--bew-surface-border-color` 1px 内描边 + `--bew-shadow-1`，hover 时 `--bew-shadow-2`。裸卡 / 表面卡交互复用 `contentCard.scss`，间距与封面控件用 `--bew-card-*` / `--bew-cover-*`；行距由网格管理，卡片不加底部 margin。
- 作者常态中性前景，悬停与键盘聚焦用主题前景；动态内嵌媒体与引用用 8px 语义圆角。
- 封面下方信息区左右内收到封面圆角的直线切点、底部留同等空白（`contentCard.scss` 的 `under-cover`，内收值直接取对应媒体圆角）；视频卡片例外（与封面左缘齐平，见上）；横向图文不套用；可截断文本元素不加底部 padding。

### 播放页

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
- 播放器弹窗共用 `styles/layout.ts` 的 `PLAYER_POPOVER_SURFACE`（实色 `--bew-elevated-alt-solid`、1px 表面边框、popover 圆角与阴影、无背景采样）：控制栏菜单 / 提示、弹幕模式与设置、播放反馈面板。原生反馈面板（`.b-back-panel`）用同一表面并重排（标题行 + 分隔线、28px 关闭、两列选项、共享输入 token、主操作主题实色），保留原生节点与提交逻辑；只按 B 站自己设色的类名重设颜色，不写以元素类型或 `*` 结尾的选择器。

评论：

- 评论区用与动态卡片相同的 `MomentReplyComposer`（`App.vue` 中 `PlaybackCommentComposer.vue` 经 Teleport 渲染）：绝对定位在 `.bewly-widescreen-panels` 右栏底部内距处，评论面板按 ResizeObserver 实测的 `--bewly-widescreen-composer-height`（写在评论面板自身、不继承）预留末尾空间；只在评论面板显示时出现，铺满时随右栏淡出并 inert。面板带 `data-bewly-external-composer` 时，MAIN 用 `:host-context` 隐藏原生输入框，并改写 `bili-comment-thread-renderer.handleReply` 把回复目标经 page bridge 交给 Bewly；列表 `commentBoxDisabledState`（未登录、关闭评论）时走原生路径。服务端确认后经 bridge 写入原生 `newItems`（根评论置顶、楼中回复追加）。这是“评论增强保留原生输入控件”在播放页的例外。
- 加载统一为单个 `LoadingRing`：评论面板加载态、加载遮罩右栏，以及原生 `bili-comments-spinner`（MAIN 以遮罩画同一 3/4 弧，首帧前注入，保留无障碍文字）；面板圆环在评论就绪时先闭合再淡出。

原生节点与加载时序（细节见 `docs/maintenance/widescreen-native-adaptation.md`）：

- 优先保留原生作者、关注、充电、消息、评论和播放器节点，不为换材质重建业务控件、不克隆业务按钮、不复用已释放的节点。原生评论排版经 MAIN world 既有 Shadow DOM 样式桥，限定在 `#bewly-widescreen-root`。
- 简介、标签和原生操作根节点的迟到更新或替换由既有侧栏 Observer 处理。普通 BV/AV 页的作者、操作栏、简介和标签移交前经 `videoMetadataBridge` 确认 MAIN world 的原生 Vue 组件已挂载并拥有该节点（ISOLATED 不读 `__vue__`；DOM 存在或 API 统计不算就绪）；组件销毁通知走侧栏刷新与统一清理。缺少原生工具栏时侧栏不算完整，超时提供刷新 / 退出入口，迟到恢复后清除错误。
- 侧栏水合只计页面可见时间（隐藏时暂停，重新可见后重开 12s 预算）。原生评论首屏仍在请求（`#spinner-container`）时最多保持加载态到 30s；之后显示恢复提示但继续以 1s 节奏观察并保持评论预热到 60s，迟到的节点到达后自动清除提示（`resolveWidescreenSidebarHydrationPhase`）。评论缺失时每次水合经 page bridge 调 `wakeNativeCommentLists` 释放懒加载等待；12s 预算后首屏仍在转圈，每个预算只请求一次原生 `reload()`。
- Bewly 播放栏在原生控制栏、弹幕栏和辅助按钮布局稳定后退出初始化骨架（`playing` 事件不算布局就绪）：原生结构齐备时 DOM 解析后即可提交，不等 `load`；提交后 4s 仍不稳定则照常揭示外壳；骨架期间只有自动连播可因 `playing` 提前撤骨架。

### 消息页

消息页与稍后再看页的外观已由用户冻结：可复用它们的组件与 token，但不借重构改变已确认的外观。下列为行为与结构要点，视觉细节以源码为准（历史细节见存档与 `docs/notifications/`）。

- 结构：Notifications 是 Native Message Center。`reply / at / love / system` 是 Vue Native Feed；`whisper` 是支持会话管理、文本与图片发送、历史搜索的 hybrid workspace。普通用户、官方助手、未关注和拦截的一对一会话都在 Bewly 内读取；粉丝团和不支持的会话进 Native fallback 详情，只有用户点“打开原版私信列表”才离开。不隐式挂载原版私信或 System iframe（原版 System URL 保留为显式失败入口）。未选会话时显示 `ConversationInsights.vue` 与“全部标为已读”。
- 布局：分类、搜索、筛选与会话列表在持久侧栏（贴齐左、上、下，内部避让顶栏，只采样一次毛玻璃，材质为页面底色亮色混 6% 黑、深色 / OLED 混 16% 白），切换分类不卸载列表；分类用 `WheelSelector.vue`。消息顶栏 absolute，层级依次为搜索控件、侧栏、内容，Dock 高于底部模糊。
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

- 三页复用 `LibraryWorkspace.vue` 的贴边持久左栏（宽度与消息页一致，单层毛玻璃与实色降级复用消息页色调），保持页面级主滚动与原有分页 / 虚拟列表。标题用 `LibrarySidebarHeading.vue`（WheelSelector），搜索用 `LibrarySearchField.vue`（全圆角、常驻细边框、单一清除按钮；保留 IME 与空查询门禁）。不再用视频封面作左栏背景；首屏骨架用同一左栏布局。层级：顶栏搜索与菜单 > 侧栏。收藏侧栏不在滚筒上方重复显示标题。
- 收藏目录展开 / 选中项与历史、稍后再看的高级筛选同用 `--bew-message-pinned-background` 底板。高级筛选各组默认收起，展开状态按组存在当前标签页 sessionStorage。收藏视频排序（最近收藏 / 最多播放 / 最新投稿）与历史、稍后再看的布局切换同用 `SettingsSegmentedControl` + `.library-rail-segments`，旁边的管理按钮与历史排序按钮同为 36px。收藏筛选用 `FavoriteFilterPanel`（搜索范围即时生效，UP 主 / 分区 / 关键词需“应用”，分区在分组首次展开后才请求）；订阅与其他收藏用搜索框右端的原生筛选。管理菜单保留 hover / focus / touch 入口。
- 稍后再看以 `topBarStore` 的完整 `aid` 集合为唯一成员状态，其他组件不各自维护真值；修改后经专用失效消息跨标签重新获取。

### 动态页

- 四类筛选、个人资料、发布入口、直播列表整合在 `LibraryWorkspace` 侧栏，分类用滚筒；三个模块受原设置控制，但窄窗口或关闭模块不隐藏分类导航。右侧是关注用户栏与动态流，按实际内容宽度算列数。
- 热搜复用 `searchExperience` 的请求、缓存与可见性生命周期，不另建轮询：宽窗口停靠在顶栏下方（卡片标题固定、内部列表滚动），过窄时改为顶部紧凑区域；关注用户栏与动态卡片共用中间列，不伸进热搜列。
- 评论 / 转发展开共用 `useMeasuredDisclosure` 与 `momentDisclosure.scss`：内层保持自然布局，只有外层裁切高度按 200ms 标准曲线变化（不用过冲曲线、0fr 挤压或磨砂祖先淡入）；内容迟到时平滑重定目标，缓存的初始展开不重播。展开期间用既有交互保活保留卡片，瀑布流跳过中间高度的虚拟窗口提交，结束后提交最终高度。

### 设置页

- 当前设置结构以 `src/logic/storage.ts` 默认值为准。视觉设置搜索目录与四套 locale 与实际入口同步，共享文案（如 `common.close`）不改回硬编码。
- 左侧 Dock 收起时为胶囊，展开时为 `--bew-modal-radius` 平滑圆角矩形，表面用 `--bew-elevated-alt` + `--bew-filter-glass-1` + `--bew-surface-border-color`。二级纵向导航选中态为主题实色 + `--bew-on-theme-color`。
- 通用页保留面包屑中唯一的页标题，正文直接是说明与分组。内存节省相关项集中在“通用 → 内存节省”，各自保留原 key。
- 播放页与消息页设置在“Bewly 页面”二级导航，分别由 `PlaybackPage/PlaybackPage.vue` 与 `MessagesPage/MessagesPage.vue` 承载。

## 运行时与数据

- 几何：同一滚动所有者每帧测一次并合并分发；滚动帧只读 IntersectionObserver 预载状态，提交、恢复和尺寸变化后补查一次。
- 分页：只在成功响应后推进，异步响应按局部 generation 隔离；尾页先消费数据再结束；游标未推进是 `paginationStalled`（停止自动请求），不是“没有更多”。恢复位置用 `scrollIntent` 的位置声明，显式跳转与用户滚动优先。
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

背景图片 / 壁纸；用户自定义样式及其编辑器与注入；液态玻璃全套；Bewly 全局播放器 / 页面快捷键（`src/utils/keyboard.ts`、`shortcuts.ts`）；Bilibili Evolved 兼容；`BewlyOrBiliTopBarSwitcher.vue` 与搜索框下方悬浮切换器；Dock 与 Logo 发光设置；图片隐藏开关；popup / options 入口与 `build:web`、`dev:web`；`enableLiquidSegmentIndicator` 可见设置；播放页 `layoutPriority`、`centerVideo`、`sidebarWidth`、边缘展开与拖动调宽；Dock 左侧位置；Notifications 内的消息设置分类；旧 `videoCardLayout`；`enableFrostedGlass`、`enableTopBarGradient`、`alwaysUseTransparentTopBar`；顶栏渐进模糊与雾色层；搜索框聚焦变形与全屏模糊遮罩（`SearchFocusOverlay`、`disableSearchFocusEffect`）。相关旧字段只在 `RETIRED_SETTINGS_FIELDS` 中清理。
