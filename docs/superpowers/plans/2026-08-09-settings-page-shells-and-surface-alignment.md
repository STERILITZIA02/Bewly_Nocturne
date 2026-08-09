# Settings Page Shells and Surface Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 统一提示卡片与按钮表面，并在 Bewly 页面设置分类中增加播放页和消息页空框架。

**Architecture:** 视觉修复限定在现有组件样式；设置页继续由 `SettingsCategoryLayout` 管理二级导航和标题，只新增两个独立叶子组件。四套 locale、README 与 AGENTS 同步维护同一结构和上游合并边界。

**Tech Stack:** Vue 3、TypeScript、SCSS、Vue I18n、Vite。

---

### Task 1: 提示卡片与按钮表面

**Files:**
- Modify: `src/contentScripts/views/Home/components/VersionReminder.vue`
- Modify: `src/components/TopBar/styles/index.scss`
- Modify: `src/components/CloseButton.vue`

- [x] **Step 1: 运行静态断言并确认当前样式不符合目标**

检查版本提醒仍使用平滑曲线、登录背景仍为主题色 10% 且关闭按钮仍使用透明 elevated 表面；命令应以非零状态结束。

- [x] **Step 2: 应用最小样式修改**

版本提醒保留 `border-radius: var(--bew-panel-radius)` 并改为 `corner-shape: round`；登录按钮使用主题色实色背景和 on-theme 前景；CloseButton surface 使用 elevated solid token，overlay 使用更高不透明度黑色。

- [x] **Step 3: 重跑静态断言**

确认三个组件只使用批准的 token，命令退出码为 0。

### Task 2: 播放页与消息页设置框架

**Files:**
- Modify: `src/components/Settings/Navigation/BewlyPages.vue`
- Create: `src/components/Settings/PluginComponentsAndPages/PlaybackPage/PlaybackPage.vue`
- Create: `src/components/Settings/PluginComponentsAndPages/MessagesPage/MessagesPage.vue`
- Modify: `src/_locales/cmn-CN.yml`
- Modify: `src/_locales/cmn-TW.yml`
- Modify: `src/_locales/jyut.yml`
- Modify: `src/_locales/en.yml`

- [x] **Step 1: 运行结构断言并确认页面尚未注册**

检查 `BewlyPages.vue` 尚无 `playback`、`messages` 页面，命令应以非零状态结束。

- [x] **Step 2: 注册二级页面**

将两个页面值加入允许列表和 `pages` 数组，使用现有 Iconify 图标与异步组件加载；不增加设置状态或兼容逻辑。

- [x] **Step 3: 创建独立空叶子组件**

两个 SFC 仅作为未来设置内容的模块边界，不输出占位卡片或提示文案。

- [x] **Step 4: 同步四套 locale**

新增 `settings.plugin.playback_page`、`settings.plugin.messages_page` 及对应分类说明。

- [x] **Step 5: 重跑结构断言**

确认注册、组件和四套文案齐全，命令退出码为 0。

### Task 3: 维护文档与验证

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [x] **Step 1: 更新用户可见说明**

README 简要记录提示卡片圆角、实色操作按钮和播放/消息设置页框架。

- [x] **Step 2: 更新上游保护基线**

AGENTS 明确上述设计不得被未来上游合并覆盖或恢复为分散实现。

- [x] **Step 3: 运行验证**

运行 `pnpm lint`、`pnpm typecheck` 和 Chromium 开发编译；检查 `git diff --check`。不提交或推送，除非用户另行授权。
