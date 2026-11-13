# 全项目审查（2026-11-11）

范围：`src/`、`scripts/`、样式 token 与四套 locale。方法：knip（导出、文件、类型、依赖）、自写的 locale 键与 CSS token 引用扫描、`AGENTS.md` 中已删除名字的反查、热路径监听与轮询的 grep，再逐个读源码定性。没有做实站或浏览器检查；页面视觉由用户目测。

## 结论

- knip 全部通过：没有未用文件、导出、类型或依赖；所有 `.vue` 组件与 `scripts/` 脚本都有调用方。`AGENTS.md` 里写明已删除的名字（液态玻璃、`useCardRemoval`、`PanelTopBlur`、`GLASS_SURFACE_CONTEXT`、沉浸流、旧边框 / 圆角 token 等）在 `src` 中均无残留。
- 发现的确实问题集中在 knip 看不到的一层：locale 键、CSS token、退役设置与 token 回退值。已修复，见下。

## 已修复

### 1. 删除 86 个无人引用的 locale 键（四套同步）

逐一确认：完整键不出现在 `src` 任何位置，没有 `` `ns.${…}` `` 拼接前缀能覆盖，没有 yml 链接消息（`@:`），也没有把命名空间单独传参的写法。唯一被测试提到的 `library_tools.load_more_matches` 是断言“不再出现”。

```
library_tools: resume_at load_more_matches date all_dates content_type playback_state
  state_all state_unstarted state_watching state_completed state_unknown
  duration duration_all duration_short duration_medium duration_long load_more_videos
common: viewWithoutNum danmaku danmakuWithoutNum like likeWithoutNum year month week day
  second added performance_impact_warn operation.edit operation.enable operation.disable table.name
topbar.noti_dropdown: replys mentions likes messages chats（整组）
topbar.moments_dropdown: uploaded now_streaming（整组）
notifications.actions: refresh refresh_aria refresh_tooltip open_original_aria open_original_tooltip
moments: user_info feed_groups initial_loading loading opening_live opening_video opening_forward loading_detail
moment_card: charge_exclusive watch_later_added add_watch_later added watch_later open_dialog
  open_dialog_short open_new_tab_short
video_card: watched visited_recently
home: moments
history: filters.title filters.period filters.by_device clear_failed
favorites: collected_season_prefix folder_section_title article_section_title video_count article_count
  unfavorite_confirm batch_target_folder edit_folder_title_placeholder edit_folder_failed
  default_folder_locked delete_folders_failed unfav_seasons_failed
widescreen: return_video playlist recommendations
search_page: hot_search_ranking loading
search.media: other
```

### 2. 退役设置只留一处登记

`src/logic/storage.ts` 的 `normalizeSettings` 里另有一串 `Reflect.deleteProperty` 清理 19 个旧字段（`detectCommentShadowBan`、`homeTabsPosition`、`enableHomeGridVirtualization`、`releaseOffscreenVideoCardImages`、`showBewlyOrBiliTopBarSwitcher`、`showHomeButtonInTouchMode`、`enableFrostedGlass`、`alwaysUseTransparentTopBar`、`enableTopBarGradient`、`showTopBarThemeColorGradient`、`useOriginalBilibiliHomepage`、`searchPageDarkenOnSearchFocus`、`searchPageBlurredOnSearchFocus`，以及音量均衡的 `enableVolumeNormalization`、`targetVolume`、`normalizationStrength`、`adaptiveGainSpeed`、`voiceGateDb`、`volumeNormalizationDebug`）。这是第二套退役机制，而且这些字段没有被云同步拦截（只有 `targetVolume` 在 `settingsCloudSyncProtocol.ts` 单独挂了本地化条目）。

改为全部登记到 `RETIRED_SETTINGS_FIELDS`，删除那串删除语句与云同步里的单独条目。`normalizeSettings` 开头已调用 `removeRetiredSettings`，本地清理行为不变，同时获得云同步拦截。

### 3. 删除未用的 CSS token（`src/styles/variables.scss`，57 行）

全仓（含 UnoCSS 的 `$bew-*` 写法、JS 字符串与动态拼接前缀）没有读取方：

