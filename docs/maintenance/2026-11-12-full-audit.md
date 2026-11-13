# 全项目审查与已批准项落地（2026-11-12）

承接 [播放页与听视频审查](2026-11-12-playback-audit.md)：用户批准了其中的 10 项待审查与 9 条审美建议（含需要改动用户指定规则的 3 条），并要求覆盖项目其余部分。本文件按批次追加。没有做实站或浏览器视觉检查。

基线（改动前）：`pnpm typecheck`、`pnpm lint`、`pnpm knip` 通过，`pnpm test` exit 0（876 项 PASS）。

## 一、已批准的 10 项

| 项 | 结果 |
| --- | --- |
| 缩放条件从未生效（`layout.ts`） | 删除无效的 `:not([…="true"])`，行为不变。没有改成生效版本：那会改变没人看过的缩放帧。 |
| 右栏取色每帧 9 次命中测试 | 未改。没有性能录制就不调整采样策略，仍列为未验证。 |
| 唱片最大直径是字面量 | 改为 `calc(var(--bew-space-10) * 14 / 13 / 12)`，标准界面尺寸下取值不变，随“界面尺寸”缩放。 |
| 4 个自有元素用省略号 | 改为右端渐隐：新增 `styles/playbackText.scss`（用 `truncateFade.line` / `lines(3)`），由 `layout.ts` 内联。`truncationPolicy` 的整目录豁免没有收窄：策略按行扫描，分不出一行属于原生选择器还是自有选择器。 |
| `#bgm-entry` 固定在窗口右缘 | 未改。原生 BGM 面板是从窗口右缘滑出的抽屉，右栏在左时它盖在视频右侧；该贴哪一侧从源码判断不了，仍待确认。 |
| 订阅合集按钮内距 8px | 改为 12px；悬停底由 `fill-2` 改为 `--bew-hover-bg`（静止为透明的控件的统一悬停，11-11 的收敛没有覆盖到播放页样式）。 |
| `playbackSourceFiles` 清单 | 按原建议不改。 |
| `showVideoWatchedBadge` 的位置 | 见“三”。 |
| `$grid-xxl` | 删除（无使用方）。 |
| 测试输出里的 Vue 警告 | 见“三”。 |

落地时另外发现并修复：`.bewly-widescreen-panel-playlist:has(.video-pod) .bewly-widescreen-sidebar-top` 从未命中（信息区与合集槽是兄弟节点，不是祖先与后代），所以有合集时信息区下方一直是 24px 而不是文档写的 16px。右栏分区改写后这条规则不再需要，已删除。

## 二、已批准的 9 条审美建议

全部落地，均未目测。每条附复现步骤。

### 听视频舞台

1. **标题降级**：标题 display 22/26 → heading 17/22，UP 主行 subheading → callout，唱片到标题 20 → 16；`--listen-disc` 的算式随标题高度一起改。复现：播放页点耳机进入听视频。
2. **歌词景深**：当前行 100%，相邻 60%，再远一行 38%，其余 24%；换行时只改这几行元素的 class，不重渲染列表。复现：打开有 CC 字幕的视频并进入听视频。
3. **光的方向**：唱片高光转到左上—右下一线（`conic-gradient from 265deg`），唱臂投影偏向右下。唱片自身的阴影是共享 token `--bew-shadow-4`，没有改。
4. **色场跟随唱片**：色场两层的旋转不再由 `animation-play-state` 瞬间起停；`ListenTurntable` 的起转 / 停转弹簧每帧发出当前速率（`rate` 事件），`ListenPlayer` 用它设置色场动画的 `playbackRate`，速率到 0 时暂停。没有新增帧循环。复现：听视频时播放 / 暂停，看背景与唱片是否一起起停。
5. **控制栏取舞台色调**：取到封面色后，`ListenPlayer` 把 `--moment-tone` 等写到播放器根节点并加 `data-bew-listen-toned`；`videoPlayer.scss` 用 `imageTone.toned-surface` 在该节点上重定义控制栏读取的全部颜色 token（文字、填充、分隔线、玻璃色调），并补上在 `:root` 或页面上已解析、不会跟着变的几个（`--bew-elevated-alt-solid`、输入框底与边、玻璃边、分段项、`--bewly-widescreen-danmaku-bar-bg`、进度条的轨道 / 缓冲 / 已播三色），所以图标、文字、进度条与菜单一起取黑或白；已播部分用取色的前景色（与深色主题用白色同理），不再是主题色。会话结束（进入离场淡出）时立即还原；B 站重建播放器时取色随舞台宿主写到新的根节点；关闭毛玻璃时玻璃色调本就是实色。只作用于 Bewly 播放页（原生页的控制栏不读这些 token）。复现：浅色主题下对一个深色封面的视频进入听视频，看底部控制栏的玻璃与图标；再打开倍速、音量、设置菜单看文字是否可读。**风险最高的一条**：控制栏里若有没走 token 的原生颜色，会留在原色。

### 右栏

6. **节奏**：三个分区（信息、合集或番剧目录、推荐）之间统一为“通到右栏两端的发丝线，线两侧各 16px”；信息区距顶部发丝线 16px（原 12 + 卡片内距 16）。普通视频页的线由信息区画在自己下方；番剧页由目录第一个分区的上边线承担；没有分集目录的番剧页（如单部电影）信息区与推荐之间只有 32px 间距、没有线。分区标题原本就都是 title + text-1，没有改。
7. **右栏带封面色**：右栏背景为封面平均色的 4%（`--bewly-widescreen-rail-tint`，取色前透明），封面色直接写在右栏元素上（不继承），换视频时缓变。右栏里三处画页面底色的不透明块（评论加载遮罩、高级弹幕无权限遮罩、番剧简介的“展开”底）叠上同一层色。没有按“关闭毛玻璃时不染”处理：右栏本身不是玻璃，关闭毛玻璃后顶部叠层只是不模糊，没有会与染色冲突的实色面。
8. **信息卡平铺**：去掉底色、描边、圆角、阴影与 16px 内距，内容落在内容线上；折叠按钮与折叠行为不变。分享浮层的右偏移去掉了“信息卡内距”。加载骨架同步（`loading.ts`、`cardLayout.ts`）。
9. **阅读行高**：新增 `--bew-line-height-reading`（20px × 字号缩放），用于播放页的视频简介（含折叠后的两行高度与 Bewly 的后备简介）和原生评论正文（经 MAIN world 的样式补丁，限定在 `#bewly-widescreen-root`）。番剧简介保留原站的两行截断几何，没有改；原生长评论的折叠是否按行高计算没有查，列入未验证；动态卡片等其他页面没有改（那里有估高）。

复现（右栏）：打开普通视频页（有合集与无合集各一个）与番剧页，看简介面板的三段与线；换一个封面颜色差别大的视频看右栏底色；展开简介、打开评论看行距。

## 三、项目其余部分

方法是按类别做机械扫描，再读被扫出来的文件。证据等级分三档写，没有读过的不算覆盖。

### 已修复

