# 上游功能语义适配

基线：`message_feature@ec870c1f`；开始时工作区干净，原 stash `7a6ef9155ccd8e5ce92768702da03b5ae8d7184b` 保留。按本轮明确要求在当前分支按语义修改，不 cherry-pick、不覆盖上游整文件、不 commit/push。开发验证使用 `pnpm dev`，不执行生产 build。

更新：2026-09-09。以下区分源码与自动回归完成状态、实站验收状态。

## 实施与验收进度

- [x] 播放器模式确认、结束推荐、随机播放归属、尺寸调度与竖屏控件。
- [x] PGC 原位播放器、剧集信息、原生 React 交互及切集生命周期。
- [x] 关系写入闭环与在途动态转发事务。
- [x] 转发视频身份、预览设置/拖动复用、交互保留及动态窗口去重。
- [x] MAIN 缺失父评论；本地动态评论的已有等价实现保留。
- [x] 关注分组读取、管理与列表交互。
- [x] 首页 URL、缓存入口置顶、最小启动脚本。
- [x] ContextMenu 行为、元素设置菜单与可选推荐模式胶囊。
- [x] 追加修复原版右栏覆盖画面、播放页刷新暴露原版布局的问题。
- [x] 私信左右边线、仅入场展开/切换淡出、历史逐条浮现与输入栏材质轮廓。
- [x] 当前源码完整 lint、typecheck、test、knip 与开发编译。
- [ ] 最新构建的完整实站桌面 QA；受控性能计数已完成，实站矩阵见下文。

## 上游条目

完整 diff 保存在本机临时审查目录 `/tmp/bewly-upstream-20260908/`；只作为参考，不在运行时使用。上游跟踪引用为 `f8e18fec`，本地包含 Nocturne 独立定制，不向 upstream 推送。

| 提交 | 对应职责 | 状态 |
|---|---|---|
| f39494a / 830793c | 模式应用资格、结束推荐、生命周期 | 已适配；以原生模式状态或本地稳定布局确认完成，点击不记成功；结束推荐不重进、不广播补偿 resize |
| 387666a | 播放器调度与时钟相关生命周期 | 按本地职责吸收；保留已有时钟清理，移除被新模式调用路径替代的无调用切换入口与独立延迟队列 |
| 200c40e | 播放器、随机播放、URL 和菜单一致性 | 已适配；保留 Nocturne 的辅助按钮入口及原生播放器原位锚定 |
| a5a61e8 | PGC 布局与原生交互 | 已适配；另按实站补齐 PaginatedEpList 完整目录、分页/季切换/排序所属根，不复制搬运播放器的 CSS 假设 |
| 143068e + 566a3fb | 关注分组最终功能 | 已适配普通、默认、特别关注、创建/重命名/删除/移动；悄悄关注的入口、专用 API、类型和文案不引入 |
| 89e4aac / 1554f35 | 关注列表操作、语义和行布局 | 已适配；按钮语义、单/双行居中；删除批量离场绝对定位，保留原有视频分页和选择状态 |
| 801c6ed | 视频卡菜单与可见项目分组 | 已适配 Web/App 实际分组、无空分隔、不可压缩的分隔线；已关注作者隐藏拉黑的上游策略不引入 |
| 9fc254f + dd0466b | 转发引用身份、视频布局、悬停预览 | 已适配；区分转发者/原动态作者/视频作者，实际 bvid/cid 与分 P；额外延迟默认关闭，保留当前立即触发策略 |
| 4f1febb | 动态虚拟窗口 | 已适配等价窗口复用与 ref 去重；保留 CardRowMetrics / momentColumnIndex，并补交互保留与不连续间距 |
| 547267d | 动态“更多回复”及树线 | 本地等价保留：useMomentCommentThread 按服务端分页和去重结果判断，MomentCommentTreeGuides 绘制 SVG 路径；未替换成本地不使用的上游 Comments 组件 |
| f8e18fe | 原生评论缺失父链 | 已适配 MAIN 的共享缺失父占位、已知链/排序/折叠/测量及真实节点替换；未知不等于删除，不编造作者正文 |
| ef5d48a | 首页缓存复制成本 | 所有权转移、推荐历史浅复制为本地等价保留；补过期 generation 在计算 snapshot getter 前退出，不引入递归克隆 |
| 3b1548c | 重型包之前的启动处理 | 已适配独立 document-start 小入口、单一启动清理与超时原站恢复；不复制全部初始化立即执行的策略，不使用 body display:none |
| 8952da6 | 元素设置右键菜单 | 已适配现有 ContextMenu、布局编辑注册表、设置导航和配置真值；不恢复旧顶栏模式切换器 |
| 3967caa | 可选推荐模式胶囊 | 已适配，默认关闭；使用现有推荐设置、App 授权、缓存分区、布局编辑和四语言，独立于三档页面模式 |