- 色阶 `--bew-theme-color-10…90`、`--bew-info-color-10…90`、`--bew-success-color-10…90`、`--bew-warning-color-10…90`、`--bew-error-color-20…90`（`--bew-error-color-10` 有使用，保留），以及指向这些色阶的过时注释。
- `--bew-card-avatar-size`、`--bew-content-hover`、`--bew-content-alt-hover`、`--bew-elevated-alt`、`--bew-elevated-alt-hover`（浅深两份）、`--bew-surface-inset-bg`（两份）、`--bew-logo-color`（两份）、`--bew-dark-glass-base`、`--bew-popover-gap`、`--bew-layout-home-search-stage-height`（其 lead / tail 两段仍由首页写入与使用）。

### 4. token 回退值与设计值对齐（36 处）

`var(--bew-*, 回退)` 的回退值停在 macOS 字号校准之前（body 15px / 24px、caption 12px / 16px、control 18px 行高等），与 token 的设计值不一致。`contentScripts/style.css`（含 `:root` token）随所有内容脚本页面注入，MAIN world 注入与播放页样式所在的页面 token 都存在，所以这些回退实际不生效，本项是一致性修正、没有视觉变化；唯一可能缺 token 的是扩展重载后由后台注入的刷新提示，那里文字会从 14 / 12px 变为设计的 13 / 11px。统一改为 `variables.scss` 的设计值。涉及：`background/contentScriptRefreshPrompt.ts`、`inject/index.ts`、`inject/commentMissingParents.ts`、`utils/verticalVideoZoom.ts`、`utils/bewlyWidescreen/styles/layout.ts`、`utils/bewlyWidescreen/styles/loading.ts`、`styles/sendButton.scss`（`--bew-icon-size-md` 回退 16 → 20）、`contentScripts/bewlyBootOverlay.ts`、`contentScripts/features/opusDetailDrawerLayout.ts`。`scripts/verify-targeted-fixes.ts` 中钉住旧回退字面量的 5 条断言同步为新值。

## 待用户审查

不确定是否有意、涉及产品决定或改动面大的，没有改。

