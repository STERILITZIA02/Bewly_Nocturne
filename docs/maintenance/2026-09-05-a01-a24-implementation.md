# A01–A24 实施与验证记录

基线：`message_feature@0224dcf5`。报告的 `118f6d8cf6578cddc8a84ed29885cc7774e2c192` 与该提交 tree diff 为空。开始时工作区干净；原 stash 为 `7a6ef9155ccd8e5ce92768702da03b5ae8d7184b`。本次保持原分支，不 commit/push；按最新用户要求不执行生产 build。

审查输入：`/Users/young/Downloads/README.md`。七个上游提交的完整 diff 和依赖均已读取，按语义适配；未 cherry-pick、merge 或覆盖上游整文件。

## A01–A24

“已实现”指源码落地，不表示所有真实账号、网络及视觉组合均已验收。

| 编号 | 状态与实现 |
|---|---|
| A01 | 已实现。`useFavoriteWrites` 固定账号/CSRF/合集 IDs，每项提交前检查 lifetime；实际 FavoritesPage/controller 测试覆盖换号、cookie 先变化和卸载停止后续请求。 |
| A02 | 已实现。删除/移动/复制固定来源、目标、资源 keys；`useFavoritesData` 仅更新已提交的原视图，保留变化后的选择与目标。实际页面测试覆盖改选及切收藏夹。 |
| A03 | 已实现。`useHistoryTimeline` 统一初始化、分页、搜索、状态、删除、清空、暂停的账号/查询/生命周期；页面和控制器测试覆盖旧请求与写入。 |
| A04 | 已实现。消息设置具有账号 lifetime，页面激活/离开/换号接入 reset/dispose；旧读取及写后回读失效。 |
| A05 | 已实现。每字段 revision 协调全量刷新和写后权威回读；旧刷新不能覆盖新值，服务端设置不存本地 settings。 |
| A06 | 已实现。屏蔽词按 operation+word 去重，不同意图不共用成功结果；pending 时禁用所有相关写按钮。 |
| A07 | 已实现。仅当前草稿等于提交快照才清空；实际 MessagesPage 测试保留新草稿。 |
| A08 | 已实现。收藏写入和历史删除/暂停/清空处理网络失败和 API 非零码，反馈可见，保留选择/草稿；文件夹编辑也有实际页面失败及新草稿回归。 |
| A09 | 已实现。移除全部运行期 1000 条上限；持久化尾段/continuation/cursor 连续。实际 reader/cache 测试消费 3000 条、跨缓存缺口、失败重试、重开，不重复不跳段；两页过滤预算及手动继续保留。 |
| A10 | 已实现。复用 `useCardWindow`/`CardRowMetrics`，仅挂载窗口与固定交互行。菜单、focus、全屏、写入、撤销、布局编辑保护；稳定 key 恢复局部状态与预览时间。稍后再看成员真值仍来自 TopBar。5000 条实际 Grid 组件测试覆盖回收、focus、固定行、状态和列数。 |
| A11 | 已实现。Home 卸载非活跃标签，按账号/模式/Following 版本保存最多 12 个数据快照；ForYouStore 仅在离开 Home 时接管一个快照，重新进入转移所有权；切标签无同步 JSON 深拷贝。挂载测试覆盖列表、撤销重做及旧 generation。 |
| A12 | 已实现。每列复用同一 CardRowMetrics 高度索引，滚动查窗口、测量单点更新。4500 条几何数据与逐项参照一致；追加和重排仍有重建成本，不宣称全操作 O(log N)。 |
| A13 | 已实现。通用样式收紧至 Bewly host/wrapper/显式适配范围；自定义首页启动用 opacity 保留布局，不再 body display:none。保留 settingsReady、启动清理、顶栏来源与 OLED。 |
| A14 | 已实现。IframePage 同源直调，跨源通过现有父子桥刷新当前子页/回顶；统一 URL/刷新/loading/ACK。回顶不能吞刷新 deadline；旧 frame load 不结束新导航。实际组件与子页模块测试覆盖。 |
| A15 | 已实现。IframePage/Drawer/Moments 详情共享 `releaseIframeMedia`，Vue 移除 DOM；删除无效 close/手工 removeChild，remount/焦点/关闭按 generation 清理。 |
| A16 | 已实现。展开状态归动态页面会话，账号/刷新/退出清理；虚拟滚出保留展开状态，不再模块级永久 Map。 |
| A17 | 已实现。Favorites 拆数据/事务/适配；Moments 拆 reader/cache/actions/layout/detail/previews；ForYou 拆推荐请求 owner、过滤、Web cursor、撤销重做。页面保留组合展示，未传递旧全部 refs 的大状态对象。 |
| A18 | 已实现。`previewMediaSession` 共享 HLS/FLV owner 和 abortable listeners，策略留在调用方；共享媒体/图片/iframe 释放。LazyPicture 使用六槽队列，保留原图回退、失败反馈、防闪烁。 |
| A19 | 已实现。动态缓存 shallow + 根替换，每过滤类型 1000 条预算含 continuation；同步默认 serializer 不再先 clone。pending 点赞仅为 UI overlay，确认 patch 统一更新 canonical DTO、布局、详情、缓存，避免保存未确认乐观状态。 |
| A20 | 已实现。真实组件 setup/完整模块入口与可控 Promise 覆盖换号、卸载、选择、旧刷新、新草稿；旧结构断言随拆分更新，原失败/游标/几何行为断言保留。JSDOM 不作为真实视觉证明。 |
| A21 | 已实现。CI 用 `pnpm test` 统一四组回归，保留独立 lint/typecheck/knip/CI build；本地按最新要求不 build。 |
| A22 | 已实现。评论遮罩默认 token 放到共同明暗作用域；播放页覆盖落在现有 `bewlyWidescreen/styles/layout.ts` 的评论侧栏表面。 |
| A23 | 已实现。MomentCard mediaMeta 增加 `!moment.isForward`，保留普通视频、直播及专属内容原分支。 |
| A24 | 已实现。hcfrom 仅加入 `bilibiliUrl.ts`；实际函数验证 Bilibili/b23/伪装域名、p/t/hash、带标题分享。 |

