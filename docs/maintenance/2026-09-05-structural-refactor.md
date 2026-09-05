# Bewly Nocturne 结构重构记录

本轮以 `message_feature@c7590b59` 的工作区为基准，包含此前已完成的审核修复。按用户要求先执行了 `git push origin message_feature`，返回 `Everything up-to-date`；没有额外创建提交，所以未提交的源码修改没有通过这次 push 上传。随后继续在原分支重构，保留原有工作区内容和 `stash@{0}`。

## 根因与落地范围

原结构把页面请求、展示转换、原生节点搬移、布局测量和样式混在大文件中；搜索和私信还存在重复的处理路径。本轮落地审核报告中的五项结构方案，保持当前产品行为与视觉基线，不引入 Liquid Glass 依赖或新的业务状态源。

| 领域 | 当前职责与入口 |
| --- | --- |
| App 与设置 | `src/composables/useSettingsPanel.ts` 管理设置面板开关、展开起点和类型化导航请求；`App.vue` 负责 shell 组合。沿用此前拆出的 `ConfirmDialog.vue` / `useConfirmDialogHost.ts`，保留请求所属组件、导航、账号及关闭顺序。 |
| 搜索事务 | `useSearchRequest.ts` 只管理请求身份、结果、错误和 loading，必须通过响应处理回调提交结果。删除共享 `lastResponse` 中转及重复的分页/context refs。 |
| 列表搜索 | `useSearchListPage.ts` 组合原有请求、分页和加载更多模块，供视频、番剧、影视、专栏四页使用；页面提供请求构造、展示转换和去重键。User/Live/All 的特殊模型继续独立，但共用同一事务接口。综合搜索分组合并归 `searchSections.ts`。 |
| 私信 | `usePrivateMessageWorkspace.ts` 组合读取与写入 controller；`usePrivateMessages.ts` 独占服务端历史、分页、LRU、滚动状态和 ACK。写入 controller 只保存草稿、发送状态和未确认事务，接收读取侧已校验的消息做对账。 |
| 播放页 | `src/utils/bewlyWidescreen.ts` 保留原公共入口，协调进入、导航、设置联动和退出；实现按原生 DOM、几何、控制、内容、加载及样式分到同名目录。 |
| 展示转换与类型 | `VideoCardDisplayData` 从共享 `Video` 派生；推荐转换移入 `Home/adapters/recommendationVideo.ts`；Following 新旧布局共用 `followingVideo.ts`。私信写入展示类型从服务端展示模型派生，序号比较和来源分类共用现有实现。 |

Following 两种直播布局的字段处理存在实际差异，本轮保留这些差异，没有用统一函数覆盖它们。四套 locale、默认设置、发送协议、图片入口 gate、PageMode 和 TopBar 权威来源均保持原有契约。

## 播放页模块

| 文件，均位于 `src/utils/bewlyWidescreen/` | 职责 |
| --- | --- |
| `types.ts` / `session.ts` | 会话 DOM/资源类型与唯一当前会话引用；当前会话及 entering 状态由入口协调。 |
| `constants.ts` / `labels.ts` | 原有选择器、时序常量及翻译调用。 |
| `shell.ts` | 创建 shell、侧栏控件、标签与滚动复位；通过当前会话回调请求 hydration。 |
| `nativeDom.ts` | 查找、搬移、恢复原生节点，评论 prewarm 和原生内容就绪判定。 |
| `geometry.ts` / `nativeControls.ts` | 原生播放器锚定、尺寸同步、控制条显隐和原生控件事件。 |
| `actionEffects.ts` / `interactions.ts` | 动作效果的测量/主题与侧栏指针、拖拽、键盘交互。 |
| `description.ts` / `playlist.ts` / `videoInfo.ts` / `danmaku.ts` | 各类原生内容的独立适配。 |
| `sidebar.ts` | hydration、定时补齐、刷新 RAF、换稿时暂停与恢复。 |
| `loading.ts` / `loadingView.ts` | 加载层的定时器、退出、抑制与清理，以及独立的骨架 DOM。 |
| `styles/layout.ts` / `styles/loading.ts` | 原有完整样式及注入入口。 |

模块间通过会话的 `exit`、`refreshSidebar`、`hydrateSidebar` 回调返回协调层，保持一个播放器所有者和一套 readiness。没有重建播放器、另建虚拟卡高或增加轮询。拆分后的播放模块内部运行时导入检查没有发现循环。

## 私信职责变化

读取 controller 是唯一历史源。原写入 controller 的首次读取、历史分页、viewport、ACK、已确认消息缓存及对应状态字段已删除；不保留旧接口的兼容层。发送对账复用读取侧的 single-flight 请求与已校验响应，确认后仅删除对应本地事务。视图层不再在已确认发送后重复刷新一次历史。

发送/上传响应解释归 `experimental/privateMessageWriteResponse.ts`，写入类型归 `experimental/privateMessageWriteTypes.ts`；读写共用 `privateMessageResponse.ts` 的响应解释。消息裁剪回到唯一的读取 owner，移除不再需要的独立共享裁剪文件。

当前会话、草稿、发送任务和未确认事务继续受保护；不能因缓存上限丢弃用户工作或把裁剪误判为发送成功。图片实验代码和有限对账重试保留，图片按钮仍不开放。消息正文与草稿没有增加持久化。

## 规模与后续入口

以下按本轮开始前工作区和当前文件的 `splitlines()` 统计。播放页的大部分代码是按职责移动，并非删除功能。

