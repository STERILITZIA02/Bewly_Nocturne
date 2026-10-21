# 样式重算与布局抖动检查（2026-10-22）

在实站播放页（约 3,200 个原生元素、370 个评论 Shadow root）和本地隔离页面中测量，按成本从高到低修复。数据来自 Chrome 强制样式计算计时（`classList.toggle` 后立即 `getComputedStyle`）。

## 发现

| 问题 | 测量 | 原因 |
| --- | --- | --- |
| 改动任何元素的 class 都会重算其整棵子树 | 播放页改 `<body>` 一个无关 class：35–40ms；隔离页 6,000 元素：加载我们的样式前 0.3ms，加载后 10.6ms | 全局样式里有约 140 条 `[class*="…"]` 写在祖先位置的选择器（番剧播放、漫画、游戏、直播、音乐等子站的 CSS Module 规则）。Chromium 把“任意 class 属性变化”登记为触发条件，失效范围是子树里所有带 class 的元素。 |
| 页面专属 CSS 实际在每个页面加载 | `style.css` 1.13MB / 8,471 个选择器；Shadow 副本同样包含 | `adaptedStyles/index.ts` 的 `await import('./pages/x.scss')` 本意是懒加载，但内容脚本是单个 IIFE，动态导入被内联，所有页面 CSS 合进全局样式与 Shadow 副本。 |
| 控制栏自动隐藏整页重算 | 在 `<body>` 上改继承的自定义属性：74ms；在 `<html>` 上：90ms | 隐藏时 `body.…controls-hidden { --bewly-widescreen-controls-opacity: 0 }`，继承值变化让整页（含评论 Shadow 树）重算，每次自动隐藏 / 显示都发生。 |
| 评论输入框变高时重算整个评论区 | 每次增高一行 | 高度变量写在 `.bewly-widescreen-panels` 上并继承到全部评论；动态卡片评论区同理（`--moment-composer-height`）。 |
| 播放页每次 pointermove 强制同步布局 | 每帧一次 | 处理函数先读播放器矩形、写控制栏状态，再在转发事件时重新读取矩形。 |
| 原生子站加载所有子站规则 | 440KB / 100 个祖先类名属性选择器 | 原生子站入口静态导入整个 `nativeSites.scss`。 |

## 修复

- 路由样式：`adaptedStyles/pages/*` 改为 `?inline` 文本，`applyRouteStyle` 维护单个 `<style data-bewly-route-style>`，换路由时替换、离开时移除。元素放在 `<html>` 最前：实测 manifest 注入样式与文档样式同优先级时文档样式胜出，放在最前保证 Bilibili 自己的样式仍然胜出，与原来一致。路由规则原本排在 `blockAds`、`removeTopBar`、`fonts` 等全局规则之前，逐条比对后两者没有同优先级同属性的冲突。所有路由文件都由路由 class 限定（`videoPage.scss` 重复引入的 `sendButton` 已删除，`main.scss` 本就全局引入）。音乐中心样式从共享的 `nativeSurfaces.scss` 移到 `pages/musicPage.scss`。
- 原生子站：`nativeSites.scss` 以文本导入，`selectNativeSiteCss` 只保留不指名站点或指名当前站点的规则（@media / @supports 递归筛选，@keyframes 等原样保留），在 document_start 插入。各站从 365KB 降到 8–43KB，筛选约 2ms。
- 播放页注入 CSS：弹窗表面改为 `.bpx-player-ctrl-btn > :is([class*="menu"], …)`，并显式列出嵌套的画质菜单与进度预览；弹窗文字着色并入 `.bpx-player-ctrl-btn *`（所有 `-ctrl-` 元素都在控制按钮内）；悬停底色只给设置框与音量框。在实站比对：新旧选择器命中的元素集合一致。工具栏点赞 / 投币动画由 `actionEffects` 在 MutationObserver 回调里打 `data-bewly-action-animation`（早于绘制），图标规则改按该属性。PGC 封面改为 `> picture` / `> picture > img`（主体只是图片，失效范围极小）。视频页 AI 助手的 `--brand_blue` 改在根上设置并继承。
- 自动隐藏：`<body>` 不再改继承变量；隐藏态规则直接写 `opacity: 0`，侧栏按钮用已有的 `widescreen-controls-hidden` class。`<body>` 上的 class 保留，现在只让引用它的控制栏元素失效。
- 输入框高度：播放页写在评论面板自身并以 `@property --bewly-widescreen-composer-height { inherits: false }` 注册；动态评论区（Shadow DOM 内不支持 `@property`）改为只在预留空间的元素上内联样式。
- 布局抖动：播放页 pointermove 只在写状态前读一次播放器矩形，并传给悬停判断与事件转发；`finishPanelLoading` 先读完所有时长再写属性。

## 结果

- 全局 `style.css`：1.13MB → 385KB；选择器 8,471 → 2,720；祖先类名属性选择器 138 → 0。Shadow 副本：38 → 0。
- 同一隔离测试中，加载新样式后切换 class：10.6ms → 0.22ms（与不加载任何样式相同）。
- 解析本身也按体积计费：隔离页解析并应用 376KB 样式约 67ms，因此只加载当前页面的样式同时减少了首屏工作。
- `pnpm verify:style-invalidation` 编译全部常驻 SCSS、243 个组件样式和播放页注入 CSS，出现祖先位置的类名属性选择器即失败；同时检查路由与子站样式不会被重新打进全局入口。

## 检查后未改动

- `:has()`：常驻样式中没有锚定在 `html` / `body` 或带宽泛参数的用法。
- `will-change` 与无限动画：都只在预览、进入或加载等临时状态出现。
- 其他高频监听（竖屏缩放、触摸手势、弹幕悬停）在没有手势或缩放时直接返回；顶栏滚动处理读的是滚动位置。
- `actionEffects` 的主题观察器会在 `<html>` 的 class / style 变化时读一次计算样式；宽屏页上这些 class 不变（`classList.toggle` 值不变时不产生变更），收益太小。
- 消息页与资料库侧栏宽度过渡（`--bew-active-sidebar-width`）在切换页面的 200ms 内逐帧重算整个应用，这是有意的几何过渡，改法会改变布局结构，留待设计决定。

## 剩余

- 直播、漫画、游戏、音乐子站自己的 CSS Module 规则仍有祖先类名属性选择器（直播 17、漫画 30、游戏 20、音乐 20），只在对应站点加载。彻底消除需要换成 JS 标记或更具体的选择器，需在各站点逐页核对外观。
- 实站效果需要重新加载扩展后确认：路由样式切换（含 SPA 导航）、原生子站首屏、播放页控制栏弹窗与点赞动画、PGC 封面。