1. **`showVideoWatchedBadge` 开关归位**（不一致）：它只影响动态卡片，却放在“视频卡片”设置页。移到“Bewly 页面 → 动态页”，搜索目录同步；设置键与文案不变。
2. **`VideoWatchedTag` 的描边**（不一致）：`1px solid text-3` 不属于三种线条角色，改为发丝线 + `--bew-edge-color`。
3. **43 处字面量过渡时间**（不一致）：14 个文件里的 `0.16s / 0.18s / 180ms / 0.2s / 0.28s / 280ms / 300ms` 加 `ease`，改为 `--bew-duration-fast / normal / moderate` 与 `--bew-ease-standard / -out`（≤180ms 归 fast，≤250ms 归 normal，其余 moderate）。时长差不超过 30ms；缓动曲线同时由浏览器的 `ease` 换成了标准曲线（`cubic-bezier(0.22, 0.61, 0.36, 1)`，起步更快、收尾更缓）。Dock 里改到的是回到顶部 / 刷新按钮，不是用户指定原样保留的明暗切换项。涉及 Dock、动态卡片与评论输入、搜索结果页、电竞卡片、设置标签、顶栏置顶频道、版本提示、私信搜索与统计、`LazyPicture`、`SearchBar`。
4. **确认无人引用的样式规则**（不再需要）：`PageAsyncLoading` 的 `__sidebar` / `__cover`、`LibraryWorkspace` 的 `.library-rail-field`（原生 `<select>` 筛选的遗留）、`FavoritesPage` 的 `.content-loading`、`UserCard` 的 `.verify-compact`、`MomentCard` 的 `.moment-card__reserve-mark`、`EsportsMatchCard` 的 `.footer-container`。每个类名在全仓只出现在自己的样式规则里。
5. **无人使用的组件参数**（不再需要）：`IframeDrawer` 的 `title`（没有读取方，也没有调用方传入）。
6. **被注释掉的代码**（过时）：`useDark.ts` 与 7 个原生页样式文件里的旧实现注释块。
7. **UnoCSS safelist**（过时）：`zoom-filled`、`device-tv-filled`、`clock-filled` 三个图标没有任何使用方（Dock 改用自有图形后遗留）。重启 `pnpm dev` 后才反映到产物。
8. **开发构建的 `webNavigation` 权限**（不再需要）：全仓没有调用方。
9. **维护文档索引**（隐藏）：12 份 10-15 至 10-17 的记录在 `docs/maintenance/` 里但没有进 `README.md`，已补上。
10. **测试输出的 Vue 警告**（损坏的夹具）：三个夹具缺少子组件替身（抽屉的 `FrameActions`、首页的 `ContentFilterEntry`、收藏操作里 Tooltip 替身的 `content` / `placement`），子组件在测试中是缺失状态。补上后 18 条警告清零。
11. **播放页一条从未命中的规则**：见“一”末尾。

### 查过、没有问题的

- 设置字段：`storage.ts` 的 221 个字段都在设置界面之外有读取方；8 个没有设置入口的字段是运行状态（已确认版本、倍速、弹幕与字幕状态等），不是偏好。
- 四套 locale：1876 个键完全对齐，没有缺键、多键、空值或英文里残留的中文；按动态拼接前缀核对后没有无人引用的键。
- 后台接口：`messageListeners/api` 的端点都有调用方。
- manifest：`storage`、`alarms`、`cookies`、`declarativeNetRequest`、`scripting` 都有调用方；随包的资源除一张图外都有引用。
- `package.json` 的脚本都指向存在的文件，`scripts/` 里没有无人引用的脚本，`AGENTS.md` 的文档链接都有效。
- 没有未使用的 SCSS 变量与 `@keyframes`；没有 `setInterval`；Bewly 自有样式里的字面量字号只有一处（`UserCard.vue` 的 `0.9em`），没有超过 300ms 的一次性动画（设置搜索命中的闪烁是规则里的例外）。
- 依赖安全：`pnpm audit` 报 2 个 moderate（`glob`、`minimatch`，都在开发依赖链上），`verify:dependency-security` 确认两者都已按精确版本回补。

### 待审查（未改）

| 优先级 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- |
| 中 | `manifest.ts` 的 `web_accessible_resources` | `assets/*` 对 `<all_urls>` 开放，任何网站都能探测扩展是否安装；实际只有 B 站页面里的内容脚本需要。 | 收窄到内容脚本与原生站点的匹配列表。没有改：匹配列表写错会让某个子站的资源加载失败，需要实站确认。 |
| 中 | 搜索结果页（`AllSearchPage`、`EsportsMatchCard`、用户 / 专栏 / 视频 / 直播结果页）与番剧页 | 47 处 `rem` 长度。它们在 Shadow DOM 里取的是 B 站页面根节点的字号，不随“界面尺寸”缩放，也不在间距 token 上；这几个页面是全扩展收敛度最低的部分（另有手写的关注按钮与主题色描边）。 | 换成 `--bew-space-*` / 控件高度 token。数量多且会改变观感，需要目测。 |
| 中 | `scripts/verify-targeted-fixes.ts` | 4549 行、约 1500 条针对源码文字的正则断言。本轮每一处已批准的视觉改动都要同步改断言（共 8 条），其中多数只证明“源码里有这段文字”。 | 按 `AGENTS.md` 的测试质量一节逐步删减：保留权限边界、token 与策略类约束，删除钉住具体声明顺序与数值的。 |
| 中 | `SmoothLoading`、`MomentsLiveRow`、`FavoriteSidebarItem`（两处） | 展开收起用 `grid-template-rows` 的 0fr 挤压，其余 8 处过渡的是测量出的高度（`useMeasuredDisclosure` 一类）。两套机制并存，`AGENTS.md` 在动态卡片一节明确不用 0fr 挤压。 | 统一到测量式；或确认这三处有意保留。 |
| 低 | 重复实现 | `jumpToLoginPage` 7 份、`isPlainObject` 4 份（逐字相同）、`isFestivalPage` 3 份、等级图标表与 `getLvIcon` 3 份、`asRecord` / `isRecord` 15 份（对数组的处理不完全相同）。 | 前四组抽到 `utils/`；`asRecord` 一组语义有差别，合并前要逐个确认。没有改：涉及 20 多个文件和各自的测试替身。 |
| 低 | `UserCard.vue` 与 `AllSearchPage.vue` | 各自手写一份主题色关注按钮（含与底色同色的 1px 边框、`brightness` 悬停），没有用 `Button.vue`。 | 换成 `Button` 的主按钮。 |
| 低 | locale | 34 个文案各有 3 个以上的键（“重试”“关闭”“稍后再看”各 6 个，“全部”7 个；`library_tools.layout_list` 与 `watch_later.layout_list` 同文同义）。 | 按“同一功能用同一个名字”的规则合并到 `common.*`；语义不同的（如开关的“关闭”与按钮的“关闭”）保留。 |
| 低 | `main.scss` 的“破图图标”规则 | 图片地址被注释掉，`::before` 不画任何东西；`assets/broken-image.png` 随包发布但无人引用。规则同时给所有图片加了 `position: relative`。 | 删除 `::before` 与图片文件；`position: relative` 是否有依赖需要确认后再动。 |
| 低 | `ImageViewer.vue` | 打开与关闭时在 `html` 上切换 class，触发一次整页样式重算。 | 低频操作，影响小；要改就把状态写到查看器宿主上。 |
| 低 | 4 个确认对话框（`DislikeDialog` 等） | `modelValue` 同时出现在 `defineProps` 与 `defineModel` 里。 | 只留 `defineModel`。 |
| 低 | `Settings.vue`、`SearchBar.vue` | 3 处字面量 `cubic-bezier(0.16, 1, 0.3, 1)`，是 token 里没有的一条缓出曲线。 | 若有意保留，登记为 `--bew-ease-*`；否则换成 `--bew-ease-standard`。 |
| 低 | `VersionReminder.vue` | 仍有 `z-index: 50`、`min-height: 42px` 与主题色边框（11-11 已列出）。 | 同 11-11 的建议。 |