| 文件 | 重构前 | 重构后 |
| --- | ---: | ---: |
| `utils/bewlyWidescreen.ts` | 7545 | 612 |
| `views/App.vue` | 1137 | 1081 |
| `whisper/experimental/usePrivateMessageWrites.ts` | 1214 | 714 |
| `SearchResults/pages/AllSearchPage.vue` | 1263 | 1148 |
| `SearchResults/pages/VideoSearchPage.vue` | 367 | 134 |
| `SearchResults/pages/ArticleSearchPage.vue` | 323 | 124 |
| `SearchResults/pages/BangumiSearchPage.vue` | 568 | 369 |
| `SearchResults/pages/MediaFtSearchPage.vue` | 475 | 275 |
| `stores/forYouStore.ts` | 125 | 92 |

今后的普通列表搜索应接入 `useSearchListPage`，特殊聚合结构接入 `useSearchRequest` 的事务回调；请求相关分页和 URL 更新留在有效事务内。新增展示字段先更新共享类型，再改对应 adapter。

未来接入 [liquid-glass-vue](https://github.com/wxperia/liquid-glass-vue) 时，现有表面入口仍是 `variables.scss`、共享 popover/segment 样式及 `PanelTopBlur.vue`；播放页可从 `shell.ts` 与 `styles/` 调整表面实现。加载动画可从 `loadingView.ts` 与 `styles/loading.ts` 调整，加载资格、定时器及清理留在 `loading.ts`。本轮没有预建渲染后端、兼容适配器或依赖配置，`package.json` / lockfile 未变。

## 验证结果

- 完整 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm knip` 均退出 0。测试通过已获准的沙箱外本地 IPC 运行。
- knip 保留 52 个未使用导出、6 个未使用导出类型、4 个未使用枚举成员提示；原来重复的 `SearchRequestState` 已移除，没有新增提示。
- 原有 targeted、selected、私信和通知协议回归继续执行。新增覆盖综合搜索的迟到关系响应、列表转换/去重/分页/账号身份、加载层退出/超时/资源清理，以及读写共享同一历史请求的对账。
- 播放函数测试支持从实际模块读取；旧的相邻函数字符串截取改为按函数名提取，保留行为约束。DOM/JSDOM 检查仍标记为 fixture。
- 13 个发生本轮修改的 Vue 文件，其模板及 SCSS 与基准一致；模板中唯一允许的绑定变化是 `isPageChanging` 改为同一请求的 `isLoading`。
- 两份播放 CSS 在展开实际常量后逐字一致。SHA-256：layout `dc25679b52bf6916f3bcf8f19bf8c99a18318a4df1a9af47e792c113369a51b8`；loading `6e64d18e3311c71bfbc5aff8b917595bd8927fe27f7b4e81c643a28ef2390f4f`。
- 复用原有开发 watch，生成物已包含新模块并用于开发扩展重载；没有另启 dev、执行生产 build 或手工编辑生成物。未取得原 watch 的完整 stdout，不把文件更新当作完整编译日志。
- 没有测量整页 CPU、峰值堆内存或 FPS，不以文件行数下降推导性能百分比。

## 桌面浏览器 QA

核对开发扩展来自 `~/个人项目/bewlyCat/extension`，重新加载得到“已重新加载”，再新建独立 QA 标签。未启用移动设备模拟。

1. 首页与设置：Bewly shell 挂载；设置打开、外观分类、关闭按钮和焦点恢复已操作，桌面排版正常。按 Esc 未关闭设置；基准 Settings 的键盘监听只处理 Tab，此次未扩展该既有行为。
2. 搜索：从首页搜索框提交“琵琶行”，按原设置打开搜索标签；视频结果显示并可滚动追加，专栏显示结果，番剧/影视显示有效空结果。
3. 播放页：通过正式入口进入独立 Bewly shell，Loading 消失；展开侧栏后原生评论可读，切换弹幕标签后出现原生列表表头。退出按钮恢复普通播放页及原生弹幕列表布局。
4. 播放检查期间视频 URL 多次变化；没有完成换稿过程及暂停状态的受控核验，因此不把它记录为完整的增量导航验收。侧栏受原有自动收起行为影响，截图 04 记录的是后续视频画面，不是弹幕列表截图。
5. 本次创建的首页、搜索/播放两个标签均已关闭，原有扩展详情和首页两个标签保留；未执行真实关注、删除、评论或私信发送。控制台出现原站 hydration/mixed-content 提示，未据此宣称控制台零错误。

截图位于本机 `/tmp/bewly-refactor-2026-09-05/`：01 桌面设置；02 视频搜索；03 独立播放页；04 后续视频画面；05 退出后的普通播放页。未加入版本库。

## Remaining issues

本轮批准的五项结构方案已落地；这不等于消除整个仓库的全部历史债务。审核中的 02（消息服务端设置账号 scope）、03（History 账号隔离）、04（Favorites 账号/mutation 隔离）、26（特定前景对比）、30（动态折叠缓存生命周期）继续保留。Moments/Favorites 等大页面进一步按领域拆分仍可独立安排，没有在本轮整体改写。

人工验收仍包括真实账号切换、私信发送、全部主题/字号/桌面缩放、BV/EP/多 P/合集/Drawer 的完整导航矩阵及资源性能测量。暂停状态和设置 Esc 的既有体验也需单独检查。未经额外指令，本轮重构未 commit、未再次 push。