| 优先级 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- |
| 高 | 14 处 `typeof ResizeObserver` / `IntersectionObserver` 守卫，如 `utils/responsiveImage.ts:41`（另有 `window.resize` 回退）、`components/PersistentSidebar.vue:141`、`components/VideoCardGrid.vue:379`/`771`、`composables/useCardWindow.ts:450`、`utils/viewportGeometry.ts:90`、`utils/selectionScrollAnchor.ts:34`、`utils/skeletonVisibility.ts:9`、`components/LazyPicture.vue:342` | 扩展目标浏览器都有这两个 API，生产里这些分支不可达，是“兼容壳”。多个测试会临时替换或删除全局 Observer，**没有验证**测试是否依赖无 Observer 的路径（未单独试删）。 | 一次性删掉守卫与回退分支，让缺 Observer 的测试 fixture 自己装桩；按 AGENTS“缺少测试依赖先修 fixture”。 |
| 高 | `utils/bewlyWidescreen/nativeControls.ts:44` | 播放页控制栏每次显隐（静止 2.5 秒）都在 `body` 上切换 `bewly-widescreen-controls-hidden`，违反“状态不写 body class”（整页样式重算）。`layout.ts:865-888` 的选择器依赖它。 | 改写到播放器根节点的 data 属性，选择器随之改写。 |
| 高 | 原生页适配样式中 `:hover` 用 `--bew-theme-color` 铺底约 30 处，如 `styles/adaptedStyles/pages/videoPage.scss:119/154/185/190/195/374`、`userSpacePage.scss:292/296/373`、`common/comments.scss:63/165/215`（行号为 `:hover` 所在行附近），另有 `watchLaterPage.scss`、`animePlayback&MoviePage.scss`、`common/userCard.scss` 等 | 规则只允许主题色出现在主操作、开关、未读点等；其中可能有原站主按钮（允许），也可能是普通按钮或链接的悬停（违规）。需逐页对照原站判断。 | 主按钮保留；其余改 `--bew-hover-bg` + 提亮文字。 |
| 中 | `src/composables/useDark.ts:52` | 定时深色模式每 30 秒轮询一次时间。 | 改为按下一个切换时刻排一次 `setTimeout`（页面重新可见时重排），不轮询。 |
| 中 | `views/Home/components/Ranking.vue:135`、`views/SearchResults/pages/AllSearchPage.vue:291`、`components/TopBar/components/TopBarPinnedChannels.vue:90` | 已有 ResizeObserver 观察自身宽度，又挂 window `resize`。前两处在回调里读 `column-gap`（随界面缩放变化），可能是为捕获“缩放变而宽度不变”的情况，不是纯重复。 | 让列间距改读 `uiPx(GRID_GUTTER)`（已随缩放响应式更新），然后去掉 window 监听，只留 ResizeObserver。 |
| 中 | `components/TopBar/components/pops/{MomentsPop:141,FavoritesPop:163,HistoryPop:129,WatchLaterPop:72}.vue` | 四个顶栏弹窗经 `useOptimizedScroll` 各自挂 scroll 监听做触底加载。弹窗只有一个打开，开销小，但与列表页的 IntersectionObserver 哨兵不是同一套。 | 改用列表尾部哨兵 + IntersectionObserver，删掉 `useOptimizedScroll`。 |
| 中 | `components/MomentCard/MomentCommentSection.vue:80` | `ref<MomentCommentItem[]>` 深响应式，评论多页后可能变长。 | 确认更新方式后改 `shallowRef` 整体替换。 |
| 中 | `src/logic/storage.ts:796` 的 `enableCommentReplyTree → commentReplyTreeMode` | 旧布尔值到新枚举的迁移，与“退役字段不迁移”的规则冲突。 | 若已过足够版本，删除迁移并登记 `enableCommentReplyTree` 为退役字段。 |
| 中 | `src/styles/variables.scss:190` 的 `--bew-library-filter-radius` | AGENTS 圆角一节列为同心公式 token，但代码中没有读取方。 | 要么在侧栏筛选菜单里用上，要么从 AGENTS 与 `variables.scss` 一并删除。 |
| 低 | `contentScripts/views/Home/components/VersionReminder.vue:103-107` | `min-height: 42px` 字面量、`border: 1px solid var(--bew-theme-color)`（边框体系只允许三种角色 token 与发丝线）。 | 高度改控件 token，去掉主题色边框。 |
| 低 | 透明度与按下缩放 | 禁用态 `opacity` 有 0.45 / 0.5 / 0.55 / 0.6 / 0.65 多种字面量；按下缩放有 0.9 / 0.92 / 0.94 / 0.95 / 0.96 / 0.98 / 0.985 / 0.99。 | 见设计建议 P0。 |
| 低 | 测试输出 `[Vue warn]: Failed to resolve component: FrameActions` | `IframeDrawer.vue` / `PipWindow.vue` 都正确导入了 `FrameActions`；警告来自测试 harness 编译 `App` 时没解析这个导入，组件在测试里是缺失状态。 | 未核实（没有打开 harness 查看）。确认后修 harness 的组件解析表。 |

## 设计建议

基于源码与 `AGENTS.md`，未目测。方向：在现有体系（macOS 字号、全 400 字重、平滑圆角、单一毛玻璃、发丝线）之内，学 Claude Code 的克制与一致（每种状态一个 token、操作只在需要时出现），学 Apple Music 的内容优先（图像取色、大留白、按钮退到内容之后）。

### P0：把交互状态收敛成一组 token

现状：`:hover` 背景用了 `--bew-fill-2`（49 处）、`--bew-content-solid-hover`（46）、`--bew-fill-1`（26）、`--bew-theme-surface-hover`（18）、`--bew-hover-bg`（18）等十几种；AGENTS 的规则是 `--bew-hover-bg` / `--bew-pressed-bg` / `--bew-selected-bg` 三个。

1. **悬停**：透明底的控件（图标按钮、行、文字按钮）一律 `--bew-hover-bg` + 文字从 text-2 提亮到 text-1；自带填充的中性按钮（`IconButton` 的 `--control`、播放页操作胶囊）用 `--bew-fill-1 → --bew-fill-2`。`--bew-theme-surface*` 是兼容别名，迁完后删除。
2. **按下**：新增 `--bew-press-scale-small`（小按钮 0.94）与现有 `--bew-control-press-scale`（大控件），替换 8 种字面量缩放。
3. **禁用**：新增 `--bew-disabled-opacity`（建议 0.4，对齐 text-4 的观感），替换 5 种字面量。
4. **悬停媒体查询**：`sidebarAction.scss` 用了 `@media (hover: hover)`，`settingsNav.scss` 与 `IconButton` 没有；统一加上，避免触屏点击后残留悬停底。