## 修改边界和状态归属

- `playerModeApplication.ts` 只确认当前任务；`playerMedia.ts` 统一媒体/原位根身份。`index.ts` 沿用导航、Drawer、可见性和重试生命周期，确认后才写完成标记及伴随设置。`playerDomLifecycle.ts`、`randomPlay.ts` 与 `verticalVideoZoom.ts` 共用发现机制；旧 video 仍连接不阻止跟随新主播放器。
- 播放页适配留在现有 `bewlyWidescreen/` 的 constants/nativeDom/videoInfo/geometry/nativeControls/sidebar/playlist/styles；PGC 的 mediaInfo、工具栏和完整目录保留原生节点。MAIN 的 `movedPgcReact.ts` 只为已标记、确实离开原委托根的已挂载节点转发事件，包含点击、悬停、鼠标/指针长按序列；重复绑定、嵌套边界和释放均有明确归属。
- 关注目录为 `Home/following/useFollowingDirectory.ts` 的唯一写入拥有者；分组写入由 `useFollowingGroupWrites.ts` 固定提交快照，菜单/表单与列表展示分别放在 `FollowingGroupActions.vue` / `FollowingSidebar.vue`。读取失败保留现有目录；移动后关闭菜单，重开权威查询成员分组。原有纯视频旧布局保留，分组用于带 UP 侧栏的新布局。
- `userRelation.ts` 统一成功关系通知；原有关系读取 composable 移到共享位置，按账号持有唯一只读关系集合。查询失效与账号失效分开，取消一次搜索不会清空其他卡片的确认结果；写入中的按钮状态归发起者，不再混进关系真值。
- `momentForwardTransactions.ts` 复用原有内存草稿预算、区分 draft revision，并由页面/账号处理已经发出的请求。卡片卸载不等于服务端取消；成功不恢复旧草稿、不自动重发，也不清除更新后的草稿。
- `MomentVideoPreview.vue` 只负责媒体元素、首帧占位与交互；连接仍属于 `useMomentPreviews` / `createPreviewMediaSession`。`useVideoPreviewSwipeSeek.ts` 由 VideoCard 和动态卡共同使用。换源、重入和账号更替沿用媒体 generation；取消的拖动不会变成视频跳转。控制条/拖动默认关闭、封面触发默认开启。
- 虚拟窗口只保留焦点、编辑浮层、在途操作、拖动及全屏卡片，释放后及时回收。普通展开不形成永久保留；缓存恢复的转发编辑区不自动抢焦点。成员对象替换、实际高度/字号/宽度变化仍会失效索引和占位。
- `commentMissingParents.ts`（utils）负责纯父链补全，`inject/commentMissingParents.ts` 负责占位 DOM 与测量边界；MAIN 沿用既有评论 identity/epoch、分页和 Observer。账号变化通过现有页面桥清理，没有另建评论控制器。被替代的原生旧排序、引用补丁及辅助分支已删除。
- `useHomePageRoute.ts` / `homeRoute.ts` 统一 page/tab 解析与写回，复用 `useCurrentLocationHref`。所有写回保留 history.state，延迟清理检查当前 URL；首页入口置顶和内部标签滚动恢复仍由原有 Home/网格协议协调。
- `pageLoading.ts` / `pageLoadingGuard.ts` 在主包前执行，接入 manifest 与现有 tsup 入口。首页与播放页隐藏保留布局测量，iframe 按自身范围揭示；Vue shell 挂载不再过早结束播放页遮挡。播放模式确认、用户退出、非 Bewly 模式和失败超时回到同一启动清理入口。
- 菜单显式区分 action/toggle/radio 及 closeOnSelect；操作打开 Dialog/设置后不抢回焦点。元素设置菜单复用 `layoutEdit` 描述和 settingsStore；Dock 可见性沿用同一修改方法。推荐胶囊通过 `recommendationMode.ts` 与设置页共用选项及授权动作。