播放页审查里仍未解决的两项（右栏取色的性能录制、`#bgm-entry` 贴哪一侧）也在这里等决定。

### 没有覆盖的

- **只 grep 过、没有通读**：`src/inject/`（约 9000 行，MAIN world 的样式补丁与桥）、`src/background/`、`src/stores/`、私信目录、`adaptedStyles/pages/`（约 1.5 万行原生页适配）。这些目录只做了本文列出的类别扫描。
- **没有碰**：原生页适配选择器是否仍命中当前 B 站结构；设置搜索目录的条目能否定位；热路径回调内部的读写交错；类型上的 259 处 `any`（集中在评论分页桥、`inject/index.ts`、搜索结果转换与 `topBarStore`）。
- 实站与浏览器检查一律没有做。

## 四、设计建议（其他卡片、布局与交互）

基于源码与 `AGENTS.md`，未目测；只提出，没有改。

1. **搜索结果页接入卡片体系。** 用户高亮卡、电竞卡、番剧结果各写了一套卡片样式与间距。让它们只用 `contentCard.scss` 的两种卡（裸卡、表面卡）：视频与番剧结果是裸卡（封面 + 两行标题 + 一行 caption，与首页同一张），用户与赛事是表面卡（`--bew-surface-radius`、发丝线外缘、内距 16）。搜索结果页会第一次看起来和首页是同一个产品。
2. **空状态去掉插图。** 49 处 `Empty` 里 29 处已是纯文字，其余 20 处（视频网格、顶栏四个弹窗、排行榜等）仍挂 200px 的插图。全部改成纯文字：一行 text-2 的说明加一个透明文字按钮，垂直居中。留白本身比插图更显克制；`assets/empty.png` 可以随之删除。
3. **“观看状态”胶囊与“已关注”同规格。** 现在是 `fill-2` 底加描边；“已关注”是无描边的中性胶囊。两者并排出现在动态卡片上，应是同一种小标记：`fill-1`、无描边、caption、text-2。
4. **一种主按钮。** 关注按钮现在有三种长相（资料卡的大号、紧凑号、搜索页的）。定成一种：控件高、interactive 圆角、`--bew-accent-solid`，已关注后变中性 `fill-1`；悬停用颜色混合而不是 `filter: brightness`。
5. **新版本提示改成中性胶囊。** 左下角的主题色实心块是页面上最重的色块之一，而它只是一条通知。改为与续读按钮同材质的玻璃胶囊（`sidebarSurface.floating`），前面一个 `--bew-accent-marker` 圆点，文字 text-1。主题色回到“主操作与当前位置”这两个用途上。
6. **资料卡里的性别与认证颜色。** `UserCard` 有 6 处字面量颜色（性别的蓝与粉、认证徽标的渐变）。若想更克制：性别图标用 text-3，认证只保留图形、颜色用 text-2；整张卡只剩头像有颜色。
7. **展开收起只有一种手感。** 统一机制（见待审查）之后，所有展开都是同一条曲线、同一个时长、箭头同向旋转，用户在侧栏、设置、播放页和动态里得到同一个反馈。
8. **悬停的“进快出缓”再推广。** `hoverState.transition` 目前用在图标按钮、导航行与菜单项上。动态卡片的操作按钮、搜索结果的行、资料库的侧栏行也接上它，指针扫过一列时不会闪成一串。
9. **听视频的下一步（若喜欢这一轮的效果）。** 歌词当前行可以再加一个 2% 的放大（只动 transform），与景深一起形成“对焦”；暂停时唱片的高光略微变暗，舞台整体进入“静止”的状态。

## 验证

- 基线：`pnpm typecheck`、`pnpm lint`、`pnpm knip` 通过，`pnpm test` exit 0（876 项 PASS，输出里 18 条 Vue 警告）。
- 全部改动后：`pnpm typecheck`、`pnpm lint`、`pnpm knip` 通过；`pnpm test` exit 0（876 项 PASS，Selected P2 689 / 0，Private-message 129 / 0，颜色策略、图标、样式失效、界面缩放与许可检查通过，0 条 Vue 警告）；`pnpm verify:dependency-security` 通过。
- 同步改动的断言 8 条（`verify-targeted-fixes.ts`）：信息卡的卡片表面、信息区下方 24px、右栏“背景透明”、合集上下双线、订阅按钮悬停、简介与评论正文的行高。都是随已批准的设计变更更新，没有为通过测试改回实现。
- 没有运行：build、实站、任何浏览器检查。本轮所有视觉改动（“二”的 9 条、43 处过渡时间、观看状态胶囊描边、订阅按钮）都需要目测；听视频控制栏取色与色场缓变没有测试覆盖。

## 本轮改过的文件

工作区另有其他会话约 240 个未提交文件；下面只是本轮动过的。

- 听视频：`components/ListenPlayer/{ListenPlayer,ListenTurntable,ListenLyrics}.vue`、`constants/globalEvents.ts`、`utils/listenPlayback.ts`、`styles/adaptedStyles/common/videoPlayer.scss`
- 播放页：`utils/bewlyWidescreen/styles/{layout,loading,cardLayout}.ts`、`utils/bewlyWidescreen/videoInfo.ts`、`styles/playbackText.scss`（新增）、`styles/variables.scss`、`styles/_breakpoints.scss`、`inject/index.ts`
- 设置：`components/Settings/PluginComponentsAndPages/Moments/Moments.vue`、`…/VideoCard/VideoCardContentEditor.vue`、`components/Settings/searchCatalog.ts`
- 过渡时间 token 化：`styles/messageSearch.scss`、`components/{LazyPicture,Dock/Dock,SearchBar/SearchBar}.vue`、`components/Settings/components/SettingsToggleTag.vue`、`components/MomentCard/{MomentCard,MomentReplyComposer}.vue`、`components/TopBar/components/TopBarPinnedChannels.vue`、`views/Home/components/VersionReminder.vue`、`views/SearchResults/{pages/AllSearchPage,components/renderers/EsportsMatchCard}.vue`、`views/Moments/Moments.vue`、`views/Notifications/whisper/{PrivateHistorySearchResults,ConversationInsights}.vue`
- 清理：`components/{VideoWatchedTag,IframeDrawer,PageAsyncLoading,LibraryWorkspace}.vue`、`components/UserCard/UserCard.vue`、`views/Favorites/FavoritesPage.vue`、`composables/useDark.ts`、`manifest.ts`、`unocss.config.ts`、`styles/adaptedStyles/common/{topBar,comments}.scss`、`styles/adaptedStyles/pages/{articlesPage,homePage,momentsPage,animePlayback&MoviePage,creativeCenterPage}.scss`
- 测试：`scripts/verify-targeted-fixes.ts`、`verify-style-invalidation.ts`、`verify-player-maintenance.mjs`、`verify-frosted-glass-surfaces.mjs`、`verify-maintenance-integration.mjs`、`verify-home-loading-regressions.mjs`、`verify-favorite-sources.mjs`
- 文档：`AGENTS.md`、`docs/maintenance/README.md`、`docs/maintenance/widescreen-native-adaptation.md`、本文件

