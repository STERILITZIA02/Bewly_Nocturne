# 2026-09-04 功能与交互审查

## 范围与结论

基线为 `message_feature@7b23095c`，包含开始本轮时已经存在的未提交修改（含投票、评论缓存移植，以及播放页原生弹窗修复）。本轮没有切换分支、提交、推送或同步上游。

按功能检查入口、请求完成后的状态写入、账号/导航切换、卸载清理、错误与重试、键盘操作、共享组件及视觉常量。结论来自源码和可执行回归；按用户要求，真实浏览器目测交给用户，本文不声称视觉或线上 API 验收通过。

| 等级 | 定义 | 确认数量 | 本轮修复 | 保留 |
| --- | --- | ---: | ---: | ---: |
| P0 | 全局不可用或确定的严重破坏 | 0 | 0 | 0 |
| P1 | 跨账号状态/操作对象混淆 | 2 | 0 | 2 |
| P2 | 功能中断、数据遗漏、异步覆盖或关键交互不完整 | 16 | 12 | 4 |
| P3 | 局部交互、生命周期、语言或有界状态问题 | 7 | 6 | 1 |
| P4 | 可保持现有行为和默认外观的维护问题 | 6 | 6 | 0 |
| 合计 |  | 31 | 24 | 7 |

初次审查完成了 12 项 P3/P4 修复。根据后续授权，已继续修复 P2-01、02、03、04、05、07、08、09、10、12、13、14。P1、P2-06/11/15/16、P3-07 按用户要求暂不处理。

## 逐功能覆盖

| 功能 | 检查重点与源码入口 | 结果 |
| --- | --- | --- |
| 内容脚本启动、失效清理 | `contentScripts/index.ts`、manifest、页面桥、现有协议回归 | 启动 generation 和集中销毁继续保留；发现 P2-16 |
| PageMode / Dock / 顶栏来源 | `App.vue`、`Dock.vue`、`useTopBarInteraction.ts` | 保留模式联动、Drawer host、收起动画；P4-06 已修 |
| 首页 For You | `ForYou.vue` 的账号、requestVersion、风控、分页及撤销状态 | 本轮未确认新的独立问题 |
| 首页 Following / FollowingOld / Live / 订阅流 | 账号切换、KeepAlive、selectionToken、尾页和失败状态 | 外层 Home 的账号 key 已隔离缓存；不把子组件缺少重复 watcher 误报为漏洞 |
| 热门 / 每周 / 排行榜 / 入站必刷 | 请求错误反馈、PGC 切换和加载事件 | P2-13；P3-05、P3-06 已修 |
| 番剧页 | 追番、推荐、热门三条加载链、账号切换 | 热门链错误反馈纳入 P2-13；其他两条保留现有隔离 |
| 搜索输入 | 建议、历史、输入法、关闭和卸载 | SearchBar 已有 IME 防护；P3-04 已修；通用 Input 的问题单列 P2-08 |
| 七类搜索结果 | 请求 token、关系补取、分页与滚动模式、过滤空页 | P2-06、P2-07；P4-04 已修 |
| 历史记录 | 初读、搜索、补屏、删除、清空和暂停 | P1-01、P2-01、P2-02 |
| 收藏夹 / 收藏合集 / 图文收藏 | 初始化、分页、切换、补充数据、批量操作 | P1-02、P2-04、P2-05 |
| 稍后再看 | 成员权威状态、分页、删除、打开方式 | P2-03；P4-03 已修 |
| Moments 信息流 | 过滤、缓存、虚拟列、卡高与 rebalance suppression | 继续复用现有观察器，不新增第二套卡高系统 |
| 动态评论、楼中楼、点赞 | target fallback、请求身份、快照与恢复 | 新增快照回归通过；展开元数据的独立 Map 问题为 P3-07 |
| 动态投票 / 转发 | 序列化、单多选、迟到响应、草稿与资源释放 | 投票精度与生命周期回归通过；未验证真实服务端投票 |
| 图文详情 / 图片查看器 | 宽度公式、iframe 身份、焦点和释放路径 | 公式回归保留；真实比例/缩放目测待用户确认 |
| Native Reply / At / Love / System | 单一可见 Feed、独立 cursor、merge-head、read commit、账号隔离 | 本轮未确认新的独立问题；协议 fixture 回归继续执行 |
| 私信读取、ACK、搜索 | 会话 LRU、消息裁剪、历史边界、显式搜索上限 | 读取控制器保留有界策略；写入控制器另有 P2-15 |
| 私信文本发送 | optimistic、服务端对账、失败重试、草稿 | accepted-but-unconfirmed 不自动重发；P2-15 待处理 |
| Bewly Playback Page | 外层 timing、用户退出抑制、增量导航、原生 DOM 所有权和 Loading | 不改内部状态机；P2-14、P2-16 涉及外围类型/选集来源 |
| 视频卡片与悬停预览 | preview generation、资源缓存、成员状态、菜单 | 原有三项预览缓存上限保留；失效色值声明 P4-05 已修 |
| 通用 Dialog / Select / ContextMenu / Input | 键盘、焦点、边界、语义与共享规格 | P2-08～P2-12；P3-02、P3-03、P4-02 已修 |
| 设置与设置搜索 | KeepAlive、焦点、定位 RAF、菜单切换 | P3-01 已修；两条定位入口共用实现 |
| 设置存储 / Cloud Sync / WBI / 消息 transport | 串行写入、epoch、quota/backoff、凭证与响应处理 | 保留现有协议与回归门禁；没有因复用而合并不同鉴权路径 |
| 外观与四套 locale | token、无效变量、硬编码文案 | P3-05、P4-01、P4-02、P4-05 已修；非等值视觉调整未执行 |

