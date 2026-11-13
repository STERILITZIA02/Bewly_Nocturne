# 播放页与听视频审查（2026-11-12）

承接 [2026-11-11 全项目审查](2026-11-11-project-audit.md)：那一轮已做完 knip、locale 键、token 与交互状态收敛，这一轮只看它列为“未覆盖”的几类，以及用户点名的播放页布局一致性和 11-10 新写的听视频舞台、右栏取色。方法是源码扫描与逐段阅读；没有做实站或浏览器视觉检查。

> 后续：下面的 10 项待审查与 9 条审美建议已在同日获批并落地，结果见 [全项目审查与已批准项落地](2026-11-12-full-audit.md)。本文件保留为当时的记录，其中“信息卡”“24 / 16+线+16 / 24”等描述已被取代。

## 结论

- 工作区的测试是坏的：`pnpm test` 有 37 项失败，全部来自同一处夹具缺口（见“已修复 1”）。修复后 876 项通过。
- 播放页样式（`styles/layout.ts`，约 6800 行）在字号、间距、圆角、颜色与时长上没有字面量越界：没有字面量字号；100 处字号声明里 70 处配同名行高 token，16 处所在规则不设行高，14 处是单行原生控件、用控件高度作行高来垂直居中；非 4px 网格的长度只有三处且各有原因（单选圆点 1.5px 边、B 站虚拟列表的 71px 行距、注释）。问题集中在别名、死属性与 11-10 的新代码上。
- 内容线：右栏面板的水平内距都从 `--bewly-widescreen-panel-inline` 或页面内距派生（面板本身、弹幕面板、评论输入框），原生列表再以 space-1 内收回内容线，番剧目录用 `panel-inline + space-1 − space-4` 抵掉原生的 16px；其余水平内距是卡片内距（16）与控件自身的内距（8 / 12），没有发现另起一条线的块。
- 右栏位置：几何依赖右栏在哪一侧的规则有四组（外壳网格、背板留边、右栏与视频之间的竖线、分享浮层），都有 `[data-sidebar-position="left"]` 的对应。
- 加载骨架的类名与样式一一对应（`loadingView.ts` 创建的类都有规则，反之亦然）。

## 已修复

1. **测试加载器不认带扩展名的导入**（损坏）。`src/utils/reducedMotion.ts` 的导入在 11-11 改成了 `./cssSelectors.ts`（Vite 的样式拆分由 Node 直接加载它，需要写出扩展名），`scripts/sourceModuleHarness.ts` 自动提供依赖时只认不带扩展名的写法，所有间接依赖 `reducedMotion` 的夹具都报 `Missing test dependency: ./cssSelectors.ts`。加载器现在同时识别 `./<name>.ts`。
2. **唱针落下被进度事件打断**（损坏，11-10 引入）。`ListenTurntable.vue` 的 `moveArm` 在“只是进度前进”的分支里也取消正在进行的摆动；`timeupdate` 约每 250ms 一次，落针的 300ms 动画几乎总会被截成跳变。现在进度只写目标角度，飞行中的摆动继续并落在刚写入的位置；只有新的摆动（抬起、落下、拖动进度）才取代旧的。
3. **右栏取色的重复计算**（低效，11-10 引入）。`railHeadTone.ts` 每个采样帧在 9 个点上各走一遍元素栈，并对栈里每个元素读一次计算样式；9 个点的栈大部分相同。现在每个元素每帧只读一次（按元素缓存这一帧的颜色层），结果不变。
4. **听视频控件没有跟上 11-11 的状态收敛**（不一致）。重试按钮从 `fill-2 → fill-3` 改为自带填充控件的 `fill-1 → fill-2`；歌词语言按钮改用 `IconButton` 的 `plain` 变体（原先自己写了一份常态与悬停）；语言菜单行的高度改用 `--bew-row-height`；三处悬停接上 `hoverState.transition`（进入快、离开缓）。
5. **播放页的本地颜色别名**（不一致）。`--bewly-widescreen-text-primary / -secondary / -muted` 与 `--bewly-widescreen-control-bg / -control-hover-bg` 只是 `--bew-text-1/2/3`、`--bew-fill-1/2` 的转发，带着校准前的旧回退色，21 处使用，而同一文件直接用共享 token 的有 206 处。21 处都在 `#bewly-widescreen-root` 之内；播放页样式里唯一重定义这些 token 的是右栏标签上的 `--bew-text-3`（取色时），这 21 处都不在标签之内，取值完全相同；已全部换成共享 token 并删除别名，`verify-targeted-fixes.ts` 中钉住别名的 3 条断言同步。
6. **无人读取的属性与文案**（不再需要）。`--bewly-widescreen-sidebar-border`、`--bewly-widescreen-divider`（只定义、无读取方）；locale 键 `watch_later.sort_order`（四套同步删除，分组标题已改用 `library_tools.filter_sort`）。
7. **播放页维护文档的“当前契约”**（不一致）。[widescreen-native-adaptation.md](widescreen-native-adaptation.md) 仍写着视频区约占 50%、信息模块在标签栏上方、控制栏有“首页”按钮、`oled-dark`、“选集”标签、推荐是 120px 行，都已被取代。改为当前事实，并指明视觉细节以 `AGENTS.md` 为准。