## 五、第二轮与第三轮跟进（2026-11-13）

用户批准：其余低优先级待审查项、展开收起机制统一、断言精简、“四”的 9 条设计建议，并要求右栏的封面色更多、更融合。`web_accessible_resources` 不在批准范围内，未动。

新基线（其他会话在此期间有改动）：`pnpm typecheck`、`pnpm lint`、`pnpm knip` 通过，`pnpm test` exit 0（883 项 PASS，Selected P2 696 / 0）。

### 断言精简

规则（已写入 `AGENTS.md` 的“测试质量与 CI”）：

- 对源码文字的肯定式 `assert.match` 删除。它只证明“源码里有这段文字”，每次改写法都要陪改。
- 否定式 `assert.doesNotMatch` 只保留主体是整个文件的，用来守“已移除、不恢复”；对源码切片的否定式删除（切片靠 `indexOf` 锚定，锚点一改就悄悄变成空串）。
- 保留：manifest、locale、`rules.json`、构建与工具配置上的断言；各 policy 扫描；编译后 CSS 与运行结果上的断言；全部行为断言。

做法：给 `assert` 与文件读取加探针实跑一遍，按每条断言的主体是否为仓库源码文字分类，再按 AST 删除语句、只为它们服务的读取和随之变空的循环；不按变量名猜。

| 脚本 | 删除 | 行数 |
| --- | --- | --- |
| `verify-targeted-fixes.ts`（含它引入的两个脚本） | 1311 条 | 4549 → 2646 |
| `verify-sidebar-continuity.mjs` | 267 条 | 1403 → 1000 |
| 另外 9 个 `verify-*.mjs` | 55 条 | — |

- 行为断言的执行次数：主测试链精简前后完全相同（`ok` 16558846、`equal` 76472、`deepEqual` 1238、`rejects` 57、`throws` 21 等）；`verify-targeted-fixes` 少了 31 次 `equal`，全部在 `playbackSource.ts` 的取函数辅助里（被删断言所用的源码切片不再读取），不是行为检查。
- 没剩断言的 3 条测试整条删除，所以 PASS 数从 696 变为 693：`top bar: capsule items fade out, then resize together, then fade in`、`top bar: the avatar circle nudges on hover, opens its panel on click and travels into the panel`、`DOM fixture: photo preview stays above the playback page`（三条都只有源码文字断言）。
- 没有处理：私信、通知夹具等其余脚本（它们的源码文字断言很少）；5 条在循环里对不同主体执行的断言分类不一致，保留。

### 右栏与听视频

- **右栏的封面色更多、更融合。** 原来只是一层 4% 的封面平均色。现在右栏背景是三层：封面平均色，其上是与视频区同一张模糊色场（`--bewly-widescreen-cover-field`），最上盖页面底色，只透出 `--bewly-widescreen-rail-blend`（浅色 14%、深色 16%）。上限按最坏情况算出：纯黑或纯白封面上，次要说明文字 text-3 仍有 4.5:1（浅色 14% 时 4.57:1，深色 16% 时 4.59:1）。色场让右栏带上封面的明暗与色块走向，像一块透着视频光的磨砂玻璃，而不是一层平涂。封面色与色场由 `syncCoverTone` 直接写在右栏元素上，不继承，不触发整栏样式重算。右栏里画页面底色的三处不透明块，以及关闭毛玻璃时，只叠同比例的平铺色 `--bewly-widescreen-rail-tint`。
  - 复现：打开任一普通视频，浅色与深色主题各看一次右栏；换一个封面颜色差别大的视频，看右栏缓变；设置里关闭毛玻璃，右栏应变成平铺的淡色。
- **歌词对焦。** 当前行在不透明之外再放大到 1.02（只动 `scale`），偏宽布局以行的左缘为原点，不向左溢出；减少动态效果时不放大。
- **唱片静止。** 唱片停转（暂停、结束、失败）时盘面高光降到 60%，转起来才全亮，过渡 moderate。
  - 复现：打开听视频，播放 / 暂停各一次，看高光；有字幕的视频看当前行。

### 共享组件与设计建议（“四”的 9 条）

| 建议 | 做了什么 |
| --- | --- |
| 1 搜索结果页接入卡片体系 | 见下文“搜索结果页”。 |
| 2 空状态去掉插图 | `Empty.vue` 删掉插图与 `textOnly` 参数，纯文字成为默认样式（一行 text-2 说明 + 透明文字按钮）；原来带 `text-only` 的 29 处调用全部去掉这个参数（其余 20 处原本就挂插图，现在同样不挂）；`assets/empty.png` 删除。`VideoCardGrid` 的 `textOnlyStates` 保留，它还决定布局与按钮形态，不只是插图。 |
| 3 已看标记与“已关注”同规格 | `VideoWatchedTag.vue`：fill-1 底、无描边、caption text-2、左右 space-2。 |
| 4 一种关注按钮 | `UserCard.vue` 与 `AllSearchPage.vue` 的关注改用共享 `Button`（未关注 primary、已关注 secondary，请求中禁用并 `aria-busy`），删掉两份手写按钮样式。 |
| 5 新版本提示 | `VersionReminder.vue` 改为与重载提示同一种浮动玻璃（`sidebarSurface.material`、玻璃边框、`--bew-glass-shadow`），铃铛换成 `--bew-accent-marker` 圆点，尺寸与偏移改用 token。 |
| 6 资料卡的颜色 | 性别图标 text-3；认证徽标用中性前景画图形（`mask`）。搜索结果的用户卡性别图标同此。 |
| 7 展开收起只有一种 | 见下文“展开收起”。 |
| 8 悬停进快出缓 | 见下文“悬停过渡”。 |
| 9 听视频 | 见上文。 |

- 复现：首页断网或未登录时看空状态（没有插图）；悬停 UP 主头像看资料卡的关注按钮；搜索一个 UP 主名看综合页的用户卡；动态卡片上看“已看”标记。

### 展开收起

`FavoriteSidebarItem`（封面带与操作区两处）与 `MomentsLiveRow`（直播预览）从 `grid-template-rows: 0fr/1fr` 改为 `useMeasuredDisclosure`：外层按测量出的高度过渡，内层自然布局。收藏夹的操作区原来靠一个“时长 + 50ms”的定时器卸载，现在在收起真正结束时卸载；内容只在展开、展开中或收起中才挂载，所以收起的行没有尺寸观察器。收藏夹展开后“滚到完整可见”（`keepSelectionScrollAnchor`）与直播预览的裁切保持不变。

`SmoothLoading` 没有改：共享的测量式展开会给每个列表尾部的加载圆环挂一个尺寸观察器，而它的高度是固定的（最小高度 + 上下内距），换过去只增加开销。

- 复现：收藏页侧栏连续点几个收藏夹（有封面与无封面的各一个），看封面与操作区的展开与收起；动态页侧栏悬停正在直播的行。

### 悬停过渡