## P1：待处理

### P1-01 历史主页面没有账号隔离

- 位置：[History.vue](../../src/contentScripts/views/History/History.vue)，`getHistoryList`、`searchHistoryList`、`deleteHistoryItem`；对照 `App.vue` 的页面 key 只有 `activatedPage`。
- 触发：历史页保持打开，在另一标签切换 Bilibili 账号，再返回、翻页或删除条目。
- 根因：该页没有账号 watcher，读取只检查 `requestGeneration`；删除完成也不检查账号或请求身份。顶栏 HistoryPop 的账号保护没有覆盖主页面。
- 影响：旧账号历史继续显示，后续当前账号结果可追加到旧列表；用户可能对旧界面发起当前账号的操作。
- 建议：用现有账号解析/请求身份方式重置主页面，mutation 捕获账号和条目身份；不新增第二套登录状态。

### P1-02 收藏主页面没有账号隔离

- 位置：[FavoritesPage.vue](../../src/contentScripts/views/Favorites/FavoritesPage.vue)，`initData`、`getFavoriteCategories`、`loadActiveContent`、批量移动/删除；`Favorites.vue` 也没有账号 key。
- 触发：保持收藏页，在其他标签换号后继续切夹、分页或操作。
- 根因：`contentRequestVersion` 只随内容切换/卸载递增；没有与当前 MID 绑定，批量操作成功回写也没有身份判断。
- 影响：旧收藏夹、选择项与当前账号请求并存；发生错误对象显示或操作失败而无准确反馈。
- 建议：先补页面级账号生命周期，再逐条保护列表和 mutation 的回写。

## P2：12 项已修，4 项保留

以下保留发现问题时的触发条件与根因。标为“已修”的条目以文末选择性修复记录为当前状态。

### P2-01 已修：清空历史后可能被在途读取填回

- 位置：[History.vue](../../src/contentScripts/views/History/History.vue)，`getHistoryList` / `clearAllHistory`。
- 触发：历史读取较慢时清空，清空成功后先前读取才返回。
- 根因：清空仅清数组，不递增 generation、不重置 cursor；旧 GET 仍可追加。应让清空使旧读取失效，并重建分页状态。

### P2-02 已修：历史搜索把正在编辑的关键词当成已提交条件

