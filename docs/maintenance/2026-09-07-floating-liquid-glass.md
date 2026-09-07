# 播放页排版与共享液态玻璃

本文记录首次扩大液态玻璃范围的实现和当时的验证。用户随后要求收回大型表面的液态效果；当前范围和底栏修复以 [玻璃性能修正](2026-09-07-glass-performance-correction.md) 为准。

在 `message_feature` 上继续实现，保留此前未提交的表面与加载骨架修改、现有设置及 stash。未提交、推送或执行生产构建。

## 根因与行为

- 液态玻璃此前只由 Dock 计算参数和绘制，其他浮层仍有各自的毛玻璃背景。现在由 `useLiquidGlass.ts` 统一读取原有设置与有效明暗主题，Vue 指令和原生 DOM 附着入口共用 `LiquidGlassSurface.vue`，不建立第二份设置状态。
- 控制入口移入“外观 → 液态玻璃”，Dock 页面旧入口删除。四套语言与设置搜索同步更新。保留 `enableDockLiquidGlass`、`dockLiquidGlass*` 持久化键及用户数值；入口移动不重置选择。
- 应用范围包括 Dock、Bewly 播放页底部控制栏和侧栏、设置主面板与左侧导航、独立搜索框及其结果浮层、顶栏 Pop、独立侧边操作按钮和外层 Dialog。仍服从唯一全局关闭开关 `disableFrostedGlass`。
- 已替换的表面关闭原整面 backdrop-filter，着色层位于折射层之后，边框位于光学层之后。内嵌控件、菜单、设置搜索和嵌套 Dialog 保持实色；Dock/底部控制栏内部的按钮不再附加第二层液态玻璃。
- 跟随主题时使用现有白色、受约束的深色及 OLED 黑色 token。色调强度使用连续曲线，保留 0/100 两端和全滑杆范围；默认 30% 强度对应约 83.19% 白色、79.91% 深色和 90.16% OLED 黑色着色。自定义颜色仍按指定不透明度均匀着色。100% 实色时卸载不可见的 SVG 滤镜和背景采样层。
- 播放页作者区原先有固定的 108px 外壳、30px 操作行和不同的文字层级。现在按原生 DOM 调整高度、换行、间距及 36px 操作尺寸，标题、作者、简介和评论使用既有字体 token；侧栏分类复用共享分段控件样式。原生头像、VIP 标识、充电/关注/发消息、评论、表情和回复节点与事件保留。
- 评论头部及正文的 Shadow DOM 样式沿用 MAIN world 的既有注册表，且仅在 `#bewly-widescreen-root` 内生效，不复制评论客户端或改变原站业务。
- 真实浏览器预览发现，独立渲染的玻璃节点在首轮尺寸监听时可能得到零尺寸，直到 resize 才显示折射。现在挂载时读取一次实际 CSS 尺寸，后续由原 ResizeObserver 更新，随卸载释放。

## 修改归属

| 职责 | 文件 |
| --- | --- |
| 共享参数、绘制及清理 | `src/composables/useLiquidGlass.ts`、`src/utils/liquidGlass.ts`、`src/components/LiquidGlassSurface.vue`、`src/constants/liquidGlass.ts`、`src/styles/liquidGlass.scss` |
| 外观入口 | `src/components/Settings/Appearance/LiquidGlassSettings.vue`、`Appearance.vue`、`PluginComponentsAndPages/DockAndSidebar/DockAndSidebar.vue`、`searchCatalog.ts`、四套 locale |
| Vue 浮层接入 | `Settings.vue`、`Dialog.vue`、`Dock.vue`、`SearchBar.vue`、`SideBar.vue`、`PageModeSwitcherButton.vue`、`TopBarLogo.vue`、`TopBarRight.vue`、`src/styles/popover.scss` |
| 播放页原生表面与排版 | `src/utils/bewlyWidescreen.ts`、`bewlyWidescreen/danmaku.ts`、`shell.ts`、`types.ts`、`styles/layout.ts`、`src/inject/index.ts` |
| 规范及回归 | `AGENTS.md`、`scripts/verify-liquid-glass-surfaces.mjs`、`verify-dock-glass.mjs`、`verify-selected-p2.mjs`、`verify-targeted-fixes.ts` |

## 自动验证

- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm knip` 最新完整运行退出码均为 0；`git diff --check` 为 0。
- Knip 保留既有 52 个未使用导出、6 个未使用类型、4 个枚举成员，未声称无警告。新增 PageModeSwitcher 测试的简化 Tooltip 桩有属性继承提示，不是产品组件报错。
- `pnpm dev` 的 content、inject、background 开发编译成功；未运行 `pnpm build`，未手工编辑生成产物。
- 新回归调用实际组件、共享参数与附着模块，覆盖首帧尺寸、唯一滤镜 ID、主题切换不重建表面、原 DOM/输入草稿/焦点/事件保留、全局关闭和卸载、透明/实色端点、嵌套 Dialog 材质归属、Dock 内按钮不叠玻璃，以及真实播放页 tab 创建/键盘/ARIA/面板切换入口。
- 设置表单回归直接挂载新的外观叶子组件，确认原有模糊、色调、自定义颜色与强度值保留，搜索跳转只到外观。原来的账号、播放器、评论、私信和通知行为断言保留。

## 浏览器 QA 与尚未验证项

- Chrome 默认桌面视口的本地 Vue/SCSS/UnoCSS 夹具使用实际库、玻璃附着模块、外观设置组件、播放页 shell 与样式；作者和评论内容为几何样本，因此不将其称为真实 Bilibili 业务验收。
- 检查浅色、深色与 OLED，默认强度的实际着色分别为 0.831930、0.799118、0.901568。OLED 纯黑背景未观察到异常色块或图案。
- 穿透夹具 Shadow DOM 统计得到 5 个玻璃表面、5 个滤镜，5 个宿主的旧 backdrop-filter 均为 `none`；嵌套液态玻璃为 0。前一轮交互检查中，强度 100% 为 0 个滤镜，回到 0% 恢复 5 个滤镜。
- `PanelTopBlur.vue` 和既有顶部渐变模糊没有修改。设置/Dialog 顶部装饰，以及独立搜索框经过顶栏渐变区域时，仍可能与该受保护的模糊区域空间重合；这是按用户要求保留的例外，不能宣称所有位置绝无多次背景采样。
- 最新真实 Bilibili 新标签仍显示旧的 `.bewly-widescreen-tabs`，缺少本轮共享分段类和附着标记。已请求用户重载开发扩展；真实侧栏、底部控制、设置新入口与搜索浮层的本轮端到端视觉验收尚待完成。
- 重载后重点复查：原生关注/充电/评论入口的布局、评论/弹幕/选集切换、侧栏收起重开和宽度拖动、设置与搜索浮层、左右侧栏及三种页面模式。不要为验证视觉发送评论或触发付费/关注等写操作。
- 未执行移动端测试，也未声称完成全部桌面缩放组合或性能基准；JSDOM 几何回归不等于真实浏览器视觉通过。