## 待用户审查

没有改：涉及观感、产品决定，或无法从源码证明。

| 优先级 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- |
| 中 | `styles/layout.ts` 的 `.bewly-widescreen-native-player[data-bewly-display-mode="card"]:not([data-bewly-zooming="true"])` | 缩放属性用 `toggleAttribute` 写入，值是空串，`:not([…="true"])` 永远成立，“缩放中不画留边底色”的条件从未生效（同文件其余规则都写存在性 `[data-bewly-zooming]`）。现状是缩放期间播放器根节点仍画留边底色。 | 二选一：删掉这个无效条件（行为不变）；或改成 `:not([data-bewly-zooming])` 让原意生效，这会改变缩放期间的画面，需要目测卡片 ⇄ 铺满。 |
| 中 | `railHeadTone.ts` | 每个滚动帧仍有 9 次 `elementsFromPoint`。评论面板的原生树很深，没有做性能录制，不知道实际耗时。 | 在长评论区滚动时录一次性能；若超出预算，把采样点减到每个标签 1 个，或只在滚动停止后采样（颜色切换会晚一拍）。 |
| 中 | `ListenPlayer.vue` 的 `--listen-disc` | 唱片最大直径 560 / 520 / 480px 是字面量，不随“界面尺寸”因子缩放；其余布局长度都经 `ui()`。在缩小界面的外接屏上，唱片相对控制栏与右栏偏大。 | 若希望随界面缩放，改为 `calc(var(--bew-space-10) * 14 / 13 / 12)`（取值相同，随因子变化）；若视为内容最大宽度（规则里不缩的一类），保持不变。 |
| 中 | `styles/layout.ts` 的 `.bewly-widescreen-fallback-stat`、`-stat-label`、`-fallback-owner-name`、`-fallback-description` | 4 个 Bewly 自己的元素用省略号截断。`truncationPolicy` 把 `utils/bewlyWidescreen/` 整体豁免（为了原生节点），自有元素也被放过。 | 这 4 处改成与 `truncateFade` 相同的右端渐隐；并把豁免收窄到原生选择器。 |
| 低 | `styles/layout.ts` 的 `#bgm-entry`（原生 BGM 信息面板） | 固定在窗口右缘（`right: space-4`），不随右栏位置变化：右栏在右时盖在右栏上，右栏在左时盖在视频右侧。 | 确认是否希望它始终贴着右栏一侧；需要的话加 `[data-sidebar-position="left"]` 的对应。 |
| 低 | `styles/layout.ts` 的 `.subscribe-btn`（订阅合集） | 右栏的文字按钮水平内距大体是“透明 / 图标加文字 / 菜单行 8px，带填充的文字按钮、标签与分段 12px”；订阅合集是带描边的纯文字按钮，用的是 8px。 | 改为 12px，或确认按“透明按钮”归类。 |
| 低 | `scripts/playbackSource.ts` 的 `playbackSourceFiles` | 源码断言读取的文件清单没有 `actionRolls`、`danmakuViews`、`railTabs`、`railHeadTone`、`disclosureToggle`、`idleProgress`、`commentComposer`、`appHost`。这些文件里的规则不在任何源码断言范围内。 | 断言本来就该少而精；只在确有需要钉住的约束时再加入清单。 |
| 低 | `Settings/.../VideoCard/VideoCardContentEditor.vue` 的 `showVideoWatchedBadge` | 开关放在“视频卡片”设置页，文案是“在动态视频中显示观看状态”，实际只影响动态卡片（`VideoWatchedTag` 只被 `MomentCard` 使用）。 | 移到动态页设置；或确认放在这里是有意的。 |
| 低 | `src/styles/_breakpoints.scss` 的 `$grid-xxl` | 没有使用方；文件注释说它与 `constants/layout.ts` 的断点表保持一致。 | 作为对照表保留，或删除。 |
| 低 | 测试输出中的 Vue 警告 | `Failed to resolve component: FrameActions`（2 次）、`ContentFilterEntry`（1 次）：夹具编译宿主组件时没有提供这两个子组件，它们在测试里是缺失状态。另有 15 次 `Extraneous non-props attributes (content, placement)`，来自夹具里只渲染插槽的 Tooltip 替身，是噪声。 | 给夹具的组件表补上这两个组件；Tooltip 替身声明 `content` / `placement` 两个 prop。 |