- 位置：[History.vue](../../src/contentScripts/views/History/History.vue)，`isSearchMode`、`searchHistoryList` 与 `v-model.trim="keyword"`。
- 触发：已有分页结果后编辑关键词但不按回车，随后滚动到底部。
- 根因：翻页直接使用输入框实时值，只有回车才会重置页码；新关键词会沿用旧页码并追加到旧列表。应分开输入草稿与当前查询身份。

### P2-03 已修：稍后再看删除后，位置分页会漏项

- 位置：[WatchLater.vue](../../src/contentScripts/views/WatchLater/WatchLater.vue)，`deleteWatchLaterItem` / `getWatchLaterListByPage`。
- 触发：加载前 20 条、删除其中一条，再加载第二页。
- 根因：本地移除后沿用原 `pageNum`；服务端列表向前移动，第二页从原第 22 条开始，原第 21 条可能遗漏。
- 建议：删除成功后重新对齐已加载页边界，保留视觉锚点；不能只做本地 splice。

### P2-04 已修：收藏页把请求失败当成没有更多

- 位置：[FavoritesPage.vue](../../src/contentScripts/views/Favorites/FavoritesPage.vue)，`loadNextPage`、`loadActiveContent`、三类资源 loader。
- 触发：第二页请求失败/风控，或初始化返回非零业务码。
- 根因：请求前递增页码，失败设置 `noMoreContent=true`；初始化的非零业务码又不会成为 rejected。
- 影响：中途停止翻页、显示空内容，且不能原位重试失败页。应分离 error/end 状态并在成功后推进 cursor/page。

### P2-05 已修：收藏合集补头像时，旧结果先写入再校验

- 位置：[FavoritesPage.vue](../../src/contentScripts/views/Favorites/FavoritesPage.vue)，`getFavoriteSeasonResources` 中 `loadedSeasonMedias.value = await enrichFavoriteSeasonMediaFaces(...)`。
- 触发：合集 A 的头像补充请求未结束时切到 B。
- 根因：await 返回的赋值发生在 `requestVersion` 校验之前。A 会覆盖 B 的中间合集数组，后续合并分页可能混入旧内容。
- 建议：先 await 到局部变量，通过身份校验后再一次性提交。

### P2-06 搜索的关系补取之后缺少身份复核

- 位置：[UserSearchPage.vue](../../src/contentScripts/views/SearchResults/pages/UserSearchPage.vue)、[LiveSearchPage.vue](../../src/contentScripts/views/SearchResults/pages/LiveSearchPage.vue) 中 `await batchQueryUserRelations` 之后的回写。
- 触发：A 的搜索已返回，关注关系补取较慢；此时搜索 B 或改变筛选，随后 A 补取结束。
- 根因：搜索主请求 token 已经完成，关系 helper 的过期返回不会阻止调用者继续写入结果/页码。
- 建议：调用者在完整搜索处理链中持有 query/account/generation，校验每个 await 之后的提交。

### P2-07 已修：过滤后零新增会提前封死搜索滚动加载

- 位置：[useLoadMore.ts](../../src/contentScripts/views/SearchResults/composables/useLoadMore.ts) 的 `appendedCount === 0`，以及各搜索页的过滤/去重结果。
- 触发：某页全部被时间/广告过滤或与已有结果重复，服务端仍有后续页。
- 根因：局部“零新增”直接置 `exhausted=true`，覆盖了页面根据服务端总页数做出的判断。
- 建议：区分自动补屏停止与服务端耗尽；保留有上限的补屏和明确的继续加载能力。同时补该 helper 在 reset/dispose 后的异步完成身份检查。

### P2-08 已修：通用 Input 的回车没有输入法保护

- 位置：[Input.vue](../../src/components/Input.vue) 的 `@keydown.enter`；调用方包括收藏夹名称、屏蔽词和过滤规则编辑。
- 触发：中文/日文输入法按回车确认候选。
- 根因：无条件发出 `enter`，可能提前保存/添加尚未提交的文字。SearchBar 已有 `isComposing/keyCode 229` 检查，可按同一语义补齐，不能注册全局快捷键。

