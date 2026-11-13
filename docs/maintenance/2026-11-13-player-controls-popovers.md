# 歌词换行与控制栏弹窗统一（2026-11-13）

## 歌词

`ListenLyrics.vue` 的单条歌词使用 `text-wrap: balance`，按实际宽度均衡断行，不改歌词文字、不截字、不动态缩小字号，也没有增加 JS 测量循环。孤立布局夹具中，普通换行的 13＋2 字、14＋1 字均变为 8＋7 字；宽度足够时保持单行。浏览器不支持时仍按普通换行展示完整内容。

## 共享样式与检查范围

`bewlyWidescreen/styles/layout.ts` 继续作为 Bewly 播放页原生适配入口：`PLAYER_POPOVER_SURFACE` 管理表面及基础排版，`BPX_FORMS` 从弹幕面板扩展到控制栏内的原生表单。定位外壳保持透明，避免字幕、画质、设置菜单出现重复底板或阴影。

| 部分 | 核对和处理 |
| --- | --- |
| 字幕与翻译 | 原文、翻译、双语入口、语言列表、字号、颜色、位置、描边、透明度、缩放、淡入淡出、重置和说明／反馈入口保留原生 DOM 与处理器；适配内层面板、表单和分隔线。 |
| 播放设置 | 自动播放、循环、镜像、跳过片头片尾、画面比例、解码、无缝切换、长按倍速、音量均衡及其他复选项共用表单样式；长标签允许换行。 |
| 画质、倍速与音量 | 画质和倍速选中／悬停状态、未登录提示、音量数值与滑轨、滑块接入公共颜色；画质嵌套列表不再重复绘制表面。 |
| 章节、音质与画中画提示 | 沿用原生交互；统一弹窗表面、提示与付费状态标签的成对前景／背景，修复白底提示气泡被统一染成白字的问题。 |
| 弹幕设置 | 密度选中态、进度轨道、刻度、滑块、分隔线、复选框和下拉选择沿用同一颜色体系，保留真实颜色样本。 |
| 帮助与画面／声音调节 | 帮助面板继续引用同一弹窗表面；画面／声音调节继续使用现有 `Dialog`、`Slider` 等共享组件。 |

主要 token：

- 表面：`--bew-elevated-alt-solid`、`--bew-edge-color`、`--bew-hairline`、`--bew-surface-radius`、`--bew-popover-surface-shadow`。
- 文字与状态：`--bew-text-1/2/3/4`、`--bew-hover-bg`、`--bew-selected-bg`、`--bew-fill-*`。
- 控件：`--bew-control-height`、`--bew-control-height-sm`、`--bew-space-2`、`--bew-icon-size-md`、公共字体与行高。
- 字段和分隔：`--bew-input-bg`、`--bew-field-edge-color`、`--bew-separator-color`。

控制栏按钮使用同一高度、中心线和组内间距，取消原生悬停时改变边距造成的跳动，以透明悬停桥连接菜单。文字和单色图标使用同一前景，消除原生图标额外透明度；保留 88 单位原生图标自带的留白、隐藏按钮状态、颜色样本和描边图形。

听视频取色时，菜单实色表面沿现有 `color-scheme` 向文字的相反明度偏移，防止中灰封面叠加选中底色后降低对比度；文字与图标仍读取同一组本地 token。[`light-dark()` 的颜色方案规则](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/light-dark)与现有 `imageTone.toned-surface` 配合。

## 原生证据与验证

- 核对公开播放器 `nano 4.10.12-db48c5ed` 的 [入口](https://s1.hdslb.com/bfs/static/player/main/core.js)、[控制栏依赖](https://s1.hdslb.com/bfs/static/player/main/widgets/npd.505.a62f0a05.js)、[组件依赖](https://s1.hdslb.com/bfs/static/player/main/widgets/npd.314.3f4c68a4.js)和 [Bui 控件](https://s1.hdslb.com/bfs/static/player/main/widgets/npd.586.a82c83f3.js)。
- 隔离 Chromium 夹具使用项目当前 CSS 和真实原生 Bui 控件：87 项通过。覆盖浅色、深色、四种取色背景，普通／网页全屏／全屏控制布局，原生下拉选择、禁用选项、颜色样本、滑条、复选框、子面板切换和 SVG 空心描边。
- 测试样本的正文和选中项最低对比度约 5.33:1；这是样本结果，不代表任意封面和所有透明度设置的完整测量。
- 仓库 `verify-selected-p2` 整组 695 项通过；收尾控件专项通过。`verify-targeted-fixes`、`pnpm typecheck`、`verify-style-invalidation`、修改文件 ESLint 和 `git diff --check` 通过。将钉住菜单数量或旧选择器写法的断言替换为共享表面、原生显隐和选项状态的 DOM 检查。
- 未运行生产构建或完整 `pnpm test`，没有实站账号交互或浏览器视觉验收；须重载扩展并刷新视频页后目测实际字幕菜单、各设置页和歌词。
