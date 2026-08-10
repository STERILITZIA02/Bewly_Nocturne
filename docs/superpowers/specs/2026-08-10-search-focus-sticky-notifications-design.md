# 搜索聚焦、单搜索栏吸附与消息页骨架设计

## 目标

将搜索聚焦效果收敛为默认启用的单一语义：毛玻璃模式使用背景模糊，实色模式使用背景变暗；用户可通过“去除搜索栏聚焦效果”同时关闭两者。首页搜索页模式只渲染一个搜索栏，该实例随页面滚动吸附到顶栏位置。Dock 默认位于底部，并增加可配置的“消息页”占位页面。

## 设置与状态

- 新设置 `disableSearchFocusEffect` 默认 `false`。运行时效果由它和 `disableFrostedGlass` 共同派生，不再分别持久化“变暗”和“模糊”。
- 删除旧的 `searchPageDarkenOnSearchFocus`、`searchPageBlurredOnSearchFocus` 字段、设置入口、搜索索引和警告文案，不保留兼容层。
- `dockPosition` 的默认值改为 `bottom`，已有用户保存值不变。

## 搜索栏复用与吸附

搜索栏组件提供一个共享的 TopBar 外观变体，TopBar、独立搜索页和首页搜索舞台使用相同的高度、表面、边框、文字和图标 Token。位置语义与外观语义分离，页面搜索栏不会误用窄屏 TopBar 弹层坐标。

首页搜索页模式将搜索舞台拆为等值的上部空间、单一 sticky 搜索栏和下部空间。搜索栏是 Home 主内容的直接子项，其包含块覆盖整个 Home 页面，因此滚动至顶栏中心后持续吸附，不需要第二个 TopBar 搜索栏、Teleport、滚动监听或 DOM 测量。TopBar 在该模式下始终不渲染自己的搜索栏。

## 消息页

新增 `AppPage.Notifications`、Dock 配置项和空白 Bewly 页面。页面正文仅显示本地化的“消息页”标题，作为后续阶段的结构入口；现有 TopBar 通知抽屉、消息 iframe 与通知业务逻辑完全不变。

## 验证

验证毛玻璃/实色/关闭聚焦效果三种组合、独立搜索页样式、首页单实例吸附、Dock 新默认值、消息页导航与 Dock 内容调整。运行针对性逻辑检查、`pnpm lint`、`pnpm typecheck`、`git diff --check`，并用 `pnpm dev` 编译 Chrome 开发扩展。
