# 交互动效复查与弹窗材质稳定性

本轮按当前 `message_feature` 工作目录检查。消息页与稍后再看页的已确认外观保持不变。下列建议随后获得用户授权并分三批实施，结果见[三批引入记录](2026-10-12-interaction-motion-implementation.md)。本页保留审核时的判断与弹窗修复证据。

## 方法与边界

- 全局检索 Transition、WAAPI、rAF、持续动画、玻璃、will-change 与布局过渡，沿入口检查通用控件、主要页面和共享生命周期。
- motion-web 用于最低成本动效、可中断性、可发现性和减少动态效果；onetake 仅借用“动作因果、同一元素延续、静止阶段”的原则。没有引入影片运行库、镜头运动、音效或动画依赖。
- 源码审核覆盖下表；浏览器逐帧验证集中于本次修复的弹窗，不等于所有账号操作和原生页面均已重新验收。

| 范围 | 本轮检查的实现与判断 |
| --- | --- |
| 全局页面与首页分类 | `App.vue` / `Home.vue` / `asyncPage.ts`：已有模块预热、离场不可交互；仍有 out-in 的前后串行窗口 |
| 弹窗、设置、浮窗 | `Dialog.vue`、`useSettingsMotion.ts`、`popover.scss`：确认父层透明度导致玻璃采样根改变，已修复 |
| 抽屉、通知抽屉 | 两类 Drawer 已把遮罩淡入与实色抽屉位移分离；保留 iframe 就绪、ESC 和离场资源处理 |
| 顶栏、Dock、侧栏 | 现有滚动意图、侧栏排除、Dock 反向取消已存在；不重做滚动规则和冻结材质 |
| 滚筒、分段选择、日期与筛选 | 临界阻尼滚筒、液态指示器、实色菜单、键盘即时打开与局部折叠已存在 |
| 收藏、历史、稍后再看 | 收藏操作展开、历史可见行 FLIP、刷新保留旧数据、虚拟窗口和批量状态保留 |
| 消息、通知与 Insights | 保留会话容器实例、历史请求时序、Composer 与导航材质；通知 Masonry 的全量重测可优化 |
| 动态与视频卡片 | 保留第一帧后显示预览、离场释放、动态卡片局部展开；不增加媒体常驻数量 |
| 设置搜索、Tooltip、右键菜单 | 搜索定位与键盘导航保留；Tooltip 已有暖启动；ContextMenu 仍直接显隐 |
| 加载、主题、原生播放辅助 | 共享骨架与 reduced-motion 已有；主题快照结束归属已处理；原生业务节点不由动效层重建 |

## 已修复：打开后的玻璃跳变

旧 Dialog 对 `.dialog` 整体做 opacity 过渡；旧设置动画对 `#settings-window` 同时做 transform/opacity 过渡。子层的 backdrop-filter 在父层 opacity 小于 1 时受到新的 backdrop root 限制，结束时重新采样页面背景，造成色调/模糊突然变化。顶栏液态浮窗也有同类祖先淡入路径。

依据：[MDN backdrop-filter / Backdrop root](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)。transform 不在该文档的 backdrop root 条件中；不能将一般性的“opacity 动画便宜”直接套在玻璃祖先上。

实现：

- `useGlassPanelMotion.ts` 统一拥有 Dialog 与设置外壳动画，仅改变 transform，背景材质从挂载起使用终态。
- 快速反转先读取当前呈现矩阵，再取消旧动画；过期 Promise 不触发当前结束回调。离场 inert，重新进入恢复；卸载取消；reduced-motion 即时完成。
- 普通 Dialog 使用共享间距与时长，细小位移/缩放；动态详情保留不缩放。去掉原先硬编码的 transform/width/height 400ms 过渡以及无人使用的 modal 淡入 CSS。
- 顶栏和搜索浮窗的 `slide-in` 只保留 transform，防止内部液态光学层遇到祖先 opacity 采样边界。
- `PanelTopBlur`、顶栏渐进模糊、会话边缘模糊、三主题颜色和材质强度参数不变。嵌套 Dialog 沿用普通实色表面。
- 确认框 `ConfirmDialog` 原本为实色且没有玻璃加载阶段；Select、日期选择、ContextMenu 也使用实色，不需要添加玻璃或统一强制动效。

## 建议顺序

### 第一批：消除可见的等待与断点

