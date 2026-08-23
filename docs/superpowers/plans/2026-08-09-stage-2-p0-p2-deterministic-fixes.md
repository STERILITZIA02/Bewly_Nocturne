# Stage 2 P0–P2 Deterministic Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Stage_2_fix 中已确认的分页、异步竞态、快捷键、URL 清理和编辑器状态错误，同时保持现有 UI 与未来功能骨架不变。

**Architecture:** 在现有 store、composable 与页面组件内增加局部 generation 和显式分页状态；仅为快捷键、URL 清理和播放进度建立小型纯函数。液态分段指示器继续复用现有组件并固定启用，只移除可见开关。

**Tech Stack:** Vue 3 Composition API、Pinia、TypeScript、Vite、现有 WebExtension 消息/API 层。

---

### Task 1: 建立纯逻辑回归入口

**Files:**
- Create: `src/utils/keyboard.ts`
- Create: `src/utils/bilibiliUrl.ts`
- Create: `src/utils/playbackProgress.ts`
- Test: `/private/tmp/bewly-stage2-pure-logic.test.ts`（临时，不进入仓库）

- [ ] **Step 1: 写失败测试**

覆盖 `Shift+Equal -> +`、`Equal -> =`、Meta 组合、Bilibili 参数分类、保留 `p/t/hash`、非 Bilibili URL 原样返回，以及 `progress=-1 -> 100` 和异常数值归一化。

- [ ] **Step 2: 运行失败测试**

Run: `pnpm exec esno /private/tmp/bewly-stage2-pure-logic.test.ts`

Expected: FAIL，因为三个纯函数模块尚不存在。

- [ ] **Step 3: 实现最小纯函数**

`normalizeKeyboardEvent(event)` 统一录制和运行时键值；`cleanBilibiliUrl(url)` 使用 `URL`/`URLSearchParams` 删除共享追踪参数；`normalizePlaybackProgress(progress, duration)` 返回有限的 `0..100`。

- [ ] **Step 4: 运行测试并确认通过**

Run: `pnpm exec esno /private/tmp/bewly-stage2-pure-logic.test.ts`

Expected: PASS。

### Task 2: 修复顶栏动态和稍后再看状态

**Files:**
- Modify: `src/stores/topBarStore.ts`
- Modify: `src/components/TopBar/components/pops/WatchLaterPop.vue`
- Modify: `src/components/TopBar/components/pops/MomentsPop.vue`
- Modify: `src/contentScripts/views/Moments/Moments.vue`

- [ ] **Step 1: 记录尾页和分页失败用例**

临时源代码断言要求 `getTopBarMoments()` 在 `has_more` 判定前处理 items，并要求稍后再看使用显式 next page。

- [ ] **Step 2: 修复动态尾页**

请求前保存 `isFirstPage`；响应后先更新 baseline/offset、过滤与合并 items，再以 `!has_more || items.length === 0` 终止分页。

- [ ] **Step 3: 修复稍后再看分页和完整集合**

增加 `nextWatchLaterPage` 与 generation；首次/换号/强刷重置，分页成功后才推进，按 aid 去重。`syncWatchLaterState(true)` 并行刷新首屏、数量和 `addedWatchLaterList`，旧请求不能覆盖新状态。

- [ ] **Step 4: 修复稳定标识删除和外部同步**

顶栏删除按 aid 重新定位；Moments 与原生/Watch Later 修改路径调用包含完整列表的同步。

### Task 3: 修复 History、登录提示和 Filter

**Files:**
- Modify: `src/contentScripts/views/History/History.vue`
- Modify: `src/contentScripts/views/Home/components/FollowingOld.vue`
- Modify: `src/contentScripts/views/Home/components/Live.vue`
- Modify: `src/contentScripts/views/Home/components/SubscribedSeries.vue`
- Modify: `src/composables/useFilter.ts`

- [ ] **Step 1: History 使用单一 async 加载链**

普通历史用 while 补屏，显式 cursor、request generation 和单一 loading 生命周期；空页、失败、相同 cursor 或模式变化均终止。

- [ ] **Step 2: 分离搜索与普通历史状态**

刷新根据非空 keyword 保持当前模式；搜索成功才推进 page；切换模式清空对应状态并使旧请求失效。

- [ ] **Step 3: 删除按稳定 key 定位**

History 成功响应后按 `business + oid` 重新查找，找不到不删。

- [ ] **Step 4: 登录提示复位**

三个首页组件在 init/成功响应开始时复位 `needToLoginFirst`，仅 `-101` 置 true，并删除重复分支。

- [ ] **Step 5: Filter 深度重编译**

规则数组变化时重新生成字符串/正则集合，忽略非法正则；发布日期使用 `timeDiff >= 0 && timeDiff <= limit`。

### Task 4: 修复快捷键、固定液态指示器和播放进度

