# 首页搜索与播放页标签修正

继续在 `message_feature` 工作，保留此前未提交的 i18n 作用域修复。本轮未提交或推送。

## 已定位与修改

- `SearchBar.vue`：实站测得人物底边 236px、搜索框顶边 230px，固定 bottom=40px 小于实际搜索框高度 46px。改为 `bottom: 100%`，以搜索框真实高度定位，保留人物原有显隐与动画。
- `Home.vue`、`useHomeTabState.ts`、`useCardWindow.ts`：整合首页重新挂载时明确回到 0，保留 ForYou 数据、撤销记录、卡片状态与测量缓存。复用现有 restoreScroll 回调返回“页面明确重置位置”的信号，阻止卡片窗口在其后恢复旧锚点；Home 内部切换分类后恢复原有滚动记忆。打开整合搜索设置时也立即回顶。后续实站确认刷新后仍偏移 318px：迟到的登录资料触发账号初始化，覆盖了挂载时的回顶。现在该分支继续保留入口回顶意图；滚动位于 0 时，网格重测或换数据也不再恢复旧内容锚点。
- `bewlyWidescreen/styles/layout.ts`：原生标签的圆角在 `.tag-link` 上，旧样式却在无圆角的 `.ordinary-tag` 外层绘制 hover/focus 背景。现在 hover、active 和 focus-visible 均由实际胶囊链接绘制，并覆盖音乐标签，保留原生点击处理。
- `bewlyWidescreen/constants.ts`、`nativeDom.ts`、`sidebar.ts`、`styles/layout.ts`：实站确认音乐详情已创建为 `#bgm-entry > #musicApp`，但处于原站 sticky 容器的低层级。音乐入口创建时复用既有 Observer 与搬运记录，把独立原生音乐应用移至 body 浮层，使用项目 HUD 层级。若入口是在 Bewly 标签槽位中生成，恢复锚点放在原生标签原位，避免退出时丢失。音乐内部列表更新不触发整个侧栏重载。原生音乐应用仍负责内容、播放、分享和关闭。
- `Home.vue`：已复现首页“小圆球”根因。`profile-unavailable` 分支给 `PageAsyncLoading` 强加横向 flex，内层启用 inline-size containment 的视频网格因无固有宽度而塌缩为 0，封面和文字宽度为 0，仅剩固定尺寸圆形占位。移除这个错误的调用方布局，让整页加载组件继续拥有布局。上一轮对播放页 player-mark 的错误归因及改动已撤回。
- `VideoCardCover.vue`：补齐普通 MP4 的初始化骨架，并把 HLS/FLV 的退出时机统一到实际解码数据（loadeddata/canplay）。Manifest 和下载完成不再提前撤掉骨架；动态加载流媒体库期间也保留占位。复用已有 session AbortController 和 generation，初始化完成后再显示已有预览控制栏。Bilibili 原生播放器的媒体缓冲不变。

## 验证

- 最新完整 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm knip` 均退出 0。knip 保留原有提示；开发 `pnpm dev` 编译成功，未执行生产 build。
- 实际 `useCardWindow` 回归：明确回顶时 scrollTop=0，普通恢复继续定位旧锚点（夹具 4983px）；首次窗口回到第一行。
- 实际 Home setup 回归：组件先挂载，再分别完成登录状态与 MID 请求，scrollTop 保持 0；搜索区可见时进入未缓存分类保留位置，已滚入列表时进入未缓存分类回到视频区起点，已访问分类继续恢复滚动记忆。切换后账号更新也不滚走可见搜索区。实际预览组件覆盖 MP4/HLS/FLV、迟到事件、首帧前占位、控制栏恢复和卸载释放。
- 实际原生搬运模块回归：音乐入口迟到创建能触发处理、移至 body、重复处理幂等、点击监听保留、归还到原生标签位置；音乐内部更新不触发侧栏 hydration。
- 单独叶子卡片夹具此前没有复现问题，不能代表父层加载状态。补充实际 `PageAsyncLoading`、`VideoCardGrid`、`VideoCardCover`、`VideoCardInfo` 和 UnoCSS 后，桌面对比复现：旧调用 root=1232px、grid=0px、cover=0px，仅圆形占位保持 32/34px；修复后的 grid=1232px、cover=293×164.8125px。
- **新脚本实站 QA 待重载**：已请求用户重载开发扩展；Chrome 内部管理页无法由浏览器工具接管。人物最终边界、跨页面回到首页、标签 hover/点击和原生音乐详情的修复后实站交互尚不能声明通过。临时验收服务与页面已关闭，用户页面恢复原首页分类与收起侧栏。
- 后续独立实站刷新仍测到 318px；该页已生成预览容器却没有本轮新增的 `aria-busy`，确认仍使用旧内容脚本。须先重载开发扩展，再验收新脚本的连续刷新，不能把旧脚本的结果计为修复后通过。

## 人工检查

每周必看补充修复：`Weekly.vue` 原先在期号列表异步返回后无条件调用 `handleBackToTop(HOME_SEARCH_STAGE_HEIGHT)`，覆盖首页选择的位置；已移除这次数据回调中的滚动。手动切换期号只允许回滚，不再把仍可见的搜索区向上推出视口。实际 Weekly 组件回归覆盖迟到期号、刷新、顶部/列表中的期号选择、独立搜索模式和卸载后的迟到响应；实站需重载开发扩展后复验。

重载扩展并刷新页面后，检查搜索人物与框顶对齐；首页内部分类切换保留位置，而刷新、离开再进入整合首页回到顶部，并在登录资料完成后保持；首页账号加载骨架有完整封面和文字，预览首帧前保持骨架。播放侧栏的普通/音乐标签无矩形底板，音乐详情可打开、关闭并可在退出/重进 Bewly 模式后再次打开。只检查桌面窗口。