### P0：`IconButton` 成为唯一的小按钮

现状：`IconButton` 只有形状参数，默认变体没有悬停态，25 个调用方各自写悬停与尺寸；`CloseButton` 则有完整的 plain / floating / overlay 与 small / medium / large。

- 给 `IconButton` 加 `variant: 'plain' | 'filled' | 'overlay'` 与 `size: 'sm' | 'md' | 'lg'`（取 `--bew-icon-button-size-*` 与 `--bew-icon-size-xs/sm/md`），plain 的状态与 `CloseButton` 的 plain 完全一致；`CloseButton` 改为 `IconButton` + × 图标的薄组合，删掉重复的状态样式。
- 圆角沿用 `CloseButton` 的同心写法（宿主设 `--bew-icon-button-radius`），让卡片角落、弹窗顶栏、Composer 工具栏的按钮都与外框同心。

### P1：图标

- 尺寸只用 xs / sm / md / lg 四档，并固定配对：caption 旁 xs、control / body 旁 sm、Dock 与顶栏 md、空状态 lg。扫一遍 `w-*/h-*` 写死尺寸的 `i-tabler:*`，改为 token。
- 激活态只换 filled 版本或颜色，不同时改尺寸与粗细（Apple 的 SF Symbols 习惯）。
- 顶栏字标（`TopBarLogo.vue` 的 `--brand`）悬停时铺满主题色，是全扩展唯一一块悬停大色块，显得突兀；AGENTS 写明字标不变，若愿意调整，建议改成与图标小电视一致的“只换前景色”。

### P1：悬停的节奏

- 行（侧栏、设置导航、顶栏弹窗、菜单）悬停：底色 `fast` 进、`moderate` 出——进入要跟手，离开柔和，指针扫过一列时不会闪成一串。
- 卡片悬停已统一为 `hover-lift`；建议把悬停时才出现的行操作（`.bew-popover__action`）也接上同一淡入时长，并在 `prefers-reduced-motion` 下直接显示。
- 三种卡片放大倍率已是 token（`--bew-card-hover-scale`、`--bew-compact-card-hover-scale`、`--bew-moment-card-hover-scale`）；建议在 `variables.scss` 把它们并排写在一处并注明“按卡片尺寸递减”，以后新卡片按尺寸选用，不再新增。

### P1：布局一致性

- 行高：侧栏操作行 32px（`--bew-sidebar-action-height`）、设置导航行 `--bew-space-8`（同为 32 但另一个来源）。建议设置导航也引用 `--bew-sidebar-action-height`（或抽成 `--bew-nav-row-height`），以后改一处即可。
- 行的水平内距与图标—文字间距（8px）在侧栏、设置导航、顶栏弹窗、右键菜单之间应一致；建议定义 `--bew-row-inline-padding` 与 `--bew-row-gap`，四处共用。
- 区块间距：页面区块 32–48、组件之间 16–24 的规则在资料库头图、播放页右栏、设置分组里分别手写；建议在 `variables.scss` 加 `--bew-section-gap`（32）与 `--bew-group-gap`（16）两个角色 token。

### P2：层级

- 文字层级已很清楚（text-1 / 2 / 3 / 4）。建议再把“次要元信息 + 计数”统一成 caption + text-3 + tabular-nums，一处 mixin（例如 `contentCard.meta`），目前播放页、弹窗行、资料库各写一份。
- 层叠：页面遮暗层、顶栏、弹窗、图片查看器、粒子层的 z-index 已经 token 化；建议在 `variables.scss` 的 Stacking 区按从低到高写一张注释表，新增浮层时对表插入。
- 毛玻璃面积（**需改用户指定项**）：Apple Music 的玻璃只出现在“浮在内容上的东西”。热搜卡片与续读胶囊的玻璃是用户指定的；若愿意调整，可把贴着内容的这两处改为实色，让 Dock 与顶栏成为仅有的悬浮玻璃。