**Files:**
- Modify: `src/utils/shortcuts.ts`
- Modify: `src/components/Settings/Shortcuts/Shortcuts.vue`
- Modify: `src/components/Settings/Appearance/Appearance.vue`
- Modify: `src/components/Settings/searchCatalog.ts`
- Modify: `src/contentScripts/views/Home/Home.vue`
- Modify: `src/contentScripts/views/Moments/Moments.vue`
- Modify: `src/_locales/cmn-CN.yml`
- Modify: `src/_locales/cmn-TW.yml`
- Modify: `src/_locales/en.yml`
- Modify: `src/_locales/jyut.yml`
- Modify: `src/contentScripts/views/History/History.vue`
- Modify: `src/contentScripts/views/WatchLater/WatchLater.vue`
- Modify: `src/components/TopBar/components/pops/HistoryPop.vue`
- Modify: `src/components/TopBar/components/pops/WatchLaterPop.vue`

- [ ] **Step 1: 统一快捷键规范化**

录制与运行时均调用 `normalizeKeyboardEvent`；保留可编辑区域屏蔽，允许 Meta；删除 `=` 触发 `+` 的旧特判。

- [ ] **Step 2: 固定液态视觉**

现有分段控件始终渲染 `LiquidSegmentIndicator`，不再读取 storage 开关；移除 Appearance 设置项、搜索入口和对应可见文案，保留旧字段本身。

- [ ] **Step 3: 归一化完成进度**

四个 History/Watch Later 视图复用 `normalizePlaybackProgress`，文本逻辑不变。

### Task 5: 修复卡片、Favorites 与首页请求竞态

**Files:**
- Modify: `src/components/VideoCard/composables/useVideoCardLogic.ts`
- Modify: `src/stores/mainStore.ts`
- Modify: `src/contentScripts/views/Home/components/Ranking.vue`
- Modify: `src/contentScripts/views/Home/components/Weekly.vue`
- Modify: `src/contentScripts/views/Home/components/Trending.vue`

- [ ] **Step 1: 收紧 aid 解析和异常处理**

仅接受明确 aid、bvid API 解析或 PGC episode 解析；直播禁用。toggle 增加 catch，旧视频解析结果继续由 request id/对象检查隔离。

- [ ] **Step 2: 隔离预览旧响应**

video、hover 或设置变化时递增 generation；live、cid 与 preview 响应写入前检查 generation 和当前卡片。

- [ ] **Step 3: 动态生成 Favorites URL**

`getBiliWebPageURLByPage(Favorites)` 调用时读取当前 Cookie；未登录返回不含无效 id 的空间首页 URL。

- [ ] **Step 4: Ranking/Weekly/Trending 增加组件级 generation**

只接受当前 generation 的响应和 finally；Trending 成功后才推进 page，并按 aid 去重。

### Task 6: 修复页面刷新、Tab 校验、URL 清理和 Filter 编辑器

**Files:**
- Modify: `src/contentScripts/views/App.vue`
- Modify: `src/utils/main.ts`
- Modify: `src/inject/index.ts`
- Modify: `src/components/Settings/PluginComponentsAndPages/Home/components/FilterByTitleTable.vue`
- Modify: `src/components/Settings/PluginComponentsAndPages/Home/components/FilterByUserTable.vue`
- Modify: `package.json`

- [ ] **Step 1: 有界等待刷新**

滚动检测最多约 1.8 秒，并用 generation/timer 在新刷新、页面切换和卸载时取消；只调用一次页面刷新。

- [ ] **Step 2: 严格校验 Home Tab 集合**

检查长度、合法性、唯一性以及与默认集合完全一致。

- [ ] **Step 3: 合并 URL 清理来源**

App 当前 URL 和 inject 分享链接都调用 `src/utils/bilibiliUrl.ts`；删除整 URL 的 `%3D/%26` 替换，空 query 不留 `?`，保留 hash。

- [ ] **Step 4: 修复 Filter 编辑器**

新增与编辑都 trim 自身值并做一致重复判断；User 使用通用重复提示；仅编辑中拦截 Escape。

- [ ] **Step 5: 清理失效构建脚本**

删除无调用的 `build:web`。保留 `dev:web`，因为 `mv3client` 明确连接其 `localhost:3303` WebSocket 实现开发 HMR。

### Task 7: 全量验证

**Files:**
- Verify all modified files

- [ ] **Step 1: 运行临时纯逻辑回归**

Run: `pnpm exec esno /private/tmp/bewly-stage2-pure-logic.test.ts`

- [ ] **Step 2: 运行五项验收**

Run sequentially: `pnpm lint`, `pnpm typecheck`, `pnpm knip`, `pnpm build`。

- [ ] **Step 3: 审查差异边界**

Run: `git diff --check`，并逐项确认没有修改页面模式、视觉 token、播放器逻辑或未来功能骨架。不 commit、不 push、不 merge。