`hoverState.transition`（进入 fast、离开 moderate）接到：动态卡片的附加操作、点赞、更多、热评与底栏统计按钮；搜索结果的筛选按钮、分页、“更多赛事”、直播结果的“查看更多主播”；收藏夹操作按钮。资料库其余侧栏行本就走 `sidebarAction.scss`（已用它）。收藏夹行本身的过渡带着取色的颜色过渡（`$tone-transition`），不适合拆成这个 mixin，保留。

### 低优先级清理

- 重复实现：`jumpToLoginPage` 7 份 → `utils/bilibiliLogin.ts`（登录地址常量 `BILIBILI_LOGIN_URL` 同时给 `bilibiliTopBar.ts` 与 `TopBarRight.vue` 用）；`isPlainObject` 5 份 → `utils/plainObject.ts`（`Maintenance.vue` 那份少了 `toString` 判断，统一成严格版本）；`isFestivalPage` 3 份 → `utils/festivalPage.ts`；等级图标表与 `getLvIcon` 3 份 → `utils/lvIcons.ts` 的 `getLvIcon`。顶栏用户面板原来对越界等级返回空串，现在与其他两处一样回退到 LV0（下一级只在未满级时显示，满级不会越界）。新模块都已加入 `scripts/sourceModuleHarness.ts` 的自动提供列表。`asRecord` 一组没动（语义有差别）。
- `main.scss` 的破图 `::before` 删除，`assets/broken-image.png` 删除；同一规则的 `position: relative` 保留（可能有绝对定位的子元素依赖它，未确认）。
- `ImageViewer` 在 `html` 上的 `bewly-image-viewer-open`：没有挪。读它的是 `adaptedStyles/common/comments.scss`，用来锁住 `html` / `body` 的滚动与滚动条，必须写在根节点上；查看器打开 / 关闭是低频操作。
- 4 个确认对话框只留 `defineModel`。
- `cubic-bezier(0.16, 1, 0.3, 1)` 登记为 `--bew-ease-decelerate`（快起、长而软的落地），3 处改用它，曲线不变。
- locale：只合并了一对。`moments.zoom_in` / `zoom_out`（竖屏视频放大）合并到 `image_viewer.zoom_in` / `zoom_out`，四套 locale 文案完全相同、都是“缩放”按钮。其余 77 组同文的键没有合并：多数是同字不同角色（开关的“关闭”与按钮的“关闭”，筛选的“全部”与标签的“全部”），或被设置搜索目录 / 布局编辑当作标识（`watch_later.layout_*`）。
- knip 发现断言精简后留下一个无用导出（`scripts/refactoredSources.ts` 的 `FAVORITES_SOURCE_FILES`），已删除。

### 搜索结果页

- 6 个文件的 `rem` 全部换成 `--bew-space-*`（按 1rem = 16px 等值换算；电竞卡 Logo 下的 6px 是 space-1 + space-0-5，写了原因）。
- 卡片统一成一种表面卡（`--bew-content-solid` 底、surface 圆角、`--bew-hairline` + `--bew-edge-color` 外缘，深色下靠外缘分层）：番剧 / 影视结果卡补上原来没有的外缘，活动卡、用户卡与电竞卡的 `--bew-elevated` 底换成同一表面色；活动卡与电竞卡是链接，用 `contentCard.surface`（悬停上浮 2px 加 `--bew-shadow-1`，减少动态效果时不动），电竞卡原来是字面量阴影与 `translateY(-2px)`。
- 活动封面与番剧 / 影视结果封面加 `contentCard.media-frame`（画在图上的媒体发丝线与媒体阴影）。
- 电竞卡“直播中”从字面量红 `#ff4d4f` + 白字改为 `--bew-error-color-10` 底 + `--bew-error-foreground` 字。
- 结果卡的主按钮（“立即观看”等）从 `--bew-theme-color` 改为主按钮的 `--bew-accent-solid` / `--bew-on-accent-solid`；悬停原来加一圈 1px 描边（违反“悬停不改边框”），改为与 `Button` 相同的颜色混合，按下缩放 `--bew-control-press-scale`。
- 修了一个形状问题：综合页末尾有一条规则把所有卡片与徽标的 `corner-shape` 设为普通平滑圆角，盖掉了胶囊徽标（活动标签、认证、番剧角标、标签）自己的胶囊形状；现在只作用于卡片、封面与按钮。
- 未验证：搜索结果页在 Shadow DOM 里，原来的 `rem` 取的是 B 站页面根节点字号，B 站若改过根字号，换成 token 后间距会与之前不同（更可能是更统一）。需要目测。
- 复现：搜索一个番剧名（番剧卡、按钮）、一个活动或游戏名（活动卡）、“英雄联盟”（电竞卡）、一个 UP 主名（用户卡），浅色与深色各看一次，悬停卡片与按钮。

### 验证（第二轮）

- 第一批改动（空状态、右栏、听视频、关注按钮、资料卡、版本提示、已看标记）之后：`pnpm typecheck`、`pnpm lint` 通过，`pnpm test` exit 0（880 项 PASS，Selected P2 693 / 0，Private-message 129 / 0；比基线少 3 项是断言精简时整条删除的 3 条测试）；`knip` 报一个精简后留下的无用导出，已删。
- 全部改动之后：`pnpm typecheck`、`pnpm lint`、`pnpm exec knip` 通过，`pnpm test` exit 0（880 项 PASS，Selected P2 693 / 0，Private-message 129 / 0）。其后又按复核改了四处小地方（搜索结果卡的外缘、直播行的初始状态、一处 Sass 声明顺序），重跑 `pnpm typecheck` 通过，`verify:selected-p2`（693 / 0）与 `verify:targeted-fixes` 通过。
- 最后补上顶栏四个弹窗的空状态文字后，再跑一遍：`pnpm lint`、`pnpm exec knip` 通过，`pnpm test` exit 0（880 项 PASS，Selected P2 693 / 0，Private-message 129 / 0）；`pnpm typecheck` 在最后一处模板改动前通过，之后没有重跑。
- 构建没有验证：用户的终端里当时没有在跑 `pnpm dev`，也没有运行 build（`constants/pageBridge.ts` 等文件新引入了共享模块，打包是否正常需要 `pnpm dev` 产物确认）。
- 本轮改过的 21 个样式块都用 Sass 单独编译过一遍：没有错误，也没有“嵌套规则之后的声明”一类警告。
- 为通过测试改的夹具（都没有改回实现）：两个测试的组件夹具表补上 4 个新的共享模块（`verify-selected-p2.mjs` 的自动提供列表、`scripts/sourceModuleHarness.ts`）；`verify-advertising-rules.mjs` 的等级图标替身改为 `getLvIcon`；`verify-four-features.mjs` 从共享模块取 `isPlainObject`；`verify-platform-compatibility.mjs` 不再钉住“250ms 定时器”，改为验证收起时操作区仍在、收起结束后卸载；`verify-favorite-sources.mjs` 的空状态检查去掉插图分支；`verify-notification-fixtures.ts` 改为“空状态没有 `<img>`”。
- 中途一次被打断的运行里出现过 `loading: native controls wait…` 失败（`'' !== '176px'`），干净重跑后没有再出现；相关源码（`geometry.ts`）本轮没有改动。
- 没有运行：build、实站、任何浏览器检查。本节所有视觉改动都需要你目测（复现步骤见各节）。