浏览器另发现并修复：ISOLATED 监听器的图片 event.target 在 Shadow DOM 边界可重定向，已解码图片未结算后被队列判超时。改为 decode 前捕获绑定的 currentTarget，decode 后仍校验 generation/key；新增重定向事件回归，重载 Dev 扩展后封面实测恢复。

## 七个上游提交

| 提交 | 吸收情况 |
|---|---|
| bf3f8b2 | 仅中央 URL 集合补 hcfrom，不恢复重复列表。 |
| 90f99ae | 本地转发卡片 mediaMeta 条件。 |
| 2239793 | 评论公共 token + 现有播放页 styles 子模块。 |
| 0121537 | 样式及启动隐藏作用域；已有 settingsReady/清理/顶栏来源保持。 |
| c106458 | 所有动态分页入口解除 cap，图片离屏释放；配套尾段/continuation/cursor 与高度索引。 |
| e159b7e | 复用行窗口/高度索引，适配本地卡片状态、批选、预览、布局编辑和主题间距。 |
| 90ac6d8 | 分模块吸收 Home 数据缓存、图片队列、媒体释放，不引入重复 Store、同步深拷贝或旧单体播放页。 |

## 资源边界

- Favorites 数据由 data owner 修改，事务由 writes owner 修改，选择/弹窗留页面；History timeline 统一读写状态。
- Moments reader 拥有已接受原始 DTO，页面筛选展示，layout 管几何，actions 管 pending，detail/previews 管各自媒体。浏览会话保留全部已接受 DTO 至退出，避免改过滤截断历史；不宣称所有 JS 数据内存固定。DOM/解码媒体受窗口回收，持久化预算与浏览结束无关。
- Home 最多 12 个标签/模式快照，仅保存数据；ForYou 前后历史各最多一个方向快照，无活跃列表的重复 Store 镜像。
- 统一图片策略替代 `releaseOffscreenVideoCardImages`，删除 schema/default、General 空分组、搜索目录、四套文案及卡片引用；现有设置归一化删除旧字段。