### P2-09 已修：通用 Dialog 没有完整的焦点进入、约束和恢复

- 位置：[Dialog.vue](../../src/components/Dialog.vue)，`onMounted`、`isDialogKeyboardOwner`、模板；对照已有 Settings modal 的焦点实现。
- 触发：从键盘打开普通 Dialog，焦点仍停在弹窗外；直接按 ESC 或继续 Tab。
- 根因：挂载只设置 `showDialog`，没有转移/约束焦点，也没有 dialog 语义。Shadow DOM 下 document.activeElement 是 host，当前 owner 判断也可能拒绝 ESC。
- 建议：给共享 Dialog 补完整的局部 modal 焦点协议，保留现有 leave/close 过程及 iframe 详情特殊焦点路径。

### P2-10 已修：通用 Dialog 默认宽高不受视口限制

- 位置：[Dialog.vue](../../src/components/Dialog.vue)，默认宽 `400px`、默认 `maxWidth='unset'`，内容默认高度上限为 auto。
- 触发：窄于 400px 的窗口、较高缩放或长内容弹窗。
- 影响：面板或底部操作可能超出视口；固定定位面板不能靠外层页面滚动补救。
- 建议：共享层提供视口 gutter 和可用高度上限；需要实际目测，不能把所有调用者宽度强行改成同一值。

### P2-11 ContextMenu 菜单项不能用键盘操作

- 位置：[ContextMenu.vue](../../src/components/ContextMenu.vue)，`li.context-menu-item`。
- 根因：仅绑定 click，没有可聚焦项、Enter/Space、方向键或 ESC/焦点恢复。
- 影响：收藏相关菜单缺少键盘路径。应使用已有菜单/按钮语义完成局部交互，不引入全局快捷键。

### P2-12 已修：收藏菜单的横向定位没有视口约束

- 位置：[FavoritesPage.vue](../../src/contentScripts/views/Favorites/FavoritesPage.vue) 的 `openItemMenu`，以及 [ContextMenu.vue](../../src/components/ContextMenu.vue) 的 `margin-left: calc(-140px + 8px)` 等效规则。
- 触发：菜单锚点靠近视口左缘；例如 x=80px 时，140px 菜单的当前偏移会使左缘为负。
- 根因：调用方只处理上下方向，菜单组件固定向左偏移且没有 clamp。
- 建议：复用现有浮层定位策略，分别校验窄窗口和左右侧布局。

### P2-13 已修：部分公共信息流没有失败状态和可见重试

- 位置：[Trending.vue](../../src/contentScripts/views/Home/components/Trending.vue)、[Weekly.vue](../../src/contentScripts/views/Home/components/Weekly.vue)、[Ranking.vue](../../src/contentScripts/views/Home/components/Ranking.vue)、[Anime.vue](../../src/contentScripts/views/Anime/Anime.vue) 的热门请求。
- 根因：Trending 吞掉异常；其他链多为 try/finally，没有对应 error UI；非零业务码也可能留下空列表。
- 影响：用户把“网络失败”看作“没有内容”，部分路径产生未处理 Promise。
- 建议：沿用 VideoCardGrid 的 requestFailed/retry 模式；不重写现有骨架屏和排序布局。

### P2-14 已修：合集内多 P 的自定义顺序仍混用两套列表

- 位置：[randomPlay.ts](../../src/utils/randomPlay.ts)，`getVideoEpisodes` / `getEpisodeEntries`。
- 触发：当前稿件被正确识别为 multipart，同时 DOM 中存在当前分 P 项和合集其他稿件项，启用随机/自定义顺序。
- 根因：选集提取仍把 `.video-pod__item` 与 `.simple-base-item` 一并收集，没有按当前稿件区分播放集合。
- 影响：multipart 设置虽已选对，自定义候选集合仍可能跨到合集其他稿件。
- 建议：先确定当前稿件的分 P 范围，再单独处理合集；不能靠修改整个播放器状态机解决。