11-10 留下、仍未验证的实站路径：字幕接口（`x/player/wbi/v2` 与字幕文件）没有在真实页面请求过，番剧能否取到字幕没有确认；画面定格帧对受保护的流会画成黑帧；所有听视频与留边过渡的观感。

## 审美建议（播放页与听视频）

基于源码，未目测。每条注明是否在现有规则之内。

### 在现有规则之内

1. **让唱片成为舞台上唯一的主角。** 标题现在是 display（22/26）两行，与唱片争注意力。降到 heading（17/22）、UP 主用 callout + text-2，标题与唱片的间距从 20 收到 16；Apple Music 的正在播放页曲名并不大，靠封面与留白说话。
2. **歌词的景深。** 现在只有“当前行 100% / 其余 38%”两级。按与当前行的距离分三级（相邻 60%、再远 38%、更远 24%），只改 `opacity`，仍由直接写 class 完成；读起来像镜头对焦在当前行。
3. **光的方向统一。** 唱片高光从左上来（`conic-gradient from 35deg`），唱臂的投影却是正下方。把唱臂的 `drop-shadow` 偏到右下（x 为正），唱片的接触阴影同向，整台唱片机像在同一盏灯下。
4. **色场的起停跟随唱片。** 唱片有约 300ms 的起转与停转，背景色场却是 `animation-play-state` 瞬间起停。色场用同一段 `playbackRate` 缓变，暂停时整个舞台一起“落定”。
5. **听视频时控制栏取舞台的色调。** 舞台是封面色，底部控制栏的玻璃仍是页面主题色调（浅色主题下是白玻璃压在深色封面上）。让控制栏在听视频期间读取同一组取色变量（动态卡片的评论输入框已有“玻璃色调随取色派生”的先例），两者成为一体。
6. **右栏的节奏。** 按 `AGENTS.md` 的描述（未逐条对源码），信息卡、合集、推荐三个区块之间现在是 24 / 16+线+16 / 24。统一成“区块之间 32、区块内 16”，让右栏读起来是三段而不是一长串；同类分区标题（接下来播放、合集名、番剧分区名）都用 title + text-1，并让它们离上方发丝线的距离相同。

### 需要改动用户指定项

7. **右栏带一点封面的颜色。** 视频区是封面色场，右栏是纯页面底色，两半像两个页面拼在一起。给右栏背景混入 3–5% 的封面平均色（`--bewly-widescreen-cover-tone` 已经算好），整页像被这支视频染过。这会改变“右栏透明、直接位于页面底色上”的规定。
8. **信息卡去掉卡片感。** 信息卡是右栏唯一带底色、描边与阴影的盒子，其余都是平铺加发丝线。改成与合集、推荐一致的平铺分区（折叠按钮保留），右栏只剩一种容器语言。这会改变“唯一的卡片是信息卡”的规定。
9. **长文的行高。** 评论正文与简介是 13/16，中文长段落偏紧。为阅读型正文单独设一档 13/20（标题、按钮、列表仍是 13/16）。这会在用户校准过的字号体系里新增一个角色。

## 验证

- 基线（改动前）：`pnpm typecheck`、`pnpm lint`、`pnpm knip` 通过；`pnpm test` 失败（Selected P2 652 通过、37 失败）。
- 改动后：`pnpm typecheck`、`pnpm lint` 通过；`pnpm test` exit 0，876 项 PASS（Selected P2 689 / 0）。改过的 SCSS 已由运行中的 `pnpm dev` 编译进 `extension/dist`，产物里的规则与源码一致。
- 未运行：build、实站与浏览器视觉检查。唱针落下、右栏标签取色、听视频按钮的悬停与播放页文字颜色（别名替换）需要目测。

## 未覆盖

- 设置搜索目录（`searchCatalog.ts`）的目标是否都能定位：多数 `data-setting-id` 由运行时数据生成，静态比对不可靠，需要一个渲染各设置页的测试来验证。
- `storage.ts` 的设置字段：221 个字段都有名字上的引用，但没有逐个确认引用是读取方而不是同名变量。
- `layout.ts` 里针对 B 站原生类名的选择器是否仍然命中当前页面结构：只能在实站确认。
- 播放页的变体：番剧（`data-page-kind="pgc"`）、窄窗口（≤900px 单列）与听视频状态下的规则没有逐条核对是否与普通视频页一一对应，只查了右栏位置这一类。
- 播放页之外的热路径读写交错、重复实现：这一轮没有看。