### P2：自动收起

- Dock 自动收起延迟 900ms（`Dock.vue:458`），播放页控制栏 2500ms（`nativeControls.ts:7`），搜索框是指针离开即收（未读到延迟，未核实）。建议统一为同一组判定（指针离开 + 无焦点 + 无打开的浮层），延迟按用途分两档写成常量：导航类（Dock、搜索框）约 900ms、遮挡内容类（播放控制栏）2.5s。
- 收起前的“预示”：不能给玻璃本身降不透明度（会让模糊失效，见 AGENTS 渐变模糊一节）。可以只把 Dock / 控制栏里的图标与文字层降到 0.6，外壳保持不变，指针回来时立即恢复。
- 自动收起的元素在键盘聚焦时永不收起（目前播放页控制栏在弹幕输入期间保持可见，建议推广到 Dock 与搜索框的 `:focus-within`）。

## 验证

- 基线（改动前）：lint、typecheck 通过，`pnpm test` 874 项 PASS。
- 改动后：`pnpm lint` 0 错误、`pnpm typecheck` 通过、`pnpm test` 874 项 PASS（与基线相同，exit 0）；最后一次注释改动后另跑 `verify:ui-scale`、`verify:color-policy`、`verify:style-invalidation` 均通过。
- 未运行：build、实站与浏览器视觉检查。

## 未覆盖

本次没有系统检查以下几类，结论不代表它们干净：

- `storage.ts` 默认值中没有读取方的设置字段，以及 `searchCatalog.ts` 指向不存在的 `data-setting-id` 的条目；
- 没有 `@include` 的 SCSS mixin；
- 逻辑相同但实现分散的重复代码（knip 只查未用，不查重复）；
- 热路径中交错读写布局（只 grep 了监听与轮询，没有逐个读回调）。

## 第二轮：设计收敛落地（2026-11-11）

用户批准：悬停背景收敛、小按钮统一与参数化、P1 / P2 按最优方式修，前提是不改变现有功能、交互与设计。

### 已改

- **状态 token**：删除 `--bew-theme-surface` / `-hover` / `--bew-on-theme-surface` 三个别名（含 `imageTone.scss` 的重定义），50 个文件改用 `--bew-selected-bg` / `--bew-pressed-bg` / `--bew-text-1`，取值完全相同。收藏夹卡片操作在取色状态下的 `fill-3` 覆盖随之并入 `pressed-bg`（取色后 16% 对 15%）。
- **悬停收敛**：静止为透明的 Bewly 控件与行，悬停由 `--bew-fill-1/2` 改为 `--bew-hover-bg`（37 处 CSS + 5 处 UnoCSS + 侧栏停靠按钮）；静止为实色的改用对应的 `*-solid-hover`（`IconButton` filled、通知卡片）；自带 `fill-1` 的填充控件保持 `fill-1 → fill-2`；Dock 收起外壳与 Radio 未动。原生页适配中静止背景来自原站的规则未改。
- **按下与禁用**：新增 `--bew-item-press-scale`（0.94，日期格、表情、点赞）与 `--bew-icon-press-scale`（0.9，Dock 图标、页面模式、停靠侧栏），与原有 `--bew-control-press-scale` 合为三档；38 处禁用态透明度改为 `--bew-disabled-opacity`（0.5，原值 0.45–0.65）。图片查看器与原生页保留原值。
- **`IconButton` 参数化**：`variant`（bare 默认不变 / plain / filled / floating / overlay）与 `size`（sm / md / lg / control，盒子与图标成对）；宿主用 `--bew-icon-button-radius` / `--bew-icon-button-size` 设同心圆角与尺寸（`modalWindow.header`、动态详情的关闭按钮已改名）。`CloseButton` 改为 `IconButton` + × 的薄封装，原有状态样式移入 `IconButton`；`size` 改为 sm / md / lg。原 `class="bew-icon-button--control"` 的 13 处改为 `variant="filled" size="control"`，生成的类名相同。
- **悬停节奏**：新增 `styles/hoverState.scss` 的 `transition`（进入 fast、离开 moderate），用于 `IconButton`、设置导航行、侧栏操作行、`.bew-popover-row`、`.bew-popover__action` 与右键菜单项。顶栏媒体弹窗的行没有接入：行的发丝线淡入淡出要与底色同步。
- **图标尺寸**：日期选择器、用户卡片、设置分组折叠箭头、新版本提示、收藏批量目标、Toast 图标的字面量像素改为 `--bew-icon-size-*`（Toast 与收藏批量的 18px 图标变为 16px）；Toast 关闭与标签移除的 24px 按钮盒改为 `--bew-icon-button-size-sm`。
- **行高**：新增 `--bew-row-height`（32px），侧栏操作行、设置导航行与右键菜单项共用。
- `AGENTS.md` 同步了上述 token 与组件规则。`verify-targeted-fixes.ts` 中两条钉住旧 `fill-2` 与已删别名的断言已更新或删除。