1. **页面模式小图标**：`PageModeSwitcherButton.vue:59` 使用全局 300ms fade + out-in，前后串行可产生约 600ms 的交接。改成固定图标槽内 100–150ms 的交叉淡入，保留按钮、焦点和点击目标；连续 hover/click 直接接续当前帧。不要把整颗玻璃按钮淡出。
2. **设置分类和页面切换**：保留共享外壳与旧内容直到下一视图可渲染，当前 `page-fade` / `home-tab` 的 out-in 只在确有必要时使用。建议先从设置分类试验 120–180ms 的内容交接；旧内容离场立即 inert。大列表及 iframe 不同时运行两个完整页面；已有模块预热不重复实现。
3. **右键菜单**：`ContextMenu.vue` 当前位置计算完成后直接显示。可给菜单内容一次 100–140ms、0.98→1 的小幅入场，定位与焦点先完成；键盘打开即时可用。收益较小，排在页面模式图标之后。

### 第二批：让列表变化延续现有位置

4. **收藏夹展开与批量工具**：`FavoriteSidebarItem.vue` 已有 0fr→1fr 和 opacity。进一步稳定“当前收藏夹行”的滚动锚点，快速从 A 切 B 时仅两行交接；新增批量工具沿用同一展开容器，避免重复入场。折叠会影响流布局，不建议简单 scaleY 整个文本面板。
5. **通知瀑布流**：`MasonryGrid.vue` 在更新时归一所有列、读取全部高度并写回位置。可缓存高度/列宽，仅对变化卡片后的受影响部分重排，布局完成后只对视口内受影响卡片做 160–200ms FLIP。保持 DOM 时间顺序、分页锚点、通知已读行为，不对每一张旧卡片重播入场。
6. **刷新和数据交接**：沿用 Watch Later 已有的旧列表保留和完整结果提交；其他刷新入口补齐相同规则。仅新增/删除/变位的可见行有反馈，刷新按钮持续可辨认。错误或无变化时不强制播放“焕新”动画，不设置人为最短网络等待时间。

### 第三批：收紧持续开销

7. **液态分段指示器**：已有连续反转、位置测量与停止机制，应保留。`segmentLiquidIndicator.scss` 的常驻 will-change 可只在 moving/scrubbing 时开启；宽高逐帧仍是布局属性，先测量再决定是否改为纯绘制层变形，不能牺牲目前的胶囊轮廓。
8. **Dock 几何变化**：折叠外壳确实在过渡 width/height；开启液态材质时还会影响尺寸观察器。先测展开/反向的主线程与光学层更新次数；若成为热点，只在变形期间对光学尺寸更新做有界调度。不要为了节省几毫秒缩放全部文字、取消液态效果或改变最终造型。
9. **骨架和离屏反馈**：`skeleton.scss` 使用 background-position 持续扫光，`SkeletonBlock` 本身不感知可见性。由列表/面板级可见性统一暂停离屏和隐藏骨架；避免为每条短线各建 Observer。保留现有轮廓、三主题与 reduced-motion。

## 不建议引入

- 新增 GSAP、Three.js、影片播放器或 onetake 的逐帧运行库。
- 列表每次刷新整页 stagger、持续漂浮、指针跟随光、3D 倾斜和大面积滤镜动画。
- 为“高级感”延迟业务结果、在全列表执行每帧布局测量、缩放输入文字。
- 重写已稳定的滚筒、历史折叠、主题切换和媒体生命周期。

## 验证

- `pnpm verify:selected-p2`：453 项通过；新增材质动画属性、打断续接、旧完成回调失效及 reduced-motion 检查。
- `pnpm typecheck`、本轮相关文件 ESLint、`git diff --check` 通过。
- 既有 `pnpm dev` watcher 已更新 extension 产物，无独立 build，无 commit/push。
- 本地实际 Dialog：暗色 105 帧、亮色 106 帧、OLED 107 帧的约 900ms 采样中，blur/底色各为单一恒定值，opacity<1 的祖先数为 0。
- 故意恢复旧祖先 opacity 动画的对照：110 帧中 33 帧出现新的采样边界；验证工具能够检出缺陷。
- 设置结构共用控制器、50ms 间隔五次反向和浮窗逐帧检查通过；嵌套 Dialog 的 backdrop-filter 为 none。
- 375px 窄屏 + reduced-motion：Dialog 左右边界 8/367px，无越界；关闭毛玻璃时为实色、backdrop-filter none。
- Chrome 重载后刷新独立测试标签，实际设置窗口读取到了新的 `--bew-panel-enter-transform`，opacity 为 1；实际“新建收藏夹”弹窗亦使用新位移、根层 opacity 1 和当前用户配置的 blur(24px)。打开、关闭正常，没有提交收藏夹或修改设置。
- 实站截图：`/private/tmp/bewly-dialog-glass-live.png`。逐帧数据来自本地组件预览；实站不声称有完整帧率测量。未逐项重新操作所有账号写入功能，也未在 Safari/低性能设备完成本轮验收。
