# AGENTS.md

Bewly_Nocturne：基于 BewlyCat 持续维护的 bilibili 浏览器扩展（Vue 3 + TS + Vite + UnoCSS，包管理用 `pnpm`）。

## 命令

- `pnpm lint` / `pnpm lint:fix`
- `pnpm typecheck`
- 验证时不执行任何 `build` 操作；开发阶段使用 `pnpm dev` 持续编译与验证。
- 构建产物：Chrome/Edge → `extension/`，Firefox → `extension-firefox/`

仅当本次任务实际执行 `git commit` 时，提交前必须通过：

```sh
pnpm lint
pnpm typecheck
```

未执行 `git commit` 时，不要求运行上述检查。

## 结构（速查）

- `src/background/`：后台、消息与 API
- `src/contentScripts/`：页面注入主逻辑（入口 `index.ts`）
- `src/components/`：TopBar / Dock / VideoCard / Settings 等
- `src/stores/`、`src/logic/storage.ts`：状态与设置
- `src/manifest.ts`：manifest
- `src/_locales/`：i18n
- 主 UI 跑在 Shadow DOM 内，注意样式隔离

## 样式规范

### Token 与复用

- 全局视觉 token 统一维护在 `src/styles/variables.scss`，不要在页面组件中重复定义同义尺寸、字号、字重或状态颜色。
- 紧凑胶囊、标签栏、分段选择器和图标切换器使用 `src/styles/segmentControl.scss` 的 `.bew-segment-control` / `.bew-segment-control__item` 基础类；页面组件只负责定位、宽度和响应式布局。
- 使用液态指示器时，选项必须包含 `data-segment-item`，激活项使用 `data-active="true"`；无液态指示器的分组增加 `.bew-segment-control--static`。
- 液态指示器统一使用 `src/components/LiquidSegmentIndicator.vue`，页面不要重复调用 `useLiquidSegmentIndicator` 或手写 `.bew-liquid-indicator` DOM；组件通过 `active-key` 接收当前值，必要时用组件 ref 调用 `updateIndicator(true)`。
- 同一行的同类控件必须使用一致的 surface 变体、外层高度、padding、gap、圆角、阴影和交互状态，避免一个透明、一个悬浮或各自维护胶囊样式。
- 通用组件 token 使用 `--bew-control-*` / `--bew-segment-*` 命名；仅真正局限于 TopBar 的变量才使用 `--bew-top-bar-*`。

### 排版

- 基础界面文字限定为：caption `12/16px`、control `13/18px`、body `15/24px`、title `15/22px`、heading `20/28px`，优先使用对应的 `--bew-font-size-*` 和 `--bew-line-height-*` token。
- 品牌锁定字等极少量展示文字使用 `--bew-font-size-display`，比分等大号数据使用 `--bew-font-size-data/data-emphasis`；图标字体只使用 `--bew-icon-size-sm/md/lg/xl`。这些不参与正文层级，也不要用任意字号模拟。
- 字重仅使用 `400/500/600/700` 对应的 `--bew-font-weight-regular/medium/semibold/bold`；不要新增 `650`、裸写 `bold` 或其他中间值。
- 正文默认 `400`，次要强调和普通按钮用 `500`，标签/卡片标题/区块标题用 `600`，`700` 仅用于品牌文字、强标题和少量关键数字。
- 页面主标题复用 `.bew-page-heading`，不要在页面里重复组合字号、字重和行高。
- 同组标签的未选中与选中状态保持相同字重，依靠颜色、背景和液态指示器表达状态，避免切换字重导致文字宽度和指示器跳动。
- 新样式不要混用无语义的 px/rem 字号；确需特殊字号时应先判断能否扩充语义 token。

### 紧凑控件

- 默认规格：外层高 `36px`、padding `4px`、gap `4px`、内部项高 `28px`、文字 `13/18px 600`、图标 `16px`。
- 普通文字项水平 padding 为 `12px`；页面主标签使用 `.bew-segment-control__item--wide` 的 `16px`；纯图标项使用 `.bew-segment-control__item--icon`。
- 必须覆盖 default、hover、focus-visible、active、disabled 状态；不要移除键盘焦点反馈。
- `src/styles/main.scss` 提供全局 `focus-visible` 兜底；组件可以细化焦点环，但只有在提供等价反馈时才能覆盖或移除。
- 点击目标不得小于 `24 × 24 CSS px`，普通文本与背景对比度目标不低于 `4.5:1`。