### 评估后不改

- **元信息 mixin**：同时具备 caption、text-3 与 tabular-nums 的规则全仓只有一处（`SearchBar.vue`），抽 mixin 是一次性抽象。
- **层级表**：`variables.scss` 的 Stacking 区已按从低到高排列并注明用途，不再另写。
- **区块间距 token**：现有 `--bew-space-*` 已表达 16 / 32 两档，新增同义 token 没有调用方。
- **自动收起**：Dock 在悬停、键盘聚焦、设置打开、布局编辑时都不收起，播放控制栏在弹幕输入期间常显，搜索框按焦点收起，判定已经一致。延迟（Dock 900ms、控制栏 2.5s）按用途不同，保留。“收起前预示”与“减少常驻玻璃”会改变交互或用户指定的设计，不做。
- **字标悬停**：AGENTS 写明字标样式不变。

### 待审查项的兼容改法

| 项 | 不改变行为的做法 |
| --- | --- |
| 控制栏显隐写 `body` 类（`nativeControls.ts:44`） | `BODY_CLASS` 只在进出播放页时写，保留；把高频切换的 controls-hidden 改为播放器根节点的 `data-bewly-controls-hidden`，`layout.ts:865-888` 的 `body.${BODY_CLASS}:not(.hidden)` 改成 `.${NATIVE_PLAYER_CLASS}:not([data-…])`；`SideBar.vue` 改为订阅同一处发出的事件，不再读 `body.classList`。 |
| 原生页悬停铺主题色（约 30 处） | 逐页对照原站：原站主按钮保留但改用 `--bew-accent-solid`（AGENTS 规定主按钮用它），其余改为 `--bew-hover-bg` + text-1。可先做 `videoPage.scss` 与 `comments.scss`，它们最常见。 |
| 14 处 Observer 存在性判断 | 在 `scripts/sourceModuleHarness.ts` 的默认 globals 里装一次 `ResizeObserver` / `IntersectionObserver` 桩，然后删掉生产代码里的判断与回退分支；生产环境行为不变（这两个 API 必然存在）。 |
| `useDark` 每 30 秒轮询 | 算出到下一个开始或结束时刻的毫秒数，排一次 `setTimeout`；到点、设置改变和 `visibilitychange` 时重排。切换时刻不变，不再轮询。 |
| 三处 window resize | `Ranking` 与 `AllSearchPage` 的列间距改读 `uiPx(GRID_GUTTER)`（随界面缩放响应式更新），宽度只靠已有的 ResizeObserver；`TopBarPinnedChannels` 的容器 ResizeObserver 已覆盖窗口变化，直接删除 window 监听。 |
| 顶栏弹窗的 scroll 触底 | 列表尾部放哨兵，用以列表为 root 的 IntersectionObserver 触发同一个加载函数，删除 `useOptimizedScroll`；同一时刻只有一个弹窗，收益主要是统一机制。 |
| 动态评论 `ref<…[]>` | 改 `shallowRef`，分页追加与回复插入都整体替换数组（`[...old, ...page]`）；单条点赞等字段更新替换该条对象。 |
| `enableCommentReplyTree` 迁移 | 下一个次版本起登记为退役字段并删除迁移；在此之前保留，避免老用户丢失选择。 |
| `--bew-library-filter-radius` | 给 `LibraryFilterMenu` 的菜单容器使用（8 内距 + 8 项圆角 = 16，正是它的定义），或从 AGENTS 与 `variables.scss` 一并删除。 |