## 2026-09-09 追加的播放页回归

实站 `BV1Zibx6yExR` 在较早开发构建 `mtsoyvnl` 下确认：原版 `.left-container.scroll-sticky` 仍是 `position: sticky`，形成独立层叠上下文，即使内部播放器 z-index 很高，后面的原版右栏仍可盖在视频上。原位祖先只清除 z-index/transform 并不足够。

修复将已标记的原位祖先设为 static；原版 `.right-container` / PGC `.plp-r` 中尚未移交的模块仅隐藏绘制，保留原 DOM、尺寸和业务所有权，移到 Bewly 侧栏后自动离开隐藏范围。退出模式撤掉类和规则即恢复原站。刷新时的早期隐藏在播放页延续到模式/控件布局确认，不再在 Vue shell 刚挂载时放开原版页面。

## 2026-09-09 私信交互修复

- 根因：右侧改为透明表面时同时移除了边框；旧展开 reducer 仍根据滚动、回到最新消息与分页完成改变容器形态。切换会话直接替换组件，没有旧内容的离场阶段；输入栏使用普通面板的 12px 圆角，与播放栏的 modal 轮廓不一致。
- `ConversationView.vue` 恢复左右各 1px 语义边线，保持透明背景和已有上下滚动边缘模糊。展开状态只由会话进入/释放控制，滚轮、键盘、历史分页与“新消息”按钮只维护阅读位置和已读资格。删除 `conversationExpansion.ts` 中替代后的滚动收起 reducer、进度和圆角测量分支，保留视口几何与阅读意图纯函数。
- `WhisperWorkspace.vue` 使用现有 Vue Transition 顺序淡出旧会话，再挂载最终选择的会话；旧 DOM 淡出时组件已释放并设为 inert。新会话沿用 200ms 上下展开，完成后才发历史请求，再按实际可见消息逐条浮现。快速切换跳过未挂载的中间项；账号变化立即清除旧内容；焦点等待新 ref，关闭仍回到原会话列表项。临时收件人被确认成正式会话时保留同一组件，避免重置输入和阅读状态。
- 消息输入栏复用播放页底部容器的 `--bew-modal-radius`、平滑圆角、边框、边缘阴影及零 inset 液态边框；内部文本框按现有 8px 内距使用 16px 圆角、普通实色表面。继续使用同一 `vLiquidGlass` 设置和释放路径，没有新增玻璃气泡或内部模糊。
- 实际 ConversationView + 读取 controller 测试覆盖展开前零请求、三条消息的递增延迟、末条浮现后 ACK、滚轮/Home/End/最新消息按钮、分页在滚回底部后返回、迟到响应与卸载/换号。实际 Workspace + Vue Transition 测试覆盖旧组件先清理、顺序离场、快速选择、焦点恢复、跨账号立即清除及临时收件人确认复用。输入法、已购/收藏表情、图片选择与明确发送的原有组件测试保留。

## 验证

