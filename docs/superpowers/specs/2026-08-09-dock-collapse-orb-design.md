# Dock 收起圆球交互设计

## 目标

在不改变 Dock 现有定位、导航、页面模式、主题切换、设置打开、刷新或自动隐藏行为的前提下，增加 Dock 收起功能。收起后 Dock 缩合为毛玻璃正圆，圆球中心与收起前 Dock 的中心点一致。

## 设置语义

新增持久化设置 `dockCollapseMode`，仅有三个值：

- `button`：默认值。Dock 设置按钮之后显示收起按钮。点击按钮收起，点击圆球展开；Hover 圆球只显示交互反馈。
- `hidden`：不显示收起按钮，Dock 不使用圆球收起。从其他模式切换到此项时立即恢复展开。
- `automatic`：不显示收起按钮。指针离开 Dock 后沿用现有离开延迟自动收起；Hover 圆球立即展开，再次离开后重新收起。

当前展开/收起是 Dock 的本地 UI 状态，不持久化。重新加载时根据 `dockCollapseMode` 确定初始显示，不增加历史状态或兼容层。

## 结构与定位

在现有 `Dock.vue` 内切换“完整 Dock”和“收起圆球”，不创建 Teleport、独立悬浮根节点或第二套 Dock 状态。

收起前记录 Dock 的实际宽高。收起时外层定位容器继续使用该宽高，圆球在容器中水平、垂直居中。因此无论 Dock 在左侧、右侧或底部，圆球都停留在原 Dock 的几何中心。

收起圆球复用现有 Dock 的控件尺寸、content/elevated 表面、`--bew-filter-glass-1`、表面边框和阴影。形状使用 `border-radius: 50%` 和 `corner-shape: round`，内部使用中性导航图标。

## 动画与交互

完整 Dock 与圆球通过同一个 Vue `Transition` 切换，只动画 `opacity` 和 `transform`。收起时 Dock 在原中心缩小并淡出，圆球从较小 scale 淡入；展开时反向播放。不动画 `backdrop-filter`、阴影几何或布局定位。

动画使用现有 `--bew-duration-normal/moderate` 和 `--bew-ease-emphasized`。`prefers-reduced-motion: reduce` 时缩短为几乎即时的淡入淡出。

收起按钮位于设置按钮之后，复用 `.dock-item` 的尺寸、正圆、Hover、Active、Focus 和阴影。按钮与圆球均有独立的可访问名称。

## 与现有 Dock 行为的关系

- `hidden` 完整保留现有 `autoHideDock` 和 `halfHideDock`。
- `button` 下的完整 Dock 仍可按现有 `autoHideDock` 隐藏；用户手动收起后，圆球保持可见，不再被边缘隐藏或半隐藏位移。
- `automatic` 下，离开 Dock 优先收起为圆球，不将它完全移出屏幕；不改写用户的 `autoHideDock` 或 `halfHideDock` 设置值。
- 收起时隐藏内联和分离的刷新、返回顶部、撤销/前进按钮，保证可见表面只有一个圆球。展开后按现有逻辑恢复。
- 切换三档设置时按新模式立即解析当前状态，不修改其他 Dock 设置。

## 方案比较

1. **在现有 `Dock.vue` 中切换视图（采用）**：共用定位、比例缩放、主题 token 和 Hover 生命周期，差异最小。
2. **独立悬浮圆球组件**：需复制 Dock 定位、缩放和 Hover 逻辑，容易在左/右/底部定位中产生偏差。
3. **Teleport 到页面级悬浮层**：会新增坐标同步、层级和 Shadow DOM 交互问题，与最小改动目标不符。

## 设置、文案与验证

“Dock 与侧栏”的 Dock 分组新增三选一 `Select`，补齐简体中文、繁体中文、粤语和英文。设置项、收起按钮 Tooltip 和圆球展开名称均从 locale 获取。

对三种模式的状态解析、进入/离开交互和模式切换先写可执行逻辑测试。完成后检查三个 Dock 位置的中心坐标、毛玻璃开/关、亮色/深色/OLED、键盘焦点和减少动画。运行 `pnpm lint`、`pnpm typecheck` 和一次 `pnpm dev` 首次编译，不执行 production build。