## 自动验证与开发编译

已执行完整 pnpm test（targeted、selected-p2、private-message、notifications），退出码 0；含实际页面、5000 条网格、4500 条高度索引、3000 条动态缺口/恢复，以及图片、iframe、媒体释放。

pnpm lint、pnpm typecheck、pnpm knip 均完整执行，最新退出码均为 0；git diff --check 退出 0，原 stash SHA 未变。knip 既有 52 个 export、6 个 type、4 个 enum warning 保留，不声称零警告。未删除行为断言或关闭检查；手动基准脚本作为实际命令入口登记。

开发编译复用已运行的根项目 pnpm dev watcher，未重复启动扩展 watch。生成 content bundle 确认含新 reader/layout/ForYou owner/currentTarget 修复；Chrome 已重载来源 ~/个人项目/bewlyCat/extension 的 Dev 扩展并刷新页面。未执行 pnpm build、未手工编辑生成产物。

## 浏览器性能样本

复现：pnpm bench:card-window，仅监听 http://127.0.0.1:4178/，由 Vite 开发服务编译真实基线/当前 VideoCardGrid。相同 5000 条固定数据和 180px 合成叶卡片；这不是完整 VideoCard、Bilibili FPS/CPU/heap 收益。

独立 Chromium：1280×720 桌面 viewport；容器高 700px；60 次每次 700px，终点 42000px。

| 样本 | 挂载组件 | 槽位 | 容器 DOM | 观察窗口 | >50ms 长任务 |
|---|---:|---:|---:|---:|---|
| 基线挂载 | 5000 | 无独立槽位 | 15003 | 356ms | 211ms |
| 基线滚动 | 5000 | 无独立槽位 | 15003 | 1165ms | 59ms |
| 当前挂载 | 96 | 96 | 388 | 140ms | 71ms |
| 当前滚动 | 192 | 192 | 773 | 1114ms | 无 |
| 当前卸载 | 0 | 0 | 0 | 116ms | 无 |

观察窗口含 nextTick、双 RAF、100ms 固定等待；挂载观察可能含前视图卸载任务，不作为纯渲染耗时。只有一次控制样本，不推导百分比收益。首次用户 Chrome 存在额外页面样式处理及并行编译，当前滚动曾为 8474ms、最大长任务 955ms；不与独立浏览器混算，不声称所有浏览器都更快。真实服务端长会话 heap 保留路径和完整媒体资源存活轨迹未测。

## 桌面 QA

- 已重载本地 Dev 扩展：浅色首页封面；个性推荐/正在关注/订阅剧集/热门/每周必看/排行/直播加载；往返后推荐首部数据恢复。
- 自适应/双列/单列，明色/深色/OLED，Bewly/自定义/原版模式切换已观察。原生首页及顶栏可见，浅色时 OLED 不覆盖页面。已恢复浅色、自适应、Bewly、OLED=false。
- 桌面 Chrome 从 100% 放大一档再恢复到 100%，网格从六列变五列再恢复六列，封面与控件未出现空白；不等于全部字号/缩放组合验收。
- 收藏页初始化与收藏夹列表、历史列表/状态、动态瀑布流与图片已加载。动态详情连续打开、ESC 关闭、重开，原生评论恢复，关闭后焦点回到原入口。
- 用户主 Chrome 连接器禁止导航扩展管理内部页，未绕过；封面修复使用此前已确认来源的原生 Dev 窗口验收。独立浏览器仅用于本机基准。
- 不测移动端。线上换号写入、三模式×三主题完整交叉矩阵、全部字号/缩放、真实远端 1000+ 动态长会话和媒体 heap 轨迹未冒充通过；异步与几何路径有受控回归。
