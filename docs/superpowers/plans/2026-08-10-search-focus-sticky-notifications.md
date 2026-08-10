# Search Focus, Sticky Search, and Notifications Skeleton Plan

**Goal:** 用最小改动统一搜索聚焦语义，让首页单一搜索栏无监听吸附至顶栏，并增加消息页占位与底部 Dock 默认值。

**Architecture:** 聚焦效果由一个纯函数派生；SearchBar 内部统一 TopBar 外观变体；Home 使用 CSS sticky 与等值舞台空间维持单一实例；消息页接入现有 AppPage、Dock 和页面映射。

### Task 1: 聚焦语义与设置清理

- 先为毛玻璃、实色和关闭效果三种组合写失败的纯逻辑测试。
- 新增 `disableSearchFocusEffect`，删除两个旧字段及其 UI、搜索目录、布局编辑入口和旧文案。
- 让 TopBar、Search 与 Home 共用派生结果。

### Task 2: 搜索栏共享外观与单实例吸附

- 将 TopBar 搜索栏外观收进 SearchBar 的共享变体。
- Search 页面复用该变体。
- 重排 Home 搜索舞台为上部空间、sticky 搜索栏、下部空间；TopBar 在首页搜索页模式中始终隐藏自身搜索栏。
- 不新增滚动监听、Observer、Teleport 或第二个 SearchBar。

### Task 3: Dock 默认值与消息页骨架

- 将默认 Dock 位置设为底部。
- 新增 Notifications 枚举、Dock 项、空白页面、页面模式允许项和四语言文案。
- 保持现有通知抽屉逻辑不变。

### Task 4: 验证与开发编译

- 运行聚焦纯逻辑测试、`pnpm lint`、`pnpm typecheck`、`git diff --check`。
- 运行 `pnpm dev`，确认 `extension/` 首次编译成功后停止 watcher。
- 不 stage、commit、push、merge 或创建 PR。
