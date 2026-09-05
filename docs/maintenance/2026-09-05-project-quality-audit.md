# Bewly Nocturne 0.1.1 项目质量审核

日期：2026-09-05。基线：`message_feature@c7590b59`。审核与修复留在当前分支，没有 commit、push、PR 或 stash 操作。

共记录 31 项：P1 1 项、P2 13 项、P3 12 项、P4 5 项。首批修复 13 项；随后按用户指定完成 01、05–14 和 25，共 25 项已落地，剩余 02、03、04、26、30、31。等级描述的是原问题影响，不因已修复而降级。各项证据与验证边界见正文。

后续范围调整：用户取消了“稿件关闭弹幕或评论后继续加载”的追加任务，本批没有修改该逻辑；用户明确扩展只适配桌面，后续停止移动设备分辨率测试，不新增移动端专用分支。

随后经用户批准，本文的五项结构方案已落地，详见 [结构重构记录](2026-09-05-structural-refactor.md)。下文保留原问题编号；第 31 项仍记录其他大页面和未收敛菜单的后续结构债务。

## 范围和证据

本次检查了首页各子页、搜索、番剧、历史、收藏、稍后再看、动态、通知/私信、设置、Dock/TopBar、共享控件、播放器与 MAIN/ISOLATED 桥、扩展启动和设置后台的关键调用链，并扫描字号/字重、颜色、定时器、Observer、RAF、缓存和清理代码。检索清单含 542 个源码、配置、脚本文件；这不表示逐行读完全部文件。

证据分为：

- **源码**：明确的调用路径、状态更新或 CSS 规则。
- **隔离复现**：执行实际源码函数，使用受控请求、时钟或 DOM；没有向真实账号发送写请求。
- **浏览器**：当前实际界面截图、辅助功能树及交互观察。

真实浏览器审核不是全功能验收。初始用户 Chrome 副本与目录匹配的开发扩展不同，二者的设置和截图不能直接互作视觉回归基线。已在 Chrome 扩展详情页确认开发副本加载自 `~/个人项目/bewlyCat/extension`，点击重新加载得到“已重新加载”，再刷新页面。开发副本的首页、设置和浅色/深色/OLED 状态进行了实测。其他业务故障主要由源码和隔离测试确认，没有执行真实删除、关注、转发、投票或私信发送。

优先级：P0 为广泛、立即阻断发布的灾难性问题；P1 为高影响且应优先修复的问题；P2 为具体场景的功能、交互或可访问性缺陷；P3 为局部体验、资源浪费和维护问题；P4 为低风险工程一致性问题。没有为凑齐分级而制造 P0。

## 逐项问题

### P0

在本次已审查范围内未发现有充分证据的 P0。未执行完整安全渗透、全部服务端协议或所有浏览器环境的测试。

### P1

**01 · 通用确认框的 Enter 可以执行与焦点相反的破坏性操作。已修复。**

- 文件：`src/contentScripts/views/App.vue`，`onKeyStroke('Enter')`、`showConfirmDialog` 和 `.bew-confirm-dialog`；调用方包括 History 清空和 Favorites 删除。
- 根因：独立确认层脱离了 Dialog 的焦点管理，注册 window 级 Enter，无条件调用 `finishConfirmDialog(true)`，既不检查焦点目标，也不检查 IME。确认框没有初始焦点、Tab 范围约束及焦点恢复。
- 触发：确认框出现后，在“取消”按钮上按 Enter，或背景输入法正在确认文字。全局 keydown 的 `preventDefault` 可以阻止按钮本来的默认行为，再确认删除。
- 证据：隔离执行实际注册的处理器，模拟取消焦点和 `isComposing: true`，两次结果均为 `true`；真实业务写操作为 0。
- 修改：静态确认 DOM/样式移入 `ConfirmDialog.vue`，队列归 `useConfirmDialogHost.ts`。复用 Dialog 焦点工具，默认聚焦取消，Enter/Space 由当前原生按钮处理；局部处理 Tab/Escape/IME，不注册全局快捷键。保留先卸载再 resolve，发起组件停用、销毁、导航或账号变化时取消排队和关闭中的请求。
- 验证：实际 SFC/队列测试覆盖焦点、IME、取消、关闭中失效、KeepAlive 停用/恢复和释放。重载后的开发扩展真实 History 确认框默认聚焦取消，在取消上按 Enter 关闭并恢复“清除所有观看历史”按钮焦点；Tab 和 Escape 路径已操作。没有提交清空操作。

### P2

**02 · 消息服务端设置缺少账号与页面 generation。未修改。**

- 文件：`src/components/Settings/PluginComponentsAndPages/MessagesPage/MessagesPage.vue`、`useMessageServerSettings.ts`。
- 根因：controller 的 load、字段 mutation 后回读、屏蔽词读写都没有账号身份和 dispose 检查；页面只在 mounted 时 load，而全局 Settings 使用 KeepAlive。
- 触发：账号 A 打开过消息设置，关闭设置后切到 B，再打开；旧值可能继续显示。A 的慢回读也可以写入已变化的页面状态。
- 影响：用户可能根据 A 的值操作 B 的服务端设置；这与“服务端权威值”要求不一致。
- 方向：用现有账号来源建立 scope；账号切换清空 confirmed 值和请求身份；每个字段继续独立提交、独立回读，不能把远端值写入本地 settings。

**03 · History 主页面未按账号隔离。未修改。**

