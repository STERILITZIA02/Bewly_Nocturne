# Bewly Widescreen 页面化适配设计

## 当前边界

Bewly Widescreen 目前由三层组成：

1. `contentScripts/index.ts` 决定何时按设置进入宽屏，并协调页面导航。
2. `utils/bewlyWidescreen.ts` 管理准备、提交、交互、DOM 搬移、恢复与清理。
3. `utils/bewlyWidescreenPolicy.ts` 保存不依赖 DOM 的就绪和交互判定。

当前内容来自 Bilibili 原生 DOM。播放器、UP 信息、工具栏、评论、弹幕、选集和推荐都保留原节点与监听器，通过 placeholder 在退出时恢复。该实现是 Bilibili DOM adapter，不应成为未来 Bewly Native 页面的数据层。

## 已建立的稳定契约

- 页面、播放器和语言分别准备，仅在必要条件同时满足时提交布局。
- 侧栏按 `top / comment / danmaku / playlist` 分区报告 readiness；根节点暴露对应 `data-sidebar-*-ready`，内容区同步 `aria-busy`。
- 当前 Bilibili DOM adapter 可以在布局提交后增量 hydration；Shadow DOM 未形成有效内容前不得搬移评论根节点。
- 所有异步结果继续受当前宽屏实例、页面导航和组件生命周期约束。
- 退出必须释放 Observer、timer、RAF、全局 listener，并按 placeholder 恢复原节点。

## 目标结构

```text
WidescreenController
├── PreparationBarrier
│   ├── interface language
│   ├── page readiness
│   └── player readiness
├── WidescreenShell
│   ├── player slot
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
- 侧栏展开始终是覆盖层，不改变播放器几何；点击与贴边只区别于是否固定展开。
- Tab 必须支持方向键、Home/End、`aria-controls` 和独立 loading/error/empty 状态。
- 动画只作用于 Shell 的 transform、opacity 和已定义的布局轨道，并完整支持 reduced-motion。
- 移动端使用同一实例切换布局，不创建第二套播放器或侧栏状态。

## 验收条件

- 视频先就绪时等待页面；页面先就绪时等待视频；语言未确定时不显示 fallback 文案。
- 登录账号、评论、UP 信息和媒体列表不得因 DOM 搬移丢失初始化。
- SPA 导航、扩展重载、全屏切换和手动退出后无残留节点、监听器或定时器。
- 任一 Native 分区替换均可独立回归，不影响其他仍由 Bilibili adapter 提供的分区。