### 间距

- 布局使用 `4px` 基准网格，优先选用 `--bew-space-*`：`4/8/12/16/20/24/32/40/48px`。
- `2px` token 仅用于边框、焦点环和光学微调，不用于常规容器 padding 或同级元素 gap。
- 紧密内联元素使用 `4px`，控件内部或紧凑列表使用 `8px`，关联元素组使用 `12px`，组件/栏位之间使用 `16–24px`，页面区块之间使用 `32–48px`。
- 同层级的卡片、列表和工具栏必须使用相同 gap；避免新增 `3/5/7/10/14/18px` 等一次性布局间距。确有视觉校正需求时需保留局部注释说明原因。
- 区分容器 padding 与同级元素 gap，不用子元素 margin 拼接公共布局间距。

### 圆角

- 圆角使用 `--bew-radius-sm/half/md/lg/xl/2xl/full`（`4/6/8/12/16/24px/full`），不要直接新增 `5/7/10/20/999px` 等一次性值。
- 优先使用语义 token：卡片 `--bew-card-radius`、媒体封面 `--bew-media-radius`、普通面板 `--bew-panel-radius`、Dialog/设置窗口等大型模态容器 `--bew-modal-radius`、顶栏 Pop/浮层 `--bew-popover-radius`、普通交互项 `--bew-interactive-radius`、徽标/胶囊 `--bew-badge-radius`。
- 视频卡片、动态卡片和同层级内容卡片默认使用 `12px`；内部按钮/菜单项通常使用 `8px`；小型状态块和骨架条使用 `4–6px`；头像等真实圆形可使用 `50%`。
- 父子元素需要共享裁切轮廓时，子元素使用 `inherit`；不要通过 `calc(父圆角 - 任意像素)` 猜测内层圆角。
- 同一个 Pop、卡片或媒体容器的四角必须来自同一语义 token，局部直角仅允许用于明确的相邻拼接结构。
- 胶囊与面板之间需要动画时，不要直接从 `--bew-radius-full` 插值；起始值应使用胶囊真实几何半径，结束值使用语义圆角，避免大数值被持续裁切后在动画末尾突然跳变。

### Pop 与浮层

- 顶栏搜索、设置搜索、搜索筛选等同类 Pop 默认与触发控件等宽，并复用 `.bew-popover-surface`；不要在组件内重复维护背景、边框、圆角、阴影和毛玻璃参数。
- Pop 与视口或所属主面板至少保留 `8px` 安全边距；窄屏允许扩展到所属内容区的安全宽度，但不能依赖固定宽度越界后再裁切。
- 结果数量可能变化的 Pop 必须根据下方可用空间限制 `max-height`，内容超出时只在 Pop 内部滚动，并使用 `overscroll-behavior: contain` 避免滚动穿透。

## 工具约束

- **Chrome DevTools MCP**：仅在用户**主动要求排查/调试页面**时使用；非必要不要用。仅当本机已安装且可调用 chrome-devtools-mcp 时参考相关能力；未安装/未开启则整节忽略。

## 提交规范

- 标头遵循 Conventional Commits：`<type>(<scope>)!: <description>`；`scope` 和表示破坏性变更的 `!` 均为可选项
- 支持的 `type`：
  - `feat:`：新增功能
  - `fix:`：修复问题
  - `docs:`：仅修改文档
  - `style:`：仅调整格式，不改变代码行为
  - `refactor:`：重构代码，不新增功能也不修复问题
  - `perf:`：性能优化
  - `test:`：新增或调整测试
  - `build:`：构建系统或依赖变更
  - `ci:`：CI 配置或脚本变更
  - `chore:`：其他维护性变更
  - `revert:`：回退既有提交
  - `merge:`：将 PR 或分支合并到目标分支