- 文件：`src/contentScripts/views/History/History.vue`，`getHistoryList`、`searchHistoryList`、删除/暂停状态方法。
- 根因：读取只校验查询 generation；没有监听登录/MID 变化。`clearAllHistory` 有一次账号检查，但其他入口没有同等边界，且确认前没有捕获账号。
- 影响：留在历史页切换账号后仍展示旧账号历史，旧请求可继续追加，清空确认的对象可能与实际提交账号不同。
- 方向：复用 topBarStore 的身份，统一覆盖列表、查询、暂停状态和所有 mutation；不要仅给一处 await 加判断。
- 第 01 项已取消导航/账号变化时尚未提交的确认请求；这不等于修复 History 列表和已发出 mutation 的完整账号隔离。

**04 · Favorites 主页面的账号和 mutation 生命周期不完整。未修改。**

- 文件：`src/contentScripts/views/Favorites/FavoritesPage.vue`，`initData`、`handleEditFolderConfirm`、`deleteFolders`、`unfavSeasons` 和批量操作。
- 根因：contentRequestVersion 主要保护读取；页面没有账号 watcher，写入后的 folder 修改、集合删除、toast 和顶栏通知未绑定请求时账号/页面。
- 影响：账号切换后旧收藏继续显示；批量操作途中发生切换，后续请求会读取新 Cookie；晚响应可能影响后来的视图。
- 方向：先建立页面级账号 scope，再分别保护 bootstrap、内容页和 mutation，继续复用 `notifyFavoritesChanged()`。

**05 · User/Live 搜索在关系补取后丢失请求所有权。已修复。**

- 文件：`UserSearchPage.vue:handlePageChange/performSearch`、`LiveSearchPage.vue`、`composables/useSearchRequest.ts`。
- 根因：搜索 composable 只保护主请求。页面拿到 response 后 `await batchQueryUserRelations()`，随后继续修改 results、分页、URL 和 loading，没有再次检查查询身份。
- 影响：快速搜索、切排序、翻页或离开分类时，旧结果和页码覆盖新状态。
- 证据：实际 UserSearch 函数的隔离复现得到 `keyword=new`、`renderedResult=old`、`currentPage=2`，真实网络请求为 0。
- 修改：`useSearchRequest` 接收可选响应处理回调，把关系补取纳入同一请求 token 和 loading 生命周期；User/Live 页面在补取之后复核身份，再提交分页和 URL。账号、去个性化设置、查询、排序和页面释放均使旧请求失效；两页删除重复分页处理和额外 loading 标记。
- 验证：受控延迟主请求/关系响应执行实际页面函数，覆盖新旧查询竞争、分页、URL、loading 和账号切换；迟到响应不再覆盖新查询。关系 mutation 与旧批量回读的竞争由第 14 项一起保护。

**06 · 直播“全部”模式只刷新房间排序，却保留旧分页位置。已修复。**

- 文件：`LiveSearchPage.vue:refreshLiveRoomsOnly`。
- 根因：请求第 1 页并替换房间后，只更新 liveRoomTotalResults，没有重置 currentPage、hasMore/exhausted 和加载控制器。
- 触发：已加载多页或达到尾页，再变更房间排序。
- 影响：可能从旧页码的下一页继续，跳过新排序的中间页；也可能继续保持 exhausted 而无法加载。
- 修改：房间排序刷新保留主播列表和主播总数，同时重置房间分页与加载控制器，成功后统一提交第 1 页及 URL；随后加载从第 2 页开始。筛选 watcher 读取具体字段，覆盖同一 filters 对象的原地更新。
- 验证：从第 5 页、exhausted 状态改排序的实际函数测试通过；主播不被替换，下一页为 2。

**07 · 直播嵌套结果分支与尾页判定不一致。已修复。**

- 文件：`LiveSearchPage.vue:performSearch`。
- 根因：前面支持 `result.live_user` / `result.live_room` 数组；结尾在非 all 模式只检查 `Array.isArray(rawData.result)`，对已接受的嵌套结果得到 0。
- 影响：走到该分支时，已显示非空结果却被判定 exhausted。
- 修改：同一次标准化产生 rooms/users，渲染、分页和 exhausted 判定共用这些数组，不再重新猜测 raw result 的形状。
- 验证：房间/主播两分类的扁平和嵌套形态均有受控 fixture，并执行同一页面处理函数。没有声称两种形态都已从当前线上重新采集。

**08 · 通用 ContextMenu 仍只能用鼠标选择。已修复。**

- 文件：`src/components/ContextMenu.vue`。
- 根因：菜单是仅有 click 的 li，没有 menu/menuitem 语义、可聚焦项、方向键/Enter/Space、Escape 和焦点恢复。
- 影响：收藏文件夹等使用此组件的入口缺少键盘路径。VideoCardContextMenu 已有局部键盘实现，两个组件的能力不一致。
- 修改：菜单项改用原生 button 和 menu/menuitem 语义；加入初始焦点、上下方向键、Home/End、Escape、Tab 离开和焦点恢复，保留原定位及表面。复用 Dialog portal 归属和焦点恢复工具。Favorites 传递实际触发按钮，键盘打开按按钮矩形定位，保留菜单项内容。
- 验证：真实 SFC 挂载测试覆盖方向键、原生激活、Escape、卸载/选项变化和焦点恢复。开发浏览器已打开收藏菜单并读到编辑/删除语义；原生自动化未提供可靠的菜单焦点变化证据，未把该过程记为完整键盘浏览器验收，也没有执行菜单项。

**09 · 外观设置在窄窗口中发生布局挤压。已修复。**