### P2-15 私信写入缓存绕过了读取缓存上限

- 位置：[usePrivateMessageWrites.ts](../../src/contentScripts/views/Notifications/whisper/experimental/usePrivateMessageWrites.ts)，`states`、`getState`、`requestFirstPage`、`invalidateConversation`；[ConversationView.vue](../../src/contentScripts/views/Notifications/whisper/ConversationView.vue) 总会读取 writeState。
- 触发：同次访问中对多个会话编辑/发送消息，长时间继续发送。
- 根因：读取控制器有会话 LRU/消息上限，但写入控制器另存历史与草稿，切换仅失效请求，不淘汰 state 或限制合并消息数组。
- 影响：内存设置无法限制这份额外数据。
- 建议：先分离发送对账必需数据与可丢弃历史，保护草稿、在途与 accepted-but-unconfirmed，再实施有界保留；不能直接清 Map。

### P2-16 multipart 真实数据分支没有跨执行上下文的数据来源

- 位置：[player.ts](../../src/utils/player.ts) 的 `#app.__vue__`，以及 [manifest.ts](../../src/manifest.ts) 中两个脚本的 world 配置。
- 根因：player 工具属于 `index.global.js`，manifest 未给它指定 world，因此是 ISOLATED；页面 Vue expando 属于 MAIN。当前逻辑单元测试直接给测试节点挂 `__vue__`，没有模拟此隔离。
- 影响：DOM fallback 仍有效，但“优先读取真实 pages”的分支在真实扩展环境下不能依赖该直读；DOM 尚未出现或结构变化时仍缺少权威判断。
- 这是根据源码与 [Chrome 官方隔离上下文说明](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#work_in_isolated_worlds) 得出的结论。此前将逻辑测试通过等同于真实页面数据可读的判断不充分。
- 建议：通过现有 MAIN/内容脚本桥传递当前稿件的最小 metadata，并校验 BV/导航身份；或复用内容脚本中已确认的同稿件 API 数据。不要为此把整个内容脚本移到 MAIN。

## P3：六项已修，一项保留

### P3-01 已修：设置搜索的延迟定位没有覆盖 KeepAlive/导航取消

- 位置：[Settings.vue](../../src/components/Settings/Settings.vue)。两条定位入口原先各自调度未跟踪的 RAF，在关闭或换目标后仍能滚动/加高亮。
- 修改：复用 `revealSearchTarget`；统一取消 timer/RAF/highlight；在 nextTick 和 RAF 提交时检查 navigation 与 modal 状态；deactivate 与卸载清理。
- 原有滚动方式、视觉高亮和菜单结构保持不变，生命周期回归覆盖旧 nextTick、待执行 RAF 与正常定位。

### P3-02 已修：Select 的外部关闭依赖鼠标先离开触发器

- 位置：[Select.vue](../../src/components/Select.vue)。键盘打开时未必发生 mouseleave，外部点击监听因此可能没有建立。
- 修改：菜单打开时使用现有 VueUse `onClickOutside`，忽略触发器、识别 Teleport 菜单，随 watcher cleanup 移除。保持原有定位和选择事件。

### P3-03 已修：Select 选项列表变短后回车可能读取 undefined

- 位置：同一组件的 `handleOptionKeyDown`。
- 修改：从当前数组取得选项并确认存在后提交；正常选中项的事件与值不变。回归覆盖选项移除后回车。

### P3-04 已修：SearchBar 卸载/失焦失效后，debounce 回调仍可能新发请求

- 位置：[SearchBar.vue](../../src/components/SearchBar/SearchBar.vue) 的 `handleKeywordInput`。
- 修改：在发 API 之前检查 disposed 和 request id，保留响应后的原有检查。回归覆盖旧请求、正常建议去重和卸载。

### P3-05 已修：每周期号搜索提示硬编码中文

- 位置：[Weekly.vue](../../src/contentScripts/views/Home/components/Weekly.vue) 与四套 locale。
- 修改：使用 `home.weekly_search_placeholder`；简体文案保持原字符串，其他三种语言有对应翻译。

### P3-06 已修：PGC 排行榜没有配对的加载事件

- 位置：[Ranking.vue](../../src/contentScripts/views/Home/components/Ranking.vue) 的 `getRankingPgc`。
- 触发：视频排行请求未结束时切到番剧排行，旧请求不会发 afterLoading，PGC 分支此前也不发；Home 的加载标记可能一直保留，使点击当前首页标签刷新被拦截。
- 修改：补齐与普通排行一致的 before/after 事件，只允许当前 generation 结束加载；不改请求参数、列表或外观。

### P3-07 保留：动态展开元数据 Map 没有边界

- 位置：[momentForwardContent.ts](../../src/components/MomentCard/momentForwardContent.ts) 的 `momentDisclosureCache`。
- 已加载评论快照有 16 条上限，转发草稿也有自己的上限，但 comments/forward 的展开标记是模块级 Map，只在主动收起时删除；换账号/离开页面不会清理。
- 这部分不是大体积 DOM 或消息内容，但长期打开不同动态仍会累计键。
- 未直接裁剪：它会改变旧动态滚回后的自动展开恢复行为。应先确定是按页面 session 清理，还是与评论/草稿保留范围合并；不增加第三套配置。

## P4：六项已修

1. **P4-01：20 处等值间距归一。** MomentCard、Moments、设置页、顶栏与版本提醒中的 `4/8/12/16px` 常规 gap/padding，换成已有 `--bew-space-*`。默认计算值相同。涉及媒体几何、原站定位及不能保证等值的 rem 尺寸未机械修改。
2. **P4-02：Input 高度复用现有 token。** small 的 28px、large 的 40px 分别改用 `--bew-control-height-sm/lg`；medium 原来已使用 token。
3. **P4-03：稍后再看的打开方式只有一份分支。** `handleVideoLinkClick` 复用 `handleLinkClick`，四种打开方式、BV URL 和末尾斜杠保持不变。
4. **P4-04：用户搜索共用排序表。** 滚动和翻页模式共用同一 `userOrderMap`；保留原 `order/order_sort` 映射，不按字段名字猜测 API 意义。
5. **P4-05：移除两处未定义颜色变量。** ContextMenu 和 VideoCardContextMenu 原来引用不存在的 `--bew-text-color-2`。删除无效 color 声明，继续继承原来的实际前景色，没有改成新的可见颜色。
6. **P4-06：删除顶栏恒等分支。** `forceWhiteIcon` 末尾原来无论是否首页都返回 false，合并成一次返回；保留其他页面的判断。

## 首次审查阶段的验证与交接

新增 `verify-functional-audit-fixes.ts`，与上一轮测试共用 `sourceFunctionHarness.ts`，不为像素等值替换编写逐行镜像测试。测试覆盖的是四条有异步/交互风险的修复路径。

- `pnpm lint`：最新完整运行退出 0。
- `pnpm typecheck`：最新完整运行退出 0。
- `pnpm test`：最新完整运行退出 0，包含定向、私信和通知协议回归，新增四条修复回归通过。
- `pnpm knip`：退出 0，现有未使用导出/类型/枚举成员警告仍保留，不将每条警告都当成可随意删除的代码。
- 开发编译：`pnpm dev` 的 content、MAIN inject、background/mv3client 首轮均成功；content 共 854 modules，约 23.9 秒。完成后用 Ctrl+C 结束本次启动的 watcher，保留用户已有进程。产物在 `extension/`；本轮未运行生产 build。
- 浏览器 QA：按用户要求未执行，未声称视觉通过。

建议用户重载开发扩展并刷新页面后，优先目测 Select 的鼠标/键盘关闭与选中、设置搜索快速切换/关闭、排行榜快速切换视频/PGC、每周提示语言，以及 token 替换处的浅色/深色/OLED 外观。P1/P2 项按上面的触发步骤分别验收修复，当前保留项不能被测试通过掩盖。

## 后续授权：选择性 P2 修复记录

| 编号 | 当前实现 | 主要位置 |
| --- | --- | --- |
| 01 | 清空开始即失效旧读取；失败保留列表、成功重置 cursor/page；清空期间阻止重复读取 | `History.vue` |
| 02 | 输入草稿与 submittedKeyword 分开；翻页、刷新和重试只使用已提交查询 | `History.vue` |
| 03 | 删除后回读最后一个不满页，继续复用 aid 去重补齐移位条目，保留当前列表 | `WatchLater.vue` |
| 04 | 收藏三类分页仅在成功后推进；保留 failedContentPage，原位重试；补屏与 observer 共享单一加载链 | `FavoritesPage.vue`、`VideoCardGrid.vue` |
| 05 | 合集头像补充先返回局部值，身份校验和转换成功后才提交列表/中间缓存 | `FavoritesPage.vue` |
| 07 | 零新增只暂停自动请求，不推导服务端耗尽；共享面板提供手动继续入口；reset/dispose 取消延迟任务 | `useLoadMore.ts`、`SearchResultsPanel.vue` 及七类搜索页接口 |
| 08 | 通用 Input 忽略 isComposing/keyCode 229 的 Enter，保留普通 Enter 行为 | `Input.vue` |
| 09 | Dialog 提供语义标签、初始焦点、Tab 循环、顶部弹窗归属和关闭恢复；Select 的 Teleport 菜单归入当前 Dialog；独立查看器与原站输入保持各自键盘路径 | `Dialog.vue`、`dialogFocus.ts`、`Select.vue`、`Settings.vue` |
| 10 | Dialog 按视口限制 max-width/max-height；内容通过 flex 收缩，保留 header/footer 和既有关闭动画 | `Dialog.vue` |
| 12 | ContextMenu 使用实测尺寸和共享定位器；点击点随当前视口约束，菜单内容可内部滚动 | `ContextMenu.vue`、`FavoritesPage.vue` |
| 13 | 热门/每周/排行榜/热门番剧显示可重试失败状态；热门保留已有卡片与失败页，每周重试当前失败期号 | 四个页面与 `VideoCardGrid.vue` |
| 14 | multipart 的自定义播放顺序仅取分 P 项；未就绪时不退到其他稿件；其余列表上下文保持原选择路径 | `randomPlay.ts` |

焦点枚举使用 [tabbable](https://github.com/focus-trap/tabbable)，没有引入新的播放器、Dialog 或 Loading 架构。`jsdom` 原本已在锁文件中，现显式用于开发回归。锁文件只增加这两个直接依赖所需条目，没有更新其他包的版本/解析关系。

新增独立 `pnpm verify:selected-p2`，已纳入 `pnpm test`。覆盖清空与旧响应交错、搜索草稿、连续删除分页、失败页重试、补屏 single-flight、旧合集头像响应、过滤空页、卸载取消、真实 DOM 输入法事件、Shadow DOM/嵌套 Dialog/Select portal/iframe 焦点候选、缩放和越界锚点，以及 multipart 候选范围。JSDOM 不具备布局引擎；几何断言验证公式，不作为真实浏览器视觉验收。

本轮选择性 P2 修复的最终验证：

- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm knip` 最新完整运行退出码均为 0。
- `pnpm test` 包含原定向回归、新增 selected-p2 DOM/状态回归、私信协议与通知 fixture；均通过。
- knip 保留原有 52 项 unused exports、7 项 unused exported types、4 项 unused enum members 警告，无新增未使用文件或依赖错误。
- `pnpm dev` 的 content（856 modules，约 24.7 秒）、MAIN inject、background/mv3client 首轮编译均成功。只停止本次启动的 watcher，未处理用户已有进程；产物在 `extension/`。本轮未运行生产 build。
- 浏览器目测继续由用户执行。重点检查：历史查询与清空、删除稍后再看后继续翻页、收藏失败重试、过滤空页继续加载、输入法回车、Dialog 的 ESC/Tab/iframe 与窄窗口、菜单缩放后的边界、公共信息流失败提示、合集内多 P 自定义顺序。