- 冒号后说明用中文，准确概括改动
- 合并 PR 时使用 `merge: 合并 PR #<number> <标题>`
- 有对应 [issue](https://github.com/keleus/BewlyCat/issues) 时在 commit 后附 `#{issue}`
- PR 不要提交 tests 文件

## 双仓库开发守则

完整流程见[上游协作流程](docs/maintenance/upstream-workflow.md)和[双仓库上游协作设计](docs/superpowers/specs/2026-08-05-dual-repository-upstream-workflow-design.md)。以下规则对未来 Agent 强制生效：

- 开始任何写入前，必须执行并阅读 `git status --short --branch`、`git remote -v` 和 `git branch -vv`；remote URL、当前分支或追踪关系与文档不符时，停止写入并报告。
- 必须先按任务类型选择基线：Bewly_Nocturne 品牌、外观、交互、个人定制、`port/*` 和 `sync/*` 从最新 `origin/main` 创建；可独立贡献给 BewlyCat 的 `fix/*` 从最新 `upstream/main` 创建。
- 推送目标必须与任务类型一致：`fix/*` 只能推送到 `contrib`，Bewly_Nocturne 功能、`port/*` 和 `sync/*` 只能推送到 `origin`，永远不得推送到 `upstream`。未经用户明确授权，不得 push 或创建、合并 PR。
- 处理上游修复前，必须用 `git merge-base --is-ancestor upstream/main HEAD` 检查 ancestry，并用 `git log --oneline upstream/main..HEAD` 与 `git diff --stat upstream/main...HEAD` 检查提交和差异范围；发现 Bewly_Nocturne 定制内容时不得推送。
- 移植修复只能在从 `origin/main` 创建的 `port/*` 上使用 `git cherry-pick -x <sha>`，并检查 `origin/main...HEAD` 的提交与 diff；不得 merge 整个 `fix/*`。
- 同步上游只能在从 `origin/main` 创建的 `sync/*` 上显式执行 `git merge --no-ff upstream/main`，不得在 `main` 直接 merge。
- 冲突必须逐项、逐块审查。复杂或语义不明确的 UI 冲突必须停止操作、列出行为差异并请求用户决定；不得整文件选择 ours/theirs，也不得使用 blanket ours/theirs 策略。
- 必须保护用户已有的 staged、unstaged、untracked 和 stash 内容。未经明确授权，禁止 reset、clean、删除分支或 Worktree、改写历史以及其他 destructive Git 操作。
- 上游 PR 必须排除 Bewly_Nocturne 专用 `AGENTS.md`、品牌化 `README.md`、维护文档、构建或打包产物，以及与修复无关的格式化；只包含可独立提交给 BewlyCat 的最小修复。
- 实际执行 commit 前必须重新运行 `pnpm lint` 和 `pnpm typecheck`；只有各命令最新一次完整运行的退出码均为 `0`，才能声明检查通过。

## Bewly_Nocturne 当前维护记录

- 2026-08-06：完成顶栏模式切换重构。顶栏模式现作为 `DockAndSidebar.vue` 的特殊配置项，复用既有全局页面模式和顶栏状态；旧的搜索框下方悬浮切换器、Teleport、显隐控制、层级、设置项及废弃文案已清理。
- 顶栏模式配置不属于 Dock 导航项，不参与拖拽排序，不显示“新标签页”选项；自定义顶栏选择与全 Bewly / 全原版模式保持同步，不恢复已删除的旧入口或兼容层。
- 本次变更已在独立测试 Chrome 窗口中加载开发扩展并通过 Bilibili 页面注入验收。后续涉及上游顶栏实现的更新默认不批准，必须先取得用户明确授权后再移植或合入。
- 2026-08-06：深色网页背景统一使用受 OKLCH 明度/色度约束的 `--bew-dark-page-bg` 派生 token；`enableOledDarkMode` 仅在有效深色主题下通过 `oled-dark` class 生效，并同步到相关 iframe。首页不直接覆盖 Bilibili `body` 背景，纯黑底色由插件自己的 viewport wrapper 承载，以保护原站布局和滚动层。
- 2026-08-08：完整移除背景图片功能；不恢复壁纸设置、上传入口、存储字段、渲染层或旧数据兼容逻辑。
- 2026-08-08：建立平滑连续圆角、语义表面边框和主题色前景对比系统；统一设置页与 Dialog 的顶部渐变模糊层、关闭按钮、标签删除按钮和媒体裁切轮廓。
- 2026-08-08：毛玻璃默认开启；唯一的负向设置 `disableFrostedGlass` 同时关闭全局毛玻璃与普通顶栏渐变并切换到实色表面。暗色主题色渐变由 `useLinearGradientThemeColorBackground` 统一控制页面与顶栏，不恢复旧顶栏专用开关。
- 2026-08-08：统一扩展失效消息处理和内容脚本刷新提示；开发模式关闭内容脚本压缩，避免长期 watch 后增量函数重命名失配，生产构建仍沿用原有压缩行为。
- 2026-08-09：新版本与重载提示统一为 round 面板轮廓；顶栏登录入口和共享关闭按钮改用实色语义表面。“Bewly 页面”二级导航新增播放页与消息页独立空框架，不预设状态或兼容层。
- 2026-08-09：Dock 新增按钮收起、隐藏收起入口、离开后自动收起三档行为；收起态复用单一 Dock 实例并保持在展开 Dock 的几何中心。同一毛玻璃外壳先连续改变真实宽高，再分阶段加载或退出按钮组，不恢复为两个表面交叉淡入。
- 2026-08-09：Stage 2 完成动态、历史、稍后再看、订阅流、榜单、过滤、快捷键、视频预览和 URL 净化的确定性修复；分页只在成功响应后推进，尾页数据先消费再结束，异步响应按局部 generation 隔离。
- 2026-08-09：扩展重载后的旧 content script 将 context invalidated 视为终止状态；停止共享状态轮询并收敛未处理 Promise。Shadow DOM 样式失败时卸载该次插件 UI，不得显示透明、错位的无样式 Dock 或设置页；刷新页面后由新上下文正常挂载。
- 2026-08-09：For You、Moments 和 Following 的内容缓存、分页与本地状态按 Bilibili MID 隔离，未登录状态与任意已登录账号也必须分开；切换账号时旧请求必须失效。
- 2026-08-09：稍后再看以 `topBarStore` 的完整 `aid` 集合为唯一成员状态源；Moments、VideoCard、顶栏和原站增强不得各自维护 aid/bvid/epid 真值，mutation 后通过专用失效消息跨标签重新获取服务端权威集合。
- 2026-08-09：MAIN-world 设置与无 Cookie 搜索通信共用版本化 protocol、页面级 channelId、requestId 和有限 timeout；iframe 消息只接受当前 iframe source。Firefox Container Cookie 必须按最终 URL 的 domain/path/secure/expiry 筛选，不得把整个 Cookie Store 直接拼入请求。
- 2026-08-09：Bewly 全局播放器/页面快捷键和快捷键设置入口已移除，不得重新注册会与 Bilibili 原站竞争的 window/document 键盘监听；Dialog、Drawer、图片查看器和菜单/输入控件的局部无障碍键盘交互必须保留。
- 2026-08-09：Cloud Sync 保留 pending/quota blocked/failed/synced 语义和有上限退避；存储初读失败不得解释为空存储并回写默认值。MV3 App Auth 使用 `browser.alarms` 保持 token 新鲜度，不恢复后台长期 interval。
- 2026-08-09：站内导航收敛到 `useRouteState.ts` 单例，共享 pushstate/replacestate/popstate/hashchange 和一个低频 fallback；页面模式、主题、顶栏和内容脚本不得重新建立各自的高频 URL 轮询。截图、画面比例、触屏手势、随机播放和收藏弹窗的 observer/listener 必须跟随页面与设置生命周期启停。
- 2026-08-09：TopBar DOM `Ref` 注册表不得使用会自动解包子 ref 的深层 `reactive`；未登录或元素尚未挂载时，transformer 必须仍获得 Ref 容器，不得因读取 `undefined.value` 阻断页面。
- 2026-08-10：选择性同步并审查 BewlyCat 新增修复，同时完整移除 Bilibili Evolved 的样式、DOM 探测、运行时分支、设置和文案。原版顶栏从此严格指 Bilibili 原生 `.bili-header`，不得重新引入第三方顶栏兼容层。
- 2026-08-10：顶栏搜索框的异步宽度校正必须立即生效，不得为水平 `transform` 添加过渡，避免页面重新加载时出现横向入场动画。
- 2026-08-11：首页默认整合搜索页；独立搜索页由单一反向开关控制。整合模式下不得单独进入 `AppPage.Search`，Dock 隐藏搜索项并由首页承接搜索结果选中状态；两种搜索页面继续共用同一组持久化设置。
- 上游同步游标：已审查并处理至 `BewlyCat upstream/main@00682ac`（完整提交 `00682ac56e790fff8b2ff3b58fd68c163579f852`）。游标提交无关联 Issue/PR，因此以完整 commit SHA 作为唯一权威游标；后续同步只检查该游标之后的新提交、Issue/PR，不重复审查此前范围。

## Bewly_Nocturne 上游同步保护基线

以下是本项目有意区别于 BewlyCat 上游的产品设计。同步上游时必须逐项保护；发生冲突时按行为和实现锚点审查，不得直接以整个上游文件覆盖。

### 导航、顶栏与页面模式

- 主 Dock 是完整胶囊；未选中导航项没有圆形底板，Hover 保留发光反馈。浅色模式使用主题色选中背景和主题色光晕，深色模式保留白色发光指示与黑色选中图标。
- Dock 指示器动画和刷新后的严格居中行为必须保留；Bilibili / Bewly / 自定义三档页面模式及其持久化、与 Dock 内容设置的同步关系不得拆散。
- Dock 收起模式保留 `button / hidden / automatic` 三档：按钮模式在设置按钮后显示收起入口，隐藏模式不提供收起功能，自动模式在指针离开后收起且 Hover 圆球立即展开。收起圆球必须保持展开 Dock 的几何中心；展开时同一玻璃外壳先沿主轴增长，完成后按钮组再轻移进入，收起时顺序反转。不得通过 Teleport、第二套 Dock 状态或两个表面交叉淡入实现。
- 顶栏模式只在“Dock 内容调整”中作为特殊配置项存在，不是 Dock 导航项，不参与拖拽，也没有“新标签页”选项。全 Bewly 使用 Bewly 顶栏；全原版使用 Bilibili 原生 `.bili-header`；自定义模式根据现有配置选择 Bewly 或 Bilibili 原生顶栏。不得探测、适配或承诺支持第三方顶栏实现。
- 已删除的 `BewlyOrBiliTopBarSwitcher.vue`、搜索框下方悬浮入口、Teleport、层级、显隐设置和废弃文案不得恢复。任何新的上游顶栏视觉或交互更新默认不批准，移植前必须取得用户明确授权。
- 首页默认整合搜索页并复用单一 SearchBar 实例：初始位置保留聚焦人物，滚动到顶栏后原实例粘附且人物隐藏，不得再生成第二个顶栏搜索框。独立搜索页开关关闭时，`AppPage.Search` 路由归一到首页且 Dock 不显示搜索项；两种形态直接共用现有搜索设置，不恢复“与搜索页共用的配置”跳转入口。首页与搜索页只复用顶栏表面样式，必须保留搜索框自身的 `550px` 最大宽度。
- Dock 默认位于底部；`Notifications` 是可配置的独立 Bewly 混合消息页：`reply / at / love` 使用 Vue Native Feed，`whisper / system / settings` 使用完整的原版消息 iframe fallback。未原生化的能力继续由原版页面完整承载，不得一次性移植或重写完整私信客户端；下一阶段只能单独评估 `system`，私信必须继续作为独立阶段拆分。
- 三类 Native Feed 共用展示模型、分页策略、错误模型、外层滚动和连续列表视觉；页面级 controller 按分类保存状态，但同一时间只允许渲染当前一个 Native Feed DOM。隐藏分类不得保留完整长列表、IntersectionObserver 或 visibility listener，也不得通过 KeepAlive 保留三套 Feed 组件。
- Reply / At / Love 的 items、cursor、read commit、请求 single-flight、缓存与 scrollTop 必须独立；所有 Feed 按当前 MID 隔离，账号变化后旧 generation 的响应不得写入新账号。通知解析、聚合或分页规则变更必须同步脱敏 fixture，并通过 `pnpm verify:notifications`，不得绕过该门禁。
- Native Feed 的服务端已读成功后只通过 `topBarStore` 的单一权威路径同步未读与跨标签 broker；不得建立第二套 unread Store。Bewly 页面、`NotificationsDrawer` 与直接打开的原版页必须继续保持 iframe、路由、滚动和显隐状态独立。后续 System 原生化必须复用 Native Feed controller 与策略内核，但不得把系统通知强行套入 actor 模型。

### 深色背景、OLED 与主题色

- 深色网页底色必须从 `--bew-dark-base-color` 在 OKLCH 中约束明度和色度后派生为 `--bew-dark-page-bg`；不得退回简单混黑，也不得让基准色直接支配网页底色亮度。
- `enableOledDarkMode` 只在有效深色主题下把 `--bew-bg`、`--bew-homepage-bg` 和必要的插件 viewport 底层设为 `#000`；卡片、面板、弹窗和输入框继续使用 content/elevated 层级。不得以覆盖 Bilibili `body`、滚动层或布局容器的方式实现纯黑。
- `--bew-on-theme-color` 必须按最终主题色的 sRGB 相对亮度在黑白前景间选择，并同步到 document 根节点和 `#bewly` Shadow Host；近白主题色上的实色按钮、选中项和图标不得退回硬编码白色。
- 背景图片功能已被产品级移除。上游同步不得重新引入壁纸设置、图片持久化、背景渲染组件或迁移/fallback。

### 圆角、表面与媒体轮廓

- 普通圆角矩形使用集中 token `--bew-corner-shape: superellipse(1.7)`，并保留原有语义 `border-radius` 作为不支持 `corner-shape` 时的回退；组件内不得各自写不同的 superellipse 数值。
- 真实圆形和完整胶囊必须使用 `corner-shape: var(--bew-corner-shape-round)`。头像、圆形图标按钮、关闭按钮、Switch 滑块保持正圆；主 Dock、Switch 轨道和明确胶囊保持完整 round，不得被全局平滑矩形规则覆盖。
- 设置页左侧 Dock 收起时是几何胶囊，展开时切换为 `--bew-modal-radius` 的平滑圆角矩形；表面统一使用 `--bew-elevated-alt`、`--bew-filter-glass-1` 和 `--bew-surface-border-color`，不得叠加更高模糊或更不透明的独立实现。
- 表面边框使用不透明语义 token `--bew-surface-border-color`；深色和 OLED 均为 `#4B4C4E`。不要用它替换普通分隔线的 `--bew-border-color`，也不要在媒体父子层重复绘制边框。
- 视频封面由最外层媒体容器负责唯一几何裁切；图片、视频预览、Skeleton、遮罩和底部渐变继承同一 radius 与 corner shape，Hover Preview 前后不得跳角、露底或出现双边框。

### 毛玻璃、设置页与共享组件

- 毛玻璃默认开启并继续服从全局模糊强度。`disableFrostedGlass` 是唯一关闭入口，开启后同时关闭毛玻璃和普通顶栏渐变；不要恢复 `enableFrostedGlass`、`enableTopBarGradient`、`alwaysUseTransparentTopBar` 等独立或正向旧状态。
- 设置页和 Dialog 的顶部渐变模糊统一由 `PanelTopBlur.vue` 承担。装饰层不绘制背景或边框、不承担内容裁切，遮罩必须在物理边界前衰减透明；清晰表面边框必须在模糊层上方单独绘制，不得以 `overflow: hidden`、实色背景或重复 backdrop-filter 破坏渐变或模糊顶部圆角/边框。
- 设置页从实际 Dock 设置按钮的 `DOMRect` 起源展开并保留 KeepAlive；只动画最外层面板的 opacity/transform，遮罩独立淡入淡出，不缩放顶部模糊层。
- 圆形操作使用 `IconButton.vue`，关闭浮层使用 `CloseButton.vue`，删除搜索历史或 Chip 使用 `TagRemoveButton.vue`；不得重新在页面组件中复制几何、前景继承和交互样式，也不得混淆三种语义。
- 左下新版本提示与内容脚本重载提示必须共用 `--bew-panel-radius` 和 `corner-shape: round`；不得将其中一个单独改回 superellipse。顶栏登录按钮使用实色主题背景与 `--bew-on-theme-color`，`CloseButton.vue` 的 surface 变体使用 elevated solid token，以保持深浅主题可读性。
- 内存节省相关设置集中在“通用 → 内存节省”，保留各自持久化 key 和独立行为；不得在旧页面重复入口或把网络、画质、动画等无关性能项混入。
- 播放页和消息页设置位于“Bewly 页面”的二级导航，分别由 `PlaybackPage/PlaybackPage.vue` 和 `MessagesPage/MessagesPage.vue` 作为独立叶子模块。实际页面设置出现前保持空内容，不新增存储字段、迁移、fallback 或重复入口。

### 设置与开发运行时

- 当前设置结构直接以 `src/logic/storage.ts` 的默认值为准；已删除字段不恢复迁移、兼容别名或 fallback。视觉设置搜索目录和四套 locale 必须与实际入口同步，`common.close` 等共享组件文案不得退回局部硬编码。
- 内容脚本、顶栏共享状态和设置存储统一通过 `src/utils/messaging.ts` 发送扩展消息；扩展重载造成的 context invalidated、消息端口关闭或接收端缺失应作为同一失效状态收敛。TopBar 刷新批次的叶子请求必须把 context invalidated 交给共享协调器统一停止轮询，不得局部打印后吞掉。
- Shadow DOM 的主样式未就绪前必须保持插件容器隐藏；样式加载失败时卸载并移除容器，绝不能把无样式的 Dock、Sidebar 或设置页暴露到 Bilibili 原版页面。
- 顶栏动态尾页必须先追加当前 `items` 再设置结束状态；稍后再看使用显式页码、aid 去重和完整集合刷新；History 补屏保持单一 async 请求链。不得退回通过数组长度推页、未等待递归或旧 index 删除。
- `src/utils/bilibiliUrl.ts` 是当前页与分享链接的统一净化来源，必须保留 `p`、`t`、hash 等导航/播放语义；不得为恢复 Bewly 全局快捷键而重建 `src/utils/keyboard.ts` / `src/utils/shortcuts.ts` 运行时。
- 液态分段指示器保持固定启用及现有 morph、ResizeObserver 和 reduced-motion 行为；不得恢复 `enableLiquidSegmentIndicator` 的可见设置项、搜索入口或静态视觉分支。
- `vite.config.content.ts` 的开发构建必须保持 `minify: false`，防止 Vite watch 增量更新后函数重命名与调用点错配；该约束仅用于 `pnpm dev`，不得借此改变生产构建策略。
- `pnpm dev` / `pnpm dev-firefox` 只启动 prepare、content/inject 和 background 等真实扩展任务；已移除的 popup/options HTML 入口、`build:web` 和 `dev:web` 不得恢复为假构建流程。

## 通用工程原则

- 不保留向后兼容。过时实现直接删除，不增加兼容层、迁移脚本或 fallback。
- 选择能满足当前需求的最简单实现；不做预防性抽象，不增加多余的配置层。
- 分层架构逐步建设：先跑通最小端到端版本，再逐层扩展；不要为了尚未完成的复杂度拆掉可运行的部分。
- 保持组件模块化，严格进行关注点分离。
- 优先使用成熟且持续维护的库；没有明确理由不要自行重写。
- 先检查项目现有依赖能提供什么，再考虑引入新包或自行实现；不要先假设已有库无法满足需求。
- 架构决策面向长期维护，不接受“先这样以后再换”的临时方案。
- 先参考成熟产品解决同类问题的已验证模式，避免从零发明。