当前源码最终完整运行结果：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm knip` 退出码均为 **0**。`git diff --check` 退出 0；分支、跟踪关系和原 stash 保留，未暂存、提交或推送。

- `pnpm test` 包含 targeted-fixes、selected-p2、private-message、notifications 四组完整脚本；包含本轮私信修复的最终日志有 290 项 PASS 输出，另包含定向组合脚本通过信息。保留原有行为断言，因职责移动和明确取消滚动收起更新测试依赖、调用入口与行为期望；不是只检查新增源码字符串。
- 新增八份 `verify-upstream-*.mjs` 由既有 selected-p2 注册。使用实际模块/组件、可控 Promise 和原生结构 fixture，覆盖模式点击未确认、旧媒体、换号、卸载、重开分组菜单、写失败、转发重挂载/新草稿、全屏保留、分 P 媒体、首帧、缺失父占位、目录替换、首页 URL/历史状态、缓存 getter、菜单焦点与启动交接。
- 几何计数：100 次相同布局请求为 0 次新增原站 resize；一次真实尺寸变化为 1 次；结束推荐期间不广播，重放后补 1 次。PGC 没有 BV 在线人数节点仍可由实际控制/发送栏稳定确认。
- 动态计数：同一组 3000 条、同一两列布局，100 次等价窗口为 0 次重复赋值，100 次重复 ref 为 0 次新增观察器注册；测试窗口实际挂载 42 张卡片，并验证不连续交互保留。
- 竖屏控件计数：100 次普通 pointermove 为 0 次布局读取，100 次尺寸信号合并为 1 次 RAF；隐藏缩略导航不调度画面绘制。以上均为实际模块的受控数据与布局，不是实站长任务或收益百分比。
- knip 仍报告 **51 个未使用导出、6 个导出类型、4 个枚举成员**，包含既有后台 transport 导出和历史播放器工具等；退出 0 不代表没有提示，也未通过关闭检查隐藏它们。没有据此宣称全仓不存在死代码。
- 已重启当前项目 `pnpm dev`，MAIN、内容脚本、后台及新增首屏入口均完整编译成功；最新构建标记 **mtsr4vh6**。独立首屏脚本约 2.32 KB；未执行生产 build，也未修改其他 worktree 的开发进程。

## 实站与剩余验收

- 实站结构已核对 `/bangumi/play/ss2572` 与国创 `/bangumi/play/ep1231540`：原位播放器包装/比例占位、Nano 控制栏/发送栏、mediaInfo/工具栏及现代 PaginatedEpList。国创样本实际 video readyState=4，ss2572 有地区限制，未绕过。
- `mtsoyvnl` 下已定位用户截图所示的真实原版右栏叠层问题；刷新后检查样式确认该页面仍未加载追加修复，未把旧脚本现象当作新修复结论。
- **mtsr4vh6 的实站验收待扩展重载**：重载请求已发出。需继续检查两张截图对应 BV、可播放 PGC 的连续切集/目录排序、右栏打开与退出恢复、原生投币/收藏/分享弹窗、三主题、桌面窄窗及缩放、菜单和首页切标签。真实账号关注/分组写入及转发发送未作为实站测试执行。
- 本轮新开的私信验收页实际运行 `mtsr4vh6` 的较早内容脚本：`data-expansion-state="history-open"`，左右边框 0px，输入栏圆角 12px；确认仍是本轮修改之前的版本。当前 dev 已增量编译成功；已请求重新加载开发扩展，随后需核对 `expanded` 标记、左右 1px 边框、24px 外壳、切换/滚动/焦点与三主题桌面表现。未将旧页面现象或组件 fixture 写成新版实站通过。
- 刷新过程尚未做逐帧视觉记录，实站长任务/资源存活未完成同条件对比；不将 fixture 几何计数或开发编译描述为实站视觉/性能通过。上述源码和受控回归完成状态不等同于未执行的浏览器矩阵。