### 验证

`pnpm lint` 0 错误、`pnpm typecheck` 通过、`pnpm test` exit 0（874 项 PASS）。未 build，未做视觉检查（悬停颜色、按下缩放与禁用透明度的细微变化需要目测）。

## 第三轮：待审查项落地（2026-11-11）

用户批准按上表的兼容改法完整修改。

- **控制栏显隐不再写 `body`**：`nativeControls.ts` 把状态写在锚定的原生播放器上（`BEWLY_WIDESCREEN_CONTROLS_HIDDEN_ATTRIBUTE` = `data-bewly-controls-hidden`，取代 `BEWLY_WIDESCREEN_CONTROLS_HIDDEN_CLASS`），并发出 `BEWLY_WIDESCREEN_CONTROLS_VISIBILITY` 窗口事件；`layout.ts` 的选择器改为 `.${NATIVE_PLAYER_CLASS}:not([…])` / `[…]`，弹幕玻璃与弹幕宿主按 `#root[data-player-controls-hidden="true"]` 或播放器属性隐藏；停靠的 `SideBar` 订阅该事件，不再观察 `body` 的 class 变化；`clearAnchoredPlayerElement` 一并移除属性。`body` 上只剩进出播放页时写一次的 `bewly-widescreen-active`。
- **原生页悬停**：原站主按钮静止时已是主题色（`--bew-accent-solid` 就是 `--bew-theme-color` 的别名），保留；只在悬停时才变主题色的次要按钮改为 `--bew-hover-bg` + text-1：视频页的复制链接、已关注、充电、笔记工具，观看历史页头按钮与回到顶部，稍后再看页头按钮，播放器 BGM 信息按钮，笔记页“去看视频”。
- **Observer 存在性判断**：14 处全部删除（`VideoCardGrid` 的 `supportsIntersectionObserver`、`LazyPicture` 的立即加载回退、`responsiveImage` 的 window resize 回退等）。测试改由 `scripts/observerFixture.mjs` 在 `verify-selected-p2.mjs` 的 JSDOM 与组件沙箱里装上替身：ResizeObserver 不回调，IntersectionObserver 观察即报告可见（与旧回退的假设一致）；需要别的回答的测试仍自行安装。两个几何夹具补上 `~/constants/globalEvents`。
- **`useDark`**：不再每 30 秒轮询，按开始 / 结束时刻排一次 `setTimeout`，到点、修改时间设置或页面重新可见时重排。测试改为断言 12:00 时唯一的定时器等到 18:00。
- **window resize**：`Ranking.vue` 的列间距改用 `uiPx(GRID_GUTTER)`（即 `--bew-layout-content-gap`），只留 ResizeObserver；`AllSearchPage.vue` 的 `1rem` 间距不随窗口变化，删除监听；`TopBarPinnedChannels.vue` 已有容器 ResizeObserver，删除监听。
- **顶栏弹窗触底**：新增 `composables/useLoadMoreSentinel.ts`（列表末尾的零高哨兵 + 以列表为 root、下方 400px 的 IntersectionObserver；新一页加载后仍在范围内时继续请求），四个弹窗改用它，删除 `useOptimizedScroll.ts`；动态弹窗的阅读书签仍用一个被动 scroll 监听。原来测这个 composable 的用例改为测新 composable 的行为（换节点释放、接近末尾时续请求、销毁后不回调）。
- **动态评论**：`comments` 改为 `shallowRef`，发表回复与删除楼中回复时替换该楼的对象与数组（`Array.prototype.with`），线程状态按 rpid 存放，不受对象替换影响。
- **`enableCommentReplyTree`**：迁移自 2026-07-31 起已运行三个多月，删除迁移并登记为退役字段。
- **`--bew-library-filter-radius` / `-padding`**：筛选菜单是 `ContextMenu`，同心关系已由 `--bew-popover-padding`（8）与 `--bew-surface-radius`（16）表达，两个 token 删除，AGENTS 圆角一节同步。

验证：`pnpm lint` 0 错误、`pnpm typecheck` 通过、`pnpm test` exit 0（874 项 PASS）。未 build，未做视觉与实站检查（播放页控制栏显隐、侧栏跟随、弹窗触底加载与定时深色切换需要目测）。