### 与描述有出入的地方

- 空状态：49 处里原来 29 处带 `text-only`，这次全部去掉；插图在所有空状态里都不再出现。但有 10 处在插槽里放了实心主按钮（`VideoCardGrid` 的默认形态 3 处、番剧页 3 处、番剧时间表 1 处、推荐 2 处、排行榜 1 处），它们仍是“说明 + 实心按钮”，不是透明文字按钮。是否统一成文字按钮列在“六”里。
- 顶栏的收藏、稍后再看、观看历史与动态四个弹窗，原来的空状态只有插图、没有文字；去掉插图后会是一块空白，所以补上了 `common.no_data`（“暂无数据”，四套 locale 已有）。说明文字统一为 text-2（原来纯文字形态是 text-3）。
- 设计建议 1 只做了“表面卡”这一半（结果卡、活动卡、用户卡、电竞卡统一表面、外缘与悬停）；视频与番剧结果改成首页同款裸卡（封面 + 两行标题 + caption）没有做，它要改模板结构。
- 番剧页（`views/Anime/`）还有 28 处 `rem`，不在这次“搜索结果页”的范围内。

### 本轮（第二轮）改过的文件

工作区另有其他会话的未提交文件；下面只是第二轮动过的。

- 播放页与听视频：`utils/bewlyWidescreen/styles/layout.ts`、`utils/bewlyWidescreen/videoInfo.ts`、`components/ListenPlayer/{ListenPlayer,ListenLyrics,ListenTurntable}.vue`
- 共享组件：`components/{Empty,VideoWatchedTag,VideoCardGrid}.vue`、`components/UserCard/UserCard.vue`、`views/Home/components/VersionReminder.vue`、`components/VideoCard/VideoCardContextMenu/components/{Dislike,FollowUserConfirm,UnfollowUserConfirm,BlockUserConfirm}Dialog.vue`
- 空状态调用方：`components/TopBar/components/pops/WatchLaterPop.vue`、`views/Favorites/{FavoritesPage,FavoriteFolderEditor}.vue`、`views/History/History.vue`、`views/WatchLater/WatchLater.vue`、`views/Notifications/whisper/{WhisperWorkspace,ConversationView,ConversationOriginalFallback}.vue`
- 展开收起与悬停：`views/Favorites/FavoriteSidebarItem.vue`、`views/Moments/MomentsLiveRow.vue`、`components/MomentCard/MomentCard.vue`
- 搜索结果页：`views/SearchResults/pages/{AllSearchPage,ArticleSearchPage,LiveSearchPage,UserSearchPage,VideoSearchPage}.vue`、`views/SearchResults/components/{Pagination.vue,searchFilters.scss,mediaResults.scss,renderers/EsportsMatchCard.vue}`
- 共享工具（新增 `utils/{bilibiliLogin,plainObject,festivalPage}.ts`）与替换处：`utils/{lvIcons,bilibiliTopBar,filterRules,pageSettingsProtocol,iframeMessage,verticalVideoZoom}.ts`、`constants/pageBridge.ts`、`composables/useDark.ts`、`contentScripts/index.ts`、`views/necessarySettingsWatchers.ts`、`views/Home/{useForYouRecommendations.ts,components/Live.vue,components/SubscribedSeries.vue,components/Following.vue}`、`components/TopBar/components/{TopBarRight.vue,pops/UserPanelPop.vue}`、`components/Settings/Advanced/Maintenance.vue`、`components/Settings/Settings.vue`、`components/SearchBar/SearchBar.vue`
- 样式与资源：`styles/{variables,main}.scss`；删除 `assets/empty.png`、`assets/broken-image.png`
- locale：`_locales/{cmn-CN,cmn-TW,en,jyut}.yml`（删去 `moments.zoom_in` / `zoom_out`）
- 测试：`scripts/verify-targeted-fixes.ts`、`verify-moment-player-ports.ts`、`verify-functional-audit-fixes.ts`、`verify-sidebar-continuity.mjs` 等 13 个断言精简的脚本（见“断言精简”），以及 `refactoredSources.ts`、`sourceModuleHarness.ts`、`verify-selected-p2.mjs`、`verify-advertising-rules.mjs`、`verify-four-features.mjs`、`verify-platform-compatibility.mjs`、`verify-favorite-sources.mjs`、`verify-notification-fixtures.ts`
- 文档：`AGENTS.md`、`docs/maintenance/{README,widescreen-native-adaptation}.md`、本文件

### 第三轮：按用户的 16 项清单实施

本轮沿用 `message_feature`，保留其他会话的未提交修改；没有 commit、push、build、启动 watcher 或操作浏览器。实现结束后集中运行检查，检查进程结束前不修改源码。清单第 15 项按本次“完整完成优化”的授权落地；本节以用户清单编号为准，与“六”的旧提案编号并不完全相同。

| 用户清单 | 实施结果 |
| --- | --- |
| 1 评论图片热路径 | 图片监听并入既有几何目标收集；只跨越已知评论、富文本、图片、头像 Shadow 宿主，不再分别两遍 `querySelectorAll('*')`。保留线程 AbortController、晚到图片补挂和 WeakSet 去重，没有新增 Observer 或轮询。 |
| 2 无效楼主回退 | 注入代码从 renderer 的 ShadowRoot 读取 `bili-comment-user-info`；同结构 DOM 夹具确认 document 查询不可穿透它。删除 document 回退，继续使用组件数据登记的、按 oid 与 root 区分的楼主缓存。 |
| 3 稍后再看浅响应 | 确认 `WatchLaterPop`、`WatchLater`、`WatchLaterGridCard` 不原位修改条目字段后，将 store 列表改为 shallowReactive；splice/push、分页与删除协议保持原状。 |
| 4 参数名 | `textOnlyStates` → `inlineStates`，同步收藏调用方与长列表夹具；不再用“只有文字”命名布局行为。 |
| 5 对象语义 | 15 份局部定义移到 `plainObject.ts`。记录排除数组，对象允许数组；分别提供判断与读取形式。设置数组、动态属性读取和 Error 实例保留原语义，消息/API 记录拒绝数组。严格原型检查仍独立使用 isPlainObject。两套夹具自动依赖表已核对，补齐相对路径读取。 |
| 6 固定加载高度 | SmoothLoading 由控件高度、上下内距与调用方最小高度计算固定高度，过渡 height；保留圆环闭合后收起、keepSpace 和减少动态效果，不增加测量或尺寸观察器。 |
| 7 locale 合并 | 四套文案和角色均相同的 8 组：三组批量操作归 common，未知用户归 notifications，四组动态/直播标签归 moment_card。调用方与两处按文案选择按钮的夹具同步；设置定位标识未参与合并。 |
| 8 搜索浮层时长 | 240ms 改为 normal token 的 200ms，曲线不变；需目测稍快的开合节奏。 |
| 9 数据边界类型 | 顶栏动态原始行/页面/展示项、直播行、搜索各类转换输入及代表作输出补齐类型；稍后再看沿用已有 VideoItem。原生评论分页传输和缓存改用 unknown 字段记录，禁止数组冒充评论行；没有全面改写原生组件内部接口。 |
| 10 图片定位 | 媒体发丝线挂在容器，头像等自身需要定位的元素已有局部规则；删除破图伪元素遗留的全局 img position:relative。 |
| 11 搜索间距 | 外层结果网格统一用 grid gutter。发现综合页 JS 仍用 document 根字号计算赛事/代表作间距，改为 uiPx(GRID_GUTTER)，卡片最小宽度也按界面尺寸换算。相关骨架同步。 |
| 12 设置定位 | 新增目录/声明目标的语义交叉检查：264 个入口都能在所属路由找到目标或条件父控件，包含循环配置、外部常量、懒加载子页和布局编辑别名。既有真实 Settings 组件的异步定位、折叠展开、焦点和取消行为回归继续通过。 |
| 13 收藏悬停 | 行外层保留封面取色过渡，现有 trigger 层单独接 hoverState 的进快出缓；不添加玻璃、观察器或额外 DOM 层。 |
| 14 空状态按钮 | 清单中的 VideoCardGrid、番剧、时间表、推荐和排行榜入口统一使用 Empty 的 action-label。VideoCardGrid 连同尾部失败/无更多两个分支一起处理，按钮继续调用原处理函数。 |
| 15 首页同款卡片 | 视频本来就在复用 VideoCardGrid，保留。综合、番剧、影视三处海报展示收敛到 SearchMediaCard + 共享 BangumiCard；标题两行、caption 一行，简介/标签保留在共享悬停/聚焦层，选集使用 MediaEpisodeSelect 的紧凑形态。原链接、分组与综合页截取数量保留，每项只走对应类别的一次转换。删除退役的横卡骨架与样式，首页排行榜和搜索共用海报网格及可缩放最小宽度 token。 |
| 16 番剧 rem | 替换 Anime 下 28 处 rem：27 处横向卡片宽度/留白使用 space-6，一处时间线定位使用 space-1 与发丝线。 |