- 文件：`Appearance.vue` 的 `.slider-control { width: 220px }`、312px/252px 色板，以及 `SettingsItem.vue` 的同排不可收缩控件。
- 浏览器证据：390×844 下，毛玻璃模糊强度标题变成逐字纵排，右侧控件挤出内容区；见截图 04。
- 修改：共享 `SettingsItem` 允许宽控件换行，标题保留 token 定义的最小可读宽度；右侧和直接子控件约束最大宽度，时间输入允许收缩。按实际内容宽度自然换行，没有引入移动端布局分支。
- 验证：开发扩展重载后的窄窗口已观察到标题/滑块正确分行；用户随后明确不测试移动端，停止该分辨率验证。关闭设备模拟后重新加载桌面首页，正常桌面设置仍保持同排控件布局，见截图 11。完整桌面缩放矩阵未执行。

**10 · 私信写入 controller 绕过读取侧缓存上限。已修复。**

- 文件：`whisper/experimental/usePrivateMessageWrites.ts:getState/dispose`、`Notifications.vue`、`ConversationView.vue`。
- 根因：读取侧存在 LRU 和消息上限，写入侧另建 states Map，没有同等淘汰和消息裁剪。ConversationView 每个会话会访问 writeState；写入 controller 还保留历史/ACK 等读取能力。
- 影响：长时间浏览会话时，设置的缓存数量不能约束全部状态；发送/对账后的数组可额外保留。不能只从读取侧 Map 大小宣称私信内存有界。
- 修改：先补齐写入侧缓存限制；后续结构重构通过 `usePrivateMessageWorkspace` 收敛为唯一读取历史。写入 controller 不再保留服务端历史、分页和 ACK，只保存草稿/未确认事务；历史消息裁剪与分页边界留在读取侧。离开 Notifications、切换账号和销毁时释放相应状态。没有复制 unread 或改动发送协议。
- 保护边界：当前会话、发送/ACK/图片任务、草稿及未确认本地事务不淘汰；受保护工作超过设置上限时允许临时超额。已确认历史与闲置会话受到上限约束，不能将其描述为任意数量未完成草稿下的严格总内存硬上限。草稿不持久化。
- 验证：消息裁剪、独立 older cursor、LRU、预算为 1 时未确认事务不被裁成假成功、草稿保护、ACK 保护和页面退出晚响应全部通过。结构重构另验证了读写共用一次历史请求完成对账，写入侧不保存第二份已确认历史。

**11 · multipart 判断仍依赖 MAIN world 的 Vue expando。已修复源码；真实多 P 浏览器链路待补验收。**

