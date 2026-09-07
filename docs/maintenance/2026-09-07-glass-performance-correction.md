# 底部液态玻璃与大型表面性能修正

继续在 `message_feature` 工作，保留现有未提交修改和 stash；未提交或推送。外观中的液态玻璃入口、用户参数、深浅/OLED 色调与播放页排版保留。

## 修复

- 真实 Bilibili DOM 中已存在底部玻璃节点和 SVG 滤镜，但宿主保留 `will-change: opacity`。该属性会形成背景采样边界，子级的 backdrop-filter 无法取得宿主背后的视频画面。参见 [CSS Filter Effects 的 Backdrop Root 定义](https://drafts.csswg.org/filter-effects-2/#BackdropRoot)。
- 底栏使用液态材质时，宿主保持 opacity 1、will-change auto；沿用唯一的 `--bewly-widescreen-controls-opacity`，分别控制折射层、着色层和边框淡入淡出。着色层同时保留用户色调强度。原生控制、弹幕和 Bewly 按钮的显隐与几何逻辑不变；reduced-motion 覆盖新增绘制层。
- 设置主面板、左侧纵向导航、普通 Dialog 和播放页侧栏移除液态附着、SVG 与相应尺寸监听，恢复原有毛玻璃。嵌套 Dialog 继续使用实色，顶部渐变模糊未改动。
- 播放页只回退侧栏背景，保留作者、操作行、评论和分类排版。原生视频标签补充 hover/focus-within 表面和 focus-visible；分类标签使用更明确的不透明主题悬停表面，激活状态和键盘切换不变。
- 四套 locale 和 `AGENTS.md` 同步缩小材质适用范围，不保留失效设置入口。

## 修改文件

- `src/utils/bewlyWidescreen/styles/layout.ts`：底栏采样与叶子显隐、侧栏背景、标签反馈。
- `src/components/LiquidGlassSurface.vue`：提供当前色调透明度，供底栏的统一显隐合成使用。
- `src/components/Settings/Settings.vue`、`src/components/Dialog.vue`：移除大型表面的液态附着与专用样式。
- `src/utils/bewlyWidescreen.ts`、`src/utils/bewlyWidescreen/types.ts`：删除侧栏液态挂载及专用清理状态。
- 四套 locale、`AGENTS.md` 与 `scripts/verify-liquid-glass-surfaces.mjs`：范围说明和回归。

## 验证

- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm knip` 最新完整运行退出码均为 0，`git diff --check` 为 0；Knip 保留既有 52 个导出、6 个类型、4 个枚举成员提示。
- 现有 `pnpm dev` 持续编译成功；未使用生产 build。
- 实际组件回归覆盖 Settings 导航和输入草稿保留、Dialog 外层毛玻璃/内层实色且不分配液态观察器、原生弹幕栏重复绑定/替换/清理时只保留一个玻璃实例，以及分类键盘和原生节点保留。
- 调用实际 `injectLayoutStyle()` 的回归确认显示、隐藏、再次显示时宿主始终不建立 opacity 采样边界，并验证液态/原毛玻璃的样式声明。JSDOM 不计算 backdrop-filter，因此该声明读取真实注入的 CSSOM；光学效果另外使用 Chromium 对照，未把 CSSOM 断言称为视觉验证。
- Chrome 桌面夹具使用实际库、原生播放页样式注入和设置组件样式。相同条纹背景下，旧采样边界使条纹穿透底栏保持清晰；移除该边界后可观察到背景模糊与折射。隐藏后宿主 opacity 为 1，折射、着色、边框三个绘制层 opacity 均为 0。
- 同一夹具的液态滤镜由上一轮 5 个减少至 2 个（底栏、独立搜索框）；设置、左侧导航和播放侧栏恢复 `blur(20px) saturate(1.8)`。这是资源数量与样式实测，不是帧率或长任务性能收益估算。
- 原生标签与非激活分类标签在真实 `:hover` 下均取得主题悬停表面；分类 ArrowRight 切换和 ARIA 选中状态正常。
- 已请求重载开发扩展。修复后真实 Bilibili 页面验收尚待重载，不能以本地夹具代替线上视频背景验证；未测试移动端。