类型补齐还暴露了代表作的接口问题：搜索转换返回数字秒数及 durationStr，UserCard 却把 duration 当作显示字符串。现在优先使用 durationStr，数字秒数走共享时间格式化，已有字符串时长仍可使用。

#### 评论调用计数

同一 JSDOM 夹具：12 条回复、26 张未完成图片，连续更新 10 次。这里只记录调用和查询返回数量，不推算耗时或内存收益。

| 指标 | 改前 | 改后 |
| --- | ---: | ---: |
| querySelectorAll 调用 | 1,670 | 850 |
| 查询返回节点累计数 | 12,520 | 920 |
| `*` 查询调用 | 830 | 0 |
| 图片 load/error 监听注册 | 52 | 52 |

行为夹具另外覆盖了晚到图片只新增一对监听、线程释放后图片事件不再调度，以及楼主缓存的 oid/线程隔离。

#### 验证结果与边界

- 最终 `pnpm typecheck`、`pnpm lint`、`pnpm exec knip` 全部 exit 0。
- 最终 `pnpm test` exit 0：884 项 PASS、0 FAIL；Selected P2 697 / 0，Private-message 129 / 0。相对清单基线 880 增加评论图片、楼主身份、设置目录和搜索海报卡四条行为/契约检查。
- 23 个相关 Sass 样式块单独编译通过，无样式警告。`git diff --check` 通过。
- 修过的夹具问题：旧 locale 键；新增共享依赖与搜索卡片依赖；提取函数缺少对象判断；目录夹具漏读外部配置与懒加载组件。Vue compileScript 会修改共享解析缓存，目录检查改用独立 parser filename，孤立运行和完整运行均通过。没有把实现改回旧写法。
- 设置目录检查验证的是路由与控件 ID 声明契约，导航时序另有实际组件回归；它不等于逐个设置页面做过浏览器联调。
- 未运行生产 build，没有实站视觉验收或性能录制。未启动、停止或重启用户的 dev watcher。

#### 视觉复核步骤

1. 搜索视频、番剧/影视、UP 主、专栏和直播，切换标准/紧凑界面尺寸，检查网格间距、两行标题与一行 caption；打开选集验证原剧集链接。简介/标签在海报悬停或键盘聚焦时查看。
2. 在设置中搜索消息提醒、动态筛选、条件子项和开发构建号；检查选中结果后的滚动/高亮及关闭父开关时的回退提示，同时感受搜索浮层 200ms 开合。
3. 扫过收藏夹侧栏并切换有封面/无封面的收藏夹，检查悬停进快出缓与取色过渡互不抢时长。
4. 在推荐、番剧、时间表、排行榜和视频网格的空/失败状态点击透明文字操作；列表加载结束时检查圆环闭合后收起，开启减少动态效果再看一次。
5. 打开番剧页，检查横向卡片、时间表及各界面尺寸下的留白；有较多图文回复的视频可检查图片晚加载后楼中楼连线及楼主标识。

### 右栏混合集合卡片尺寸修复（2026-11-13）

- 原因：含分 P 视频的小节已切为一行一个视频，但封面在上的卡片样式只命中 `.multi-p`；同小节的无分 P 视频仍使用横向 120px 缩略图行。
- `styles/layout.ts` 让这类小节的每个合集项共用左右等分的网格；有分 P 的包装跨满一行，其内部沿用同样两列。所有左侧卡片共用铺满列宽的 16:9 封面、两行标题预留高度与 caption 统计行，无分 P 时右侧留空，有分 P 时保留原分集滚动列表。
- 只改 CSS，不搬动原生节点，不更换点击处理，不新增观察器、状态或请求；全是单视频的合集和独立多 P 视频保留原布局。
- 验证：本次样式文件 ESLint、`pnpm verify:style-invalidation`（22 个全局样式、263 个组件与播放器 CSS）和 `git diff --check` 通过；临时 DOM/CSS 夹具确认混合项的列定义、封面/标题/信息区样式一致，分集列表继续滚动，纯单视频合集与独立多 P 布局未变。夹具没有像素布局引擎，不算浏览器视觉验收；未运行全套测试、typecheck 或 build，未操作浏览器和 dev watcher。
- 视觉复核：打开同一小节混有单视频与多 P 视频的合集，对比封面宽高、标题区与统计行；缩窄窗口、切换界面尺寸后再看一次；点击左右两种视频卡片和分集项，确认导航与当前播放标记，并滚动较长分集列表。

## 六、优化提案与跟进状态

以下两表保留第二轮结束时的提案，按“能否只凭源码定下来”分两栏；第三轮实施后的状态见本节末尾，不能再把表内的旧现状当作当前源码。

### 源码可定

