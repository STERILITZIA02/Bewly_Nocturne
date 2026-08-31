# Bewly Widescreen 页面化适配设计

## 当前边界

Bewly Widescreen 目前由三层组成：

1. `contentScripts/index.ts` 决定何时按设置进入宽屏，并协调页面导航。
2. `utils/bewlyWidescreen.ts` 管理准备、提交、交互、DOM 搬移、恢复与清理。
3. `utils/bewlyWidescreenPolicy.ts` 保存不依赖 DOM 的就绪和交互判定。

当前内容来自 Bilibili 原生 DOM。播放器根节点始终留在 Bilibili 原生 Vue 树中，宽屏只按 Shell 的 player frame 测量结果固定定位；UP 信息、工具栏、评论、弹幕、选集和推荐保留原节点与监听器，并通过 placeholder 在退出时恢复。该实现是 Bilibili DOM adapter，不应成为未来 Bewly Native 页面的数据层。

## 已建立的稳定契约

- 页面、播放器元数据与必需迁移节点并行准备；播放器继续原生加载。节点先就绪时立即进入短稳定窗口，否则在页面 ready 后最多等待 1.2 秒再提交 Shell；`load` 事件被第三方资源拖延时使用有界兜底，不再因任一可选侧栏节点卡住整个宽屏。
- Shell 不得 reparent `#playerWrap` 或播放器根节点，不得产生第二个 `#bilibili-player`，也不得让原播放器进入 `data-screen="mini"`；原生控制栏和画面点击事件必须继续由 Bilibili 播放器持有。
- Shell 的透明 player frame 不接管指针；贴边展开监听 window 指针流并按 RAF 合帧，侧栏/按钮只在可交互时恢复 `pointer-events`。指针位于原生播放器底部控制热区时禁止新的贴边展开，避免与原生控制栏竞争。固定定位的播放器不得使用 inset clip，以免露出原页面内容。
- 侧栏按 `top / comment / danmaku / playlist` 分区报告 readiness；根节点暴露对应 `data-sidebar-*-ready`，内容区同步 `aria-busy`。
- 当前 Bilibili DOM adapter 在布局提交后只 hydration 当前活动 Tab；首次访问其它 Tab 时再增量搬移，Shadow DOM 未形成有效内容前不得搬移评论根节点。
- 所有异步结果继续受当前宽屏实例、页面导航和组件生命周期约束。
- 退出必须释放 Observer、timer、RAF、全局 listener，移除播放器定位 class/CSS 属性，并按 HTMLElement placeholder 恢复侧栏原节点；原父级已销毁时删除孤儿节点，绝不回挂到 `body`。
- Bilibili 原版顶栏必须留在其 Vue 原生树内，通过 `display: contents` 只暴露顶栏，不再 portal 到 `body`。

## 目标结构

```text
WidescreenController
├── PreparationBarrier
│   ├── interface language
│   ├── page readiness
│   └── player readiness
├── WidescreenShell
│   ├── measured player frame（原播放器保持原生所有权）
│   ├── top information slot
│   ├── tabs and loading states
│   └── responsive / motion policy
└── WidescreenContentAdapter
    ├── BilibiliDomAdapter（当前）
    └── BewlyNativeAdapter（未来）
```

`WidescreenController` 只拥有生命周期和当前实例 identity；`WidescreenShell` 只拥有布局、视觉和交互；adapter 只负责向分区提供内容及 readiness。账号、未读、稍后再看等业务真值继续来自现有 Store，不在宽屏内复制。

## 分阶段迁移

### 1. 抽离 Bilibili DOM adapter

在不改变行为的前提下，将 selectors、节点搬移、placeholder 恢复和 sidebar hydration 从主控制器中抽离。adapter 提供 `hydrate()`、`refresh()` 和 `dispose()`，返回分区 readiness。

### 2. 将 Shell 改为 Vue Native

由 Vue 组件接管顶层表面、标签、Skeleton、错误态、响应式布局和 reduced-motion。播放器仍可由 Bilibili adapter 提供原节点，避免一次性重写播放链路。

### 3. 逐区替换 Native 内容