- 文件：`src/utils/player.ts:detectVideoType`。
- 根因：ISOLATED 内容脚本读取 `#app.__vue__.videoData` / `isSection`，不能依赖跨 world 可见性；后续 DOM 猜测无法完整区分合集与分 P。
- 影响：合集里的多 P 视频可能套用错误的播放模式或顺序配置。
- 修改：新增 `inject/videoMetadata.ts` 在 MAIN 读取原站当前稿件，复用既有 page bridge channel，通过 JSON 字符串 DOM 事件传递 aid/BV/分 P 数/合集标记；ISOLATED 校验频道、请求号、当前 URL 与稿件身份。`player.ts` 不再直接读 Vue expando，真实多 P 优先于合集；列表/稍后再看上下文优先级保留。
- 生命周期：MAIN 只监听当前 Vue 小字段、既有导航和媒体事件，切换 owner/销毁时清理；内容脚本复用已有页面稳定期限与播放模式入口，不新增轮询或 readiness。相同稿件的跟踪参数/hash 清理不重复触发自动播放设置。
- 验证：执行实际 MAIN 源码与读取端，在独立 VM 上下文经 DOM 字符串事件测试稿件变化、过期响应、合集、多 P 和 watcher 清理。该测试不是 Chrome 真实隔离世界验收。Chrome 控制台曾出现自粘贴保护，未绕过；真实多 P/合集/列表/Drawer 切换仍列为人工检查。
- 平台依据：[Chrome 隔离世界与共享 DOM](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[DOM 事件同步分发](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/dispatchEvent)。

**12 · 封面加载失败会一直保留骨架。已修复。**

- 文件：`src/components/LazyPicture.vue` 的 img 和 `isLoaded`。
- 根因：仅在 load 设置完成，没有 error 状态或有限恢复策略；AVIF/WebP source 请求失败也不会由组件转入明确失败状态。
- 影响：失效封面/CDN 失败看起来像永远未加载完成，而不是已失败。
- 修改：`LazyPicture` 为当前图片增加失败状态；优选 CDN 格式失败后仅尝试一次调用方原始 URL，再失败则结束骨架并显示使用主题 token 和四语言文案的占位。换 src 重置；旧图片的 load/error 不得污染当前图片。保留原媒体几何，未在视频链接内嵌套重试按钮。
- 验证：真实 SFC 的有限重试、最终失败、src 切换与旧事件测试通过；未向真实页面人为制造 CDN 故障。

**13 · 番剧追番区把请求失败展示成空列表。已修复。**

- 文件：`src/contentScripts/views/Anime/Anime.vue:getAnimeWatchList`。
- 根因：非 0 响应和 catch 均清空 animeWatchList；没有像推荐/热门区那样的失败状态和重试入口。
- 影响：用户分不清“没有追番”和“加载失败”；只能尝试全页刷新。
- 修改：追番区区分有效空响应与请求失败，失败显示现有错误/重试组件；重试只请求该流，保持 single-flight 和页面 generation。推荐、热门等其他流不受影响。
- 验证：API/网络失败、重试、有效空数组和旧 generation 响应均通过实际函数测试。

**14 · 用户卡片关注结果可能被错误反转，失败也没有用户反馈。已修复。**

- 文件：`src/components/UserCard/UserCard.vue:handleFollowClick` 和 `isFollowed` watcher。
- 根因：提交时用当前状态确定 act，返回时却执行 `isFollowing = !isFollowing`。中间父级关系补取可更新 isFollowing；没有保存提交目标状态/身份。错误只写 console。
- 影响：请求成功后可能显示相反的关注状态；失败时按钮恢复原样，没有可理解的提示。
- 修改：提交时固定目标关注状态、账号、MID 和 generation；成功提交固定目标，失败恢复最新关系并通过共用 toast 提示。父级补取不再中途反转 pending 状态；关系 composable 按 MID 记录确认 mutation 的版本，旧批量响应不能覆盖它。账号变化和组件释放使旧操作失效。
- 验证：受控成功响应与父状态变化竞争、旧关系补取、账号重置通过。未在真实账号执行关注/取关。

### P3

**15 · 横向滚动会吞掉边缘滚轮和触控板缩放。已修复。**

- 文件：`HorizontalScrollView.vue`。
- 原因：开启横向滚动时对所有 wheel 无条件 preventDefault；没有溢出、到达边缘和 Ctrl 缩放例外。
- 修改：仅在纵向滚轮可推动该横向容器时拦截；保留原生横向手势和缩放；事件绑定到实际节点并对称清理；删除失效注释实现。
- 验证：真实源码函数覆盖起点、终点、无溢出、横向手势和 Ctrl 分支。未把该测试称作真实触控板测试。

**16 · 顶栏 Pop 滚动 RAF 没有取消，监听可能留在旧节点。已修复。**

- 文件：`useOptimizedScroll.ts`，影响 History/Favorites/Moments/WatchLater Pop。
- 修改：记录并取消 RAF/timeout；模板 ref 更换和组件销毁时从原节点移除监听。无滚动区域的百分比为 0，避免 NaN/Infinity。
- 验证：隔离测试覆盖节点替换、卸载及不再触发分页回调；保留原阈值与节流时长。

**17 · 图片回收同批入队进行二次方扫描。已修复。**

- 文件：`LazyPicture.vue`。
- 原因：每放入一个延迟回收任务就遍历全部 pending Map、清除和重建定时器。
- 修改：同批任务复用最早 deadline；到期才统一扫描；最后一项取消时清除 timer。
- 实际执行 HEAD 与修改后的函数对比：200 张封面入队的 Map 条目访问 **20,100 → 0**，定时器创建 **200 → 1**，取消 **199 → 0**。到期仍按原 delay 执行必要回收。
- 范围：开启离屏回收时受益；这不是整页 FPS/CPU 百分比测量。

**18 · 非定时主题也常驻 30 秒时钟。已修复。**

- 文件：`useDark.ts`。
- 修改：仅 theme=scheduled 时启动；进入定时主题立即校时，离开定时模式或释放 scope 时取消。保留原有 30 秒精度和主题派生规则。
- 影响：每个不使用定时主题的上下文少一次周期唤醒；单处收益很小，不称作重大性能提升。

**19 · 原站广告卡片过滤停止后仍有待执行 RAF。已修复。**

- 文件：`contentScripts/features/blockUselessFeedCards.ts`。
- 修改：用可取消 frame ID 代替布尔标记；停止时取消，避免旧帧在快速关闭/开启后消费新队列。过滤规则、DOM 识别与样式均未改。

**20 · 无关设置变化也重写防移动端跳转 DNR 规则。已修复。**

- 文件：`src/background/index.ts`。
- 原因：任何 settings storage change 都调用 updateDynamicRules，包括字体、颜色和滑块更新。
- 修改：比较该开关的前后规范化值，只在它实际变化时更新；冷启动初始化和规则内容保留。

**21 · 已有 aid 在卡片转换中丢失，制造逐卡详情请求。已修复明确字段的路径。**

- 文件：Home 的 `Trending.vue`、`Weekly.vue`、`Ranking.vue`、`Precious.vue`、`ForYou.vue`，以及 `forYouStore.ts`。
- 修改：保留接口已有的 aid / args.aid，使稍后再看直接使用已有标识。
- 验证：五类 adapter 的实际函数夹具经过 resolver，详情请求数为 0；只有 BV 的数据仍按原逻辑解析。直播/剧集/通用 id 不被推断为 aid。
- 边界：Web 推荐 id、收藏资源 id 等需按真实协议证明语义后再扩展，不通过全局 `id || aid` 简化。

**22 · 两份实体解码器都会截断 Unicode 补充平面字符。已修复。**

- 文件：`src/utils/htmlDecode.ts`、`SearchResults/searchTransforms.ts`。
- 原因：使用 fromCharCode 解码码点，emoji 和扩展汉字被截成 UTF-16 单元；搜索另有一份较少命名实体的拷贝。
- 修改：复用一个解码器、使用有效范围内的 fromCodePoint，十进制实体只接受数字。没有引入 HTML 执行或新依赖。
- 验证：十进制/十六进制 emoji、扩展汉字、常用命名实体、非法数字和越界值。

**23 · 设置开关/输入/滑块缺少可访问名称；折叠菜单名称消失。已修复。**

- 文件：`formFieldLabel.ts`、`SettingsItem.vue`、`Radio.vue`、`Input.vue`、`Slider.vue`、`Select.vue`、`Settings.vue`，Home 布局标签及其 types。
- 修改：设置项可见标题通过共享注入契约关联实际控件；Radio 显式 label 仍优先；Select 名称包含设置标题和当前值。主设置导航始终有名称，Home 布局按钮复用现有四语言文案。
- 证据：修改前浏览器树只有匿名 checkbox。开发扩展重载后读到“触屏体验改进”“毛玻璃模糊强度”“主题 亮色”等正确名称。
- 验证：实际 SFC 挂载测试覆盖标题关联、唯一 ID、语言更新和显式标签优先；浏览器确认 Radio/Select/Slider 名称，通用 Input 由 SFC 测试覆盖。DOM 几何和控件视觉样式未改。

**24 · Tooltip 在键盘聚焦时不显示。已修复。**

- 文件：`Tooltip.vue`。
- 修改：复用同一显示规则支持 focus-within；鼠标行为和布局不变。
- 边界：这只解决焦点显示。所有 Tooltip 与触发项的完整 aria-describedby 关联仍需按调用方设计，不能宣称完成整套屏幕阅读器语义。

**25 · 部分标题层级和字号仍与项目规范不一致。已按追加授权修复。**

- 文件：`SettingsItemGroup.vue`、`unocss.config.ts`、`variables.scss`，以及少量 search/card 模板。
- 修改前浏览器实测：设置区块标题为 15px / 22.5px / 700；AGENTS 为普通区块标题建议 600。原全局 rem 转换以 15px 为基数，text-sm=13.125px、text-xs=11.25px，不能直接当作 13/12px 语义字号。
- 修改：UnoCSS xs/sm/base/lg 改为 caption 12/16、control 13/18、body 15/24、heading 20/28；xl/2xl 使用既有展示/数据 token。间距的 rem 转换保持原值。普通设置区块、搜索分组、文章/电影/电竞卡片标题和 TopBar 媒体条目使用 title 15/22/600，正文默认 400，保留品牌/关键数字的 700。
- 卡片字号仍保留四档设置。标题样式、双行占位与骨架共用实际语义行高；信息区高度复用实际信息行高度与作者行高，避免作者调大而标签保持小时被固定高度裁切。默认信息区最小高度仍为原有 46px，没有新增虚拟卡高系统。
- 验证：UnoCSS generator 真实输出语义字号/行高对，并证明 `p-4` 间距转换未变；共享卡片 computed 设置响应性回归通过。开发扩展桌面首页/设置截图显示排版正常；全部字号组合、桌面缩放、四语言与主题矩阵未逐一实测。不把原生组件特殊徽标、图标和展示数据的有意字号一律替换为正文字号。

**26 · 电竞直播徽标对比度不足，自定义浅主题色的吸管图标可能不可见。未改变视觉。**

- 文件：`EsportsMatchCard.vue` 的 `.status-badge.live`；`Appearance.vue` 自定义颜色入口。
- 证据：13px/500 白字叠 `#ff4d4f` 的对比度约 **3.27:1**，低于本项目普通文本 4.5:1 目标。吸管图标固定 white，而颜色输入允许近白色。
- 方向：分别使用状态语义色和适合该实色表面的前景；需要检查默认主题外观和极端主题色，不机械替换所有媒体叠层白字。

### P4

**27 · “共享卡片样式”实际每次调用都重新创建 computed。已修复。**

- 文件：`useVideoCardSharedStyles.ts`、`useVideoCardShadowStyle.ts`。
- 首批修改：仅依赖全局设置的 computed 移到模块级，所有卡片/网格复用；该项本身不改变 CSS 字符串与字号映射。后续第 25 项在同一入口统一字号/行高。
- 验证：200 个调用共享同一个标题 computed，设置变化仍更新所有调用方。样式仍由原来的组件绑定，没有新增 Store 或每卡监听。

**28 · UnoCSS 字重和 SCSS 字重各自维护字面值。已修复。**

- 文件：`unocss.config.ts`。
- 修改：400/500/600/700 和 normal/medium/semibold/bold 工具类统一生成语义 token 引用。
- 验证：实际调用 UnoCSS generator 检查生成声明；现有字重 token 数值不变，700 仍为 700。第 25 项随后按授权调整了具体标题角色和字号映射，没有改动间距转换。

**29 · DOM/JSDOM 回归输出使用“visual QA”标签，容易被误读。已修复。**

- 文件：`scripts/verify-playback-visual-fixes.mjs`。
- 修改：9 个检查名称改为 `DOM fixture`，不改变断言。这些用自定义矩形和假时钟的测试不再被标记成真实视觉 QA。

**30 · momentDisclosureCache 是无界模块级 Map。未改缓存语义。**

- 文件：`src/components/MomentCard/momentForwardContent.ts`，`getCachedMomentDisclosure/setCachedMomentDisclosure`。
- 根因：只有设为 none 才删除，没有容量或页面生命周期回收；保存的是少量 disclosure 值，不等同于保存大图片或全部正文。
- 方向：先明确折叠状态需要记忆到哪个页面/账号/会话，再迁入该 owner 或增加有依据的上限。不能为了限制内存随意淘汰用户正在查看的折叠状态，也不把它夸大成当前最大内存泄漏。

**31 · 大型模块和重复协议/展示类型增加修改耦合。五项方案已落地，其他大页债务仍保留。**

- 审查时的典型集中点：`bewlyWidescreen.ts` 约 7,500 行、`Moments.vue` 约 5,900 行、`FavoritesPage.vue` 约 2,300 行、`App.vue` 约 1,300 行、私信写 controller 约 1,100 行。播放入口现为 612 行，其余实现移入有明确职责的模块；私信写入已移除重复读取职责。
- `VideoCardDisplayData` 已从 `Video` 派生，Following 共用稿件 adapter，搜索普通列表使用同一个 controller。Moments/Favorites 的进一步领域拆分及其他菜单的统一仍可单独推进。
- 影响：一次局部需求容易遗漏第二份实现；难以隔离测试并证明哪些改动不会影响其他页面。文件行数只是定位线索，具体重复和责任混合才是问题。

## 功能覆盖与没有误判的设计

| 功能 | 本次审查内容 | 结论/边界 |
| --- | --- | --- |
| 启动/扩展重载 | contentScripts 注册、Shadow DOM 样式门禁、dispose 链、messaging | 存在集中清理和失效收敛；未重建第二套启动/失效系统 |
| 路由/PageMode | App 页面表、useRouteState、页面模式来源 | route 单例、隐藏时暂停 fallback 已存在；不把 4 秒可见 fallback 当高频 URL 空转 |
| Dock/TopBar | 三档收起、浮层、可见性、顶栏 broker、Pop 滚动 | 保留当前产品设计；修复共享滚动清理；没有移植上游顶栏 |
| 首页整合搜索 | Home 账号 KeepAlive key、单 SearchBar、布局切换 | Home 已按账号重建缓存边界；不能套用 History 的问题结论 |
| 个性推荐 Web/App | 请求身份、过滤、undo、adapter 和 App Auth | 保留现有 generation/风控语义；保留明确的 App aid |
| 关注新旧布局/订阅流 | 账号、deactivation、分页和转换 | 已有多处正确的生命周期检查；重复 adapter 列为结构改进 |
| 热门/每周/排行/入站必刷 | 失败/重试、分页、数据映射 | 保留已修复的分页和重试；减少身份补取请求 |
| 直播首页 | 账号、3 批首屏、分页、取消与预览 | Home 的账号边界生效；没有把有限首屏补数误报成无限轮询 |
| 搜索综合/视频/用户/直播/媒体/专栏 | request composable、分页控制器、补取、样式 | 已修复用户/直播事务边界、排序分页与嵌套结果判定；解码器已复用 |
| 番剧/时间表 | 多条请求流、追番、横向列表 | 追番失败/重试与横向滚动边界已修 |
| 历史 | 查询提交、cursor、清空、删除、暂停状态 | 已有查询 generation；账号与 mutation 边界仍需补齐 |
| 收藏 | bootstrap、失败页重试、合集、批量/编辑 | content generation 已有；账号和写操作仍需独立修复 |
| 稍后再看 | 账号、分页重读、mutation、topBar 权威 aid | 保留唯一成员真值及移除后的边界重读 |
| 动态/评论/投票 | 虚拟窗口、卡高、observer、详情、comment session | 保留现有瀑布流和评论会话缓存；未新增卡高/布局真值 |
| Reply/At/Love/System | 独立 controller、merge-head、read commit、fixture | 协议回归执行；未在真实账号制造已读/未读或服务端通知 |
| Whisper | 会话选择、读取 LRU、轮询 eligibility、写 controller | 唯一读取 owner 已落地；写入只保留草稿和未确认事务，继续保护未完成工作 |
| 消息服务端设置 | 字段独立提交、回读、block words | 服务端值未混入本地 settings；账号 scope 缺失 |
| 播放页/原生评论与弹幕 | readiness、hydration、退出、桥、multipart | MAIN metadata 来源已落地；真实多 P 导航待验收；取消的评论/弹幕任务未改 |
| 设置/快捷布局 | KeepAlive、分类导航、标题和控件绑定、搜索 | 标题/控件绑定、字号和宽控件换行已落地，桌面设置已观察 |
| 共享 Dialog/Select/Input/菜单 | 焦点、IME、ESC、portal、工具提示 | 通用确认层和 ContextMenu 已复用焦点归属，SFC 回归通过 |
| 封面/视频预览 | shared IO、资源回收、hover generation、缓存 | 回收入队优化和有界失败恢复已落地，仍共用原 Observer |
| 主题/OLED/字体 | 语义 tokens、前景、原站叠层、计算字号 | 首批三种主题实测；后续统一字号/标题角色，未改媒体白字；最新完整主题矩阵未执行 |
| 后台/Cloud Sync | 设置协调、WBI、DNR、broker、冷启动 | 仅收窄无关 DNR 更新；保持 quota/failed/pending 和 alarms 契约 |

## 结构性重构方案

以下按原五项方案记录当前落地结果，具体模块与最新验收见结构重构记录。

1. **把 App 的确认层与设置导航从 shell 中拆出明确 owner。已完成。** 第 01 项的确认队列/组件继续使用；设置面板开关、展开起点及类型化导航归 `useSettingsPanel`。原模板、焦点恢复和展开几何保留。
2. **让搜索的一次请求覆盖“搜索→补取→分页提交”完整事务。已完成。** 七类搜索均使用请求回调，删除 `lastResponse` 中转；四类普通列表复用 `useSearchListPage`，All/User/Live 保留特殊模型及有效事务边界。
3. **将私信读取与写入事务分清责任。已完成。** `usePrivateMessageWorkspace` 组合唯一历史/ACK owner 和临时写入事务；重复历史缓存及读取接口已删除，保留 experimental 图片资产和 gate。
4. **按播放器所有权拆分 bewlyWidescreen。已完成源码拆分。** 静态样式、原生 DOM、几何、控制条、侧栏内容/hydration、Loading 各有模块，原公共入口与 MAIN metadata 桥保留；控制器仍拥有同一原生播放器。真实浏览器完成挂载、侧栏与退出检查，完整 BV/EP/Drawer 导航矩阵未全部执行。
5. **逐步收敛展示 adapter 与设计 token 的入口。已完成本轮范围。** VideoCardDisplayData 从 Video 派生，Following 稿件与推荐数据转换已收敛。沿用此前的标签/字号 token；两种 Following 直播布局的有意字段差异继续保留。

## 性能优化方案与收益边界

| 项目 | 当前证据 | 实施方式 / 验收 | 状态 |
| --- | --- | --- | --- |
| 卡片身份补取 | 丢失明确 aid 后每卡请求详情 | adapter 保留 aid；受控网络计数、成员状态回归 | 本批已做 |
| 离屏回收入队 | 200 项产生 20,100 次扫描访问和 200 个 timer | 最早 deadline 调度；原延迟、取消和到期测试 | 本批已做 |
| 全局样式重复计算 | 每卡创建 4 个 computed，网格也重建共享阴影 computed | 模块级共享，验证身份及响应式更新 | 本批已做 |
| 无关 DNR 更新 | 任意 settings 变化重写同一规则 | 仅该开关变化才写；初始化保留 | 本批已做 |
| 非定时主题时钟 | 每上下文 30 秒唤醒 | 按 scheduled 生命周期启动/停止 | 本批已做，收益较小 |
| 顶栏后台标签 | TopBar 隐藏只清浮层，store 的 UPDATE_INTERVAL 仍 claim broker | 可见性参与自动刷新 eligibility，手动/跨标签失效仍走原权威链；验证返回前台立即对账 | 方案；broker 已去重，不能声称每个标签都做整套 API 请求 |
| 播放页进入等待 | 首 5 秒 100ms，此后 500ms poll；有退出按钮和取消链 | 保留现有 readiness，按可见性暂停定时兜底、保留事件唤醒；慢 CDN/恢复前台测试 | 方案；不能贸然删 poll 或制造第二套 readiness |
| 动态卡片几何 | fitVideoCardDescription 先写 style 再逐卡读几何，ResizeObserver 回调也调用 | 在原卡高体系内按帧分组读/写，缓存未变输入；检查滚动锚点、评论展开与图片 resize | 方案；未测实际耗时，不声称一定“大幅提速” |
| 私信 getter 成本 | getState 调用 enforceCacheLimits，遍历全部会话、裁剪并更新边界 | 将裁剪/淘汰放到数据 mutation、设置变化和会话访问边界；避免 render getter 顺带改大量数组 | 方案；必须验证 LRU/ACK/历史边界 |
| 大型列表渲染 | VideoCardGrid 有意保留已加载卡片，Moments 已有自己的虚拟布局 | 先测数据转换/响应式/几何成本，保留 content-visibility 和现有虚拟化策略 | 不另造第二套虚拟卡高 |

建议基准：固定账号和脱敏 fixture，分别运行首页 200/1000 张卡片、动态连续滚动与评论展开、20 个私信会话、播放页慢 metadata、10 个后台标签。记录请求数、活跃 timer/observer、长任务、布局次数、堆内存和可见窗口稳定性。功能与视觉矩阵通过后再比较前后数据。操作次数的下降已经测得，真实页面 CPU、内存峰值和 FPS 提升尚未测得。

## 修改文件与行为边界

- 网络与卡片：5 个 Home adapter、forYouStore；2 个共享卡片样式 composable。
- 调度与清理：useDark、useOptimizedScroll、LazyPicture、blockUselessFeedCards、HorizontalScrollView、background/index。
- 复用与文本：htmlDecode、searchTransforms、unocss 配置。
- 可访问性：新增 formFieldLabel；SettingsItem、Radio、Input、Slider、Select、Settings、Home/Home types、Tooltip。
- 后续指定修复：ConfirmDialog / useConfirmDialogHost / useConfirmDialog / App / dialogFocus / Dialog；ContextMenu / FavoritesPage；User/Live 搜索页及请求/关系 composable / UserCard；Anime；LazyPicture 与四套 locale；Notifications 与读写缓存 controller；videoMetadataBridge / inject/videoMetadata / inject/index / contentScripts/index / player。
- 字号批次：variables.scss / main.scss / unocss.config；SettingsItemGroup；VideoCard / VideoCardInfo / useVideoCardSharedStyles；SearchBar、ArticleCard、MovieCard、MomentCard 和 EsportsMatchCard。
- 验证：sourceFunctionHarness 支持 Vue 普通 script + script setup；新增 verify-requested-audit-fixes 并接入现有 selected 门禁，扩充 functional/private-message/播放器回归；修正 DOM fixture 的输出标签。

没有改变账号/未读/稍后再看的权威来源，没有重新引入已删除功能，没有替换播放器、虚拟卡高或消息协议，没有整体同步上游，也没有引入新依赖。

## 审核修复批次验证（重构前）

- 修改前：pnpm lint、pnpm typecheck、pnpm test 均退出 0。test 首次因沙箱禁止 tsx IPC socket 而失败，允许沙箱外执行后通过。
- 修改后的最新完整 lint / typecheck：退出 0。中间检查发现并修复了宏声明顺序、ForYou 展示类型缺 aid 和测试数组被断言过度收窄的问题。
- 最终 pnpm test：退出 0，包含 targeted、selected、private-message 和 notifications 全部回归，以及新增的确认/菜单、搜索竞争/分页、图片失败、追番重试、关注状态、MAIN metadata、写入缓存和字号映射检查。当前沙箱依旧禁止 tsx IPC，最新一次先遇到同一 EPERM，获准沙箱外运行后完整通过。
- 最终 pnpm knip：退出 0；仍报告与基线相同的 52 个未使用导出、7 个未使用导出类型、4 个未使用枚举成员。没有把这些警告称作清零，也没有盲删动态 API 入口。
- git diff --check：退出 0。
- pnpm dev：复用了已有真实扩展 watch，观察到 content/background 生成产物更新；没有新启动第二套 dev，没有执行 pnpm build，没有手工编辑生成产物。未取得原开发进程的完整 stdout，因此不把文件更新时间当作完整编译日志。
- 确定性实验：确认框 Enter/IME 误确认、用户搜索旧结果覆盖新词已复现；封面批处理前后操作数已测；没有真实业务写请求。
- UnoCSS generator：实际输出字体 token 引用和字号/行高组合，未改变 400/500/600/700 token 的值及间距转换。

## 浏览器 QA 与 remaining issues

已执行的浏览器步骤：

1. 用户 Chrome 副本：搜索页 OLED 截图、首页/设置、辅助功能名称检查。
2. 用户副本：浅色切换、390×844 窄窗口，确认设置挤压；随后恢复“设备”主题并清除 viewport override，关闭本次创建的审核标签页。
3. 开发窗口：扩展详情确认目录、扩展重新加载、页面刷新。
4. 开发窗口：首页已有新本地化布局标签；打开设置，确认 Radio/Select/Slider 的可访问名称。通用 Input 的绑定由 SFC 测试验证。
5. 开发窗口：浅色、深色、OLED 外观截图与状态核对；恢复该窗口原来的亮色、OLED 关闭。
6. 指定修复后再次核对开发扩展路径并点击重新加载；关闭移动设备模拟和 DevTools，再加载桌面首页。桌面首页/设置的当前排版见截图 11。用户要求停止移动端分辨率测试之后，未再启用设备模拟。
7. 开发窗口：History 清空确认默认焦点为取消，取消上 Enter 关闭，Tab 遍历确认层控件，Escape 关闭；焦点回到触发按钮。没有点击确定。
8. 开发窗口：收藏文件夹菜单具有编辑/删除菜单语义。原生自动化菜单树没有给出可靠的 Home/End 焦点变化证据，未据此宣称键盘浏览器通过；该行为由实际 SFC 测试覆盖。结束时发出关闭本次创建 QA 标签的操作，随后窗口标题回到原有首页；未取得完整标签清单确认。

截图保存在本机 `/tmp/bewly-audit-2026-09-05/`：01 搜索 OLED；02 设置 OLED；03 设置浅色；04 窄窗口缺陷；05 开发设置浅色；06 开发设置深色；07 开发设置 OLED；10 指定修复后的窄设置观察；11 当前桌面设置。09 实际来自旧代码页面，不能用作修复成功证据。截图未加入版本库，也没有把私人历史/会话截图写入报告。

尚未执行：开发副本全部业务页面的逐项真实浏览器交互、账号真实切换、真实 mutation、所有 Drawer/播放器类型的回归、实际触控板/IME 输入、全部字号组合与桌面缩放、极端主题色/无毛玻璃/四语言完整矩阵、真实 CPU/堆内存/帧率测量。原生窗口操作中出现过用户切换窗口，未把中断或未返回可靠证据的操作算作通过。最后的信息区高度公式修正已做源码/编译验证，但没有再次取得大作者字号组合的实际截图。

剩余问题：02 消息服务端设置账号 scope、03 History 完整账号隔离、04 Favorites 完整账号/mutation 隔离、26 电竞徽标/吸管前景对比、30 动态折叠缓存生命周期，以及 31 中其他大页/菜单的结构债务。本文五项结构方案已按追加授权落地，范围与最新验证见结构重构记录；剩余性能方案没有因此自动视为已实施。

## 本机截图证据

以下图片引用本机临时文件，未随报告提交到版本库。01–04 来自用户原有扩展副本，用于现状观察；05–07 来自已经核对源码目录并重新加载的开发扩展。

01 · 搜索 / OLED：页面内容正常可见，本图不证明所有搜索异步场景正确。

![搜索 OLED](/tmp/bewly-audit-2026-09-05/01-search-oled.png)

02 · 设置 / OLED：记录原有视觉和未命名控件的上下文。

![设置 OLED](/tmp/bewly-audit-2026-09-05/02-settings-oled.png)

03 · 设置 / 浅色：记录正常桌面宽度下的布局。

![设置浅色](/tmp/bewly-audit-2026-09-05/03-settings-light.png)

04 · 390×844：固定宽度滑块挤压设置标题，问题 09 的视觉证据。

![窄窗口缺陷](/tmp/bewly-audit-2026-09-05/04-settings-narrow.png)

05 · 开发扩展 / 浅色：控件名称修复已由同一界面的辅助功能树核对。

![开发扩展设置浅色](/tmp/bewly-audit-2026-09-05/05-dev-settings-light.png)

06 · 开发扩展 / 深色：当前样式实际渲染。

![开发扩展设置深色](/tmp/bewly-audit-2026-09-05/06-dev-settings-dark.png)

07 · 开发扩展 / OLED：网页底层转为黑色，设置表面保留层次；随后已恢复原设置。

![开发扩展设置 OLED](/tmp/bewly-audit-2026-09-05/07-dev-settings-oled.png)

11 · 指定修复后 / 桌面设置：设备模拟已关闭，标题、滑块及色板在当前桌面窗口中保持正常排布；该截图不证明全字号/主题矩阵通过。

![当前桌面设置](/tmp/bewly-audit-2026-09-05/11-current-settings-desktop.png)