| # | 位置 | 现状 | 建议 |
| --- | --- | --- | --- |
| 1 | `inject/index.ts` 评论组件更新（约 1420 行 `listenImages`） | 每次评论组件更新都对整棵子树跑 `querySelectorAll('*')` 找 Shadow 宿主，再补挂图片监听；楼层多、图片多时这是更新热路径上的全树遍历。 | 只遍历已知会带图片的宿主（`bili-rich-text`、评论图片容器），或在 MutationObserver 的新增节点上增量补挂。改前后用同一页评论做一次调用计数对比。 |
| 2 | `inject/index.ts` `tryResolveRootAuthorFromDom` | 用 `document.querySelectorAll('bili-comment-user-info')` 找楼主，但这个元素在评论组件的 Shadow DOM 里，从 document 查不到，这条回退很可能从不命中。 | 确认后删除这条回退（或改为从已登记的线程数据取）。若实站确认它确实找不到，删除即可，属于死代码。 |
| 3 | `stores/topBarStore.ts` `watchLaterList` | 稍后再看列表是深响应式 `reactive<VideoItem[]>`，而 store 里只做整项的 `splice` / `push`。`AGENTS.md` 要求大列表用 `shallowReactive` / `shallowRef`。 | 改为 `shallowReactive`，先确认三个消费方（`WatchLaterPop`、`WatchLater`、`WatchLaterGridCard`）不原位修改条目。 |
| 4 | `VideoCardGrid.vue` 的 `textOnlyStates` | 空状态已经全部是纯文字，这个参数名不再说明它做什么（它现在只决定铺满布局、文字按钮与是否显示“没有更多”）。 | 改名为表达行为的名字（如 `inlineStates`），调用方只有收藏页一处与一个测试。 |
| 5 | `asRecord` / `isRecord`（15 份） | 对数组的处理不完全相同（有的放行数组，有的不放行）。本轮只合并了逐字相同的 `isPlainObject`。 | 逐个看调用点是否会收到数组，分成“记录（不含数组）”与“对象（含数组）”两个函数放进 `utils/plainObject.ts`。 |
| 6 | `SmoothLoading.vue` | 仍是 `grid-template-rows` 0fr 收起，是项目里最后一处。 | 它的高度固定，可以直接过渡一个已知的 `height`（最小高度 + 内距），不需要测量也不需要观察器，从而去掉 0fr。 |
| 7 | locale 同文键（77 组） | 本轮只合并了 1 对。 | 对“同一功能、同一角色”的几组（批量管理 / 全选 / 取消全选在收藏与稍后再看、`notifications.*.unknown_user`、动态侧栏与卡片里的“正在直播 / 人气”）合并到共用命名空间；需要同时改调用点与 `verify-september-adaptation.mjs` 里按文案找按钮的一处。 |
| 8 | `Settings.vue` 搜索浮层 | 时长写死 `0.24s`，不在动效 token 上。 | 换成 `--bew-duration-*` 里最近的一档（200 或 300ms），这会让它略快或略慢，属于观感改动，可与第 14 条一起目测。 |
| 9 | 类型上的 `any`（约 259 处） | 集中在评论分页桥、`inject/index.ts`、搜索结果转换与 `topBarStore`（`moments` 是 `any[]`）。 | 先给 `topBarStore` 的动态与稍后再看条目、搜索结果的转换加类型，它们是数据进入 UI 的边界。 |
| 10 | `main.scss` 的 `.bewly-wrapper img { position: relative }` | 给扩展里每张图片都建一个定位上下文，原本是给已删除的破图 `::before` 用的。 | 查出依赖它的绝对定位子元素（图片本身没有子元素，依赖的只可能是 `::after` 媒体边框，它们都挂在容器上）；确认无依赖就删除。 |

### 需你目测或实站

| # | 位置 | 要决定什么 | 你需要看的 |
| --- | --- | --- | --- |
| 11 | `manifest.ts` 的 `web_accessible_resources`（上一轮遗留） | `assets/*` 对 `<all_urls>` 开放，任何网站都能探测扩展是否已安装。收窄到 B 站域名能防探测，但匹配列表写错会让某个子站的资源加载失败。 | 收窄后在主站、直播、专栏、空间、会员购等子站各打开一页，确认图标与字体正常。 |
| 12 | 播放页 `#bgm-entry`（上一轮遗留） | 视频里的背景音乐入口贴视频区哪一侧：左上（与音乐、全景入口一起）还是右上（页面组下方）。 | 打开一个带 BGM 的视频，两种放法各看一次。 |
| 13 | 右栏取色的性能（上一轮遗留） | 标签文字按下方内容取黑或白（`railHeadTone.ts`），每次滚动帧会做三次 `elementsFromPoint`；本轮右栏又加了一层模糊色场背景。没有录制过真实开销。 | 用 Performance 面板在长评论区滚动 10 秒，看 `railHeadTone` 与右栏背景的绘制耗时；超过 1ms / 帧再考虑节流到滚动结束。 |
| 14 | 本轮全部视觉改动 | 右栏三层背景的浓度（14% / 16%）、歌词放大、唱片静止高光、关注按钮、玻璃的新版本提示、空状态、搜索结果卡片的表面与悬停。 | 按“五”里各节的复现步骤看；觉得右栏太浓或太淡，只需改 `--bewly-widescreen-rail-blend` 两个值（上限见上文）。 |
| 15 | 搜索结果页的间距 | `rem` 换成 token 后的实际间距取决于 B 站页面的根字号（以前随它，现在不随）。 | 综合、视频、专栏、直播、用户五个结果页各看一次，间距是否比以前更整齐或更挤。 |
| 16 | 原生页适配的选择器 | `adaptedStyles/pages/` 约 1.5 万行，是否仍命中当前 B 站结构从没有系统核对过。 | 需要实站逐页打开；建议先挑访问最多的五个页面（首页、播放、空间、动态、搜索）做一次。 |
| 17 | 设置搜索目录 | `searchCatalog.ts` 的条目能否都定位到实际控件，没有自动检查覆盖“定位成功”。 | 在设置里随机搜十个条目，看是否滚动并高亮到正确的行；若有失败的，可以补一条遍历目录的自动检查。 |
| 18 | 收藏夹行的取色过渡 | 行本身的过渡带着封面取色的颜色过渡，没有接“进快出缓”的悬停，悬停离开比其他侧栏行快。 | 在收藏侧栏里扫过一列，与观看历史的侧栏行对比；若觉得不一致，再把取色过渡与悬停过渡拆到两层元素上。 |
| 19 | 10 处空状态的实心按钮 | `VideoCardGrid` 默认形态、番剧页、番剧时间表、推荐、排行榜的空状态仍在插槽里放实心主按钮（“刷新”“登录”）。其余空状态已是透明文字按钮。 | 看一下首页推荐断网 / 未登录时的空状态；若要与其余一致，把它们换成 `Empty` 的 `action-label`。 |
| 20 | 搜索结果里的视频与番剧（设计建议 1 的另一半） | 本轮只统一了表面卡（结果卡、活动卡、用户卡、电竞卡）。视频与番剧结果还不是首页同款裸卡（封面 + 两行标题 + caption）。 | 改动模板结构，需要你确认要不要让搜索结果看起来与首页卡片完全一致。 |
| 21 | 番剧页（`views/Anime/`）的 28 处 `rem` | 与搜索结果页原来的问题相同：取 B 站页面根字号，不随“界面尺寸”缩放。 | 换成 token 后看番剧页的间距是否仍然合适。 |

### 第三轮完成后的状态（2026-11-13）

- 原提案 1—10：已完成，对应“五 / 第三轮”的用户清单 1—10。
- 原提案 15、17—21：已完成源码和自动检查，对应用户清单 11—16；视觉结果仍按上述步骤由用户验收。
- 原提案 11—14、16：不在本次 16 项清单中，未扩展到资源权限、BGM 入口位置、右栏实站性能录制或原生全站选择器核验；原待确认状态保留。
- 后续用户反馈：右栏混合集合卡片尺寸已按“五 / 右栏混合集合卡片尺寸修复”统一，源码与 DOM/CSS 检查完成，视觉复核由用户完成。