按 `top → playlist/recommendation → danmaku → comment` 顺序替换。每次只替换一个 adapter 分区，并继续复用现有账号、请求 generation 与 Store；已替换分区不保留双实现，未迁移分区继续由当前 Bilibili adapter 提供。

### 4. 删除 DOM 搬移层

只有所有正式分区均有 Native 数据契约后，才删除 selectors、placeholder 和 restore 逻辑；不保留两套永久状态机或任意 URL 页面代理。

## 视觉与交互约束

- Shell 使用 `variables.scss` 的表面、边框、圆角、排版、间距和层级 token。
- 桌面侧栏使用 `--bew-elevated-alt / --bew-surface-border-color / --bew-panel-radius / --bew-corner-shape` 构成单一浮动表面，专用 `::before` 背景层承载 `--bew-filter-glass-1` 与半透明表面，并继续服从 `disableFrostedGlass`；以 `--bew-space-4` 与视口四边保持安全留白，移动端仍使用无留白的同一实例。
- 侧栏展开始终是覆盖层，不改变播放器几何；点击与贴边只区别于是否固定展开。拖拽宽度限制在安全最小值与视口约三分之二之间，拖动帧只更新 Shell CSS 宽度，播放器 resize 同步延迟到拖拽结束。
- 拖拽期间以 2px 的明暗主题强调边框和单一外发光明确表达布局编辑状态，不额外创建浮层或复制宽度状态。
- 弹幕在线人数、开关、设置、输入与发送继续复用原生发送栏节点；发送栏位于播放器下方的独立布局轨道，不覆盖画面也不移动原生播放控制。轨道在浅色模式使用白色实底、深色模式使用暗色实底、OLED 模式使用纯黑实底；内部继续保留独立胶囊、圆形按钮和平滑圆角输入区域。
- 原生弹幕样式、设置和发送控件必须补齐 button 语义、键盘 Enter/Space 操作与本地化标签，并在退出时恢复原属性。弹幕 Tab 首次可见时只触发一次原生展开初始化，随后以有界的 `0/80/180/360/720ms` resize 节奏让原生虚拟列表渐进补齐；不一次性渲染全部弹幕，也不暴露用户可操作的折叠入口。
- 弹幕开关与设置图形必须在固定图标盒内几何居中，开关的完整圆形区域都必须命中原生三态 input，鼠标焦点不得误显示键盘焦点环；原生颜色、字号和位置入口继续使用原节点与交互，弹出的选择面板允许越过输入框向上显示且只由内层 Popover 绘制表面，不得被输入框裁切或在圆角外露出原生矩形底色。高级设置返回行使用同高图标与文字盒，并保留面板顶部安全间距。
- 底部发送栏内容在桌面使用 `--bew-space-8`、移动端使用 `--bew-space-4` 的对称水平安全留白，始终保持水平居中。
- 宽屏期间 `#bewly` Shadow Host 仅提升到 Shell 上一层，使原有页面模式、主题、设置和布局编辑按钮在底部预留轨道内可见；不复制按钮或事件。
- 桌面侧栏与播放器区域建立独立局部堆叠上下文；侧栏始终位于底部弹幕模块和原生播放控制之上，底部模块允许延伸到侧栏下方并由侧栏覆盖，不为避让侧栏复制或压缩自身宽度状态。
- 选集区复用当前移动节点并提供单一收起/展开控制；压缩动画约 0.3 秒，收起后必须释放推荐内容的垂直滚动空间，不建立第二套选集状态。
- Tab 必须支持方向键、Home/End、`aria-controls` 和独立 loading/error/empty 状态。
- 动画只作用于 Shell 的 transform、opacity 和已定义的布局轨道，并完整支持 reduced-motion。
- 移动端使用同一实例切换布局，不创建第二套播放器或侧栏状态。

## 验收条件

- 视频先就绪时等待页面；页面先就绪时等待视频；语言未确定时不显示 fallback 文案。
- 登录账号、评论、UP 信息和媒体列表不得因 DOM 搬移丢失初始化。
- SPA 导航、扩展重载、全屏切换和手动退出后无残留节点、监听器或定时器。
- 任一 Native 分区替换均可独立回归，不影响其他仍由 Bilibili adapter 提供的分区。
