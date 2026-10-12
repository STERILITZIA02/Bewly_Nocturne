# AGENTS.md

Bewly_Nocturne：基于 BewlyCat 持续维护的 bilibili 浏览器扩展（Vue 3 + TS + Vite + UnoCSS，包管理用 `pnpm`）。

## 命令

- `pnpm lint` / `pnpm lint:fix`
- `pnpm typecheck`
- 验证时不执行任何 `build` 操作；开发阶段使用 `pnpm dev` 持续编译与验证。
- 删除全局自动注册的组件后，核对开发日志及 `extension/` 的实际产物。Vite watch 可能保留 `import.meta.glob` 的旧模块缓存；出现已删文件的 ENOENT 时，只重启本任务拥有的 watcher，并等待主脚本重新输出。lint、类型和组件测试通过不能代替产物更新或重载后的页面验证。
- 构建产物：Chrome/Edge → `extension/`，Safari → `extension-safari/`

仅当本次任务实际执行 `git commit` 时，提交前必须通过：

```sh
pnpm lint
pnpm typecheck
```

未执行 `git commit` 时，不要求运行上述检查。

## 结构（速查）

- `src/background/`：后台、消息与 API
- `src/contentScripts/`：页面注入主逻辑（入口 `index.ts`）
- `src/components/`：TopBar / Dock / VideoCard / Settings 等
- `src/stores/`、`src/logic/storage.ts`：状态与设置
- `src/manifest.ts`：manifest
- `src/_locales/`：i18n
- 主 UI 跑在 Shadow DOM 内，注意样式隔离

## 样式规范

### Token 与复用

- 全局视觉 token 统一维护在 `src/styles/variables.scss`，不要在页面组件中重复定义同义尺寸、字号、字重或状态颜色。
- 紧凑胶囊、标签栏、分段选择器和图标切换器使用 `src/styles/segmentControl.scss` 的 `.bew-segment-control` / `.bew-segment-control__item` 基础类；页面组件只负责定位、宽度和响应式布局。
- 使用液态指示器时，选项必须包含 `data-segment-item`，激活项使用 `data-active="true"`；无液态指示器的分组增加 `.bew-segment-control--static`。
- 液态指示器统一使用 `src/components/LiquidSegmentIndicator.vue`，页面不要重复调用 `useLiquidSegmentIndicator` 或手写 `.bew-liquid-indicator` DOM；组件通过 `active-key` 接收当前值，必要时用组件 ref 调用 `updateIndicator(true)`。
- 同一行的同类控件必须使用一致的 surface 变体、外层高度、padding、gap、圆角、阴影和交互状态，避免一个透明、一个悬浮或各自维护胶囊样式。
- 通用组件 token 使用 `--bew-control-*` / `--bew-segment-*` 命名；仅真正局限于 TopBar 的变量才使用 `--bew-top-bar-*`。

### 玻璃层级与颜色

- 为性能和可读性考虑，玻璃（背景模糊或液态折射）之上的覆盖层不得再次使用玻璃。仅当覆盖层会延伸到原玻璃组件边界之外时，才允许保留独立玻璃表面；Teleport 本身不构成例外，应按实际覆盖范围判断。
- 玻璃内的文本、按钮、选项、搜索框和菜单使用实色或无滤镜的普通表面。禁止给实色背景继续附加无视觉收益的 backdrop-filter，也不要以低模糊强度代替移除重复采样。
- 用户明确保留现有顶部模糊实现：顶栏渐进模糊、设置/Dialog 的 `PanelTopBlur.vue` 以及会话滚动边缘模糊不参与本轮收敛，保持参数、遮罩、层级和裁切行为。此保留项不作为新增内部玻璃控件的依据。
- `LiquidSegmentIndicator` 只负责选中项的几何变形与滑动，不采样背景；保留其动画，使用实色选中表面，不把它误当成液态玻璃组件删除。
- 避免半透明主题色标定状态。强选中项和主按钮使用 `--bew-theme-color` 配合 `--bew-on-theme-color`；次要标签、悬停和编辑底色使用不透明 `--bew-theme-surface` / `--bew-theme-surface-hover`，配合中性实色前景 `--bew-on-theme-surface`。独立主题色文字使用 `--bew-theme-foreground`，不要将主题色透明度当成强调层级。
- 灰、黑、白的半透明颜色不受上述主题色限制，也可使用实色；此豁免不允许在玻璃内部再次添加模糊或折射。
- 玻璃内的实色控件可无边框，优先通过表面、实色前景和明确选中状态区分；移除装饰边框时仍须保留 focus-visible 与必要的分隔线。玻璃自身的色调设置和既有页面装饰渐变不用于表达控件状态。
- 液态玻璃统一在“外观 → 悬浮表面材质”中管理，复用 `useLiquidGlassOptions`、`LiquidGlassSurface.vue` 和 `attachLiquidGlass` / `vLiquidGlass`。保留现有持久化键及自定义值；不得另建 Dock、播放页或设置页各自的材质状态。挂载目标必须已有定位；隐藏的 `v-show` 浮层传入明确布尔值，卸载时释放挂载与观察器。
- 液态材质限于 Dock、播放页底部控制栏、独立搜索框及顶栏浮层等独立小表面。设置窗口、外侧纵向导航、普通 Dialog 与播放页侧栏使用原有毛玻璃，不挂载液态滤镜或其尺寸观察器；侧栏排版保留。设置内输入框、内嵌菜单和嵌套 Dialog 使用实色；播放页内的 Bewly 辅助按钮复用底部容器表面，不再添加玻璃。独立搜索框与已保留的顶栏边缘模糊相交时，继续保留边缘模糊，不将其推广成其他内部控件的叠层依据。
- 播放栏液态玻璃的外壳不得使用 opacity / will-change: opacity 创建背景采样边界；沿用统一控制栏显隐值，对折射、着色和边框绘制层分别淡入淡出，保留 reduced-motion。
- 跟随主题的玻璃色调使用浅色白、深色受限黑、OLED 纯黑；着色强度保留 0/100 端点及完整可调范围，自定义模式使用原始不透明度。完全实色时不挂载不可见的 SVG 折射与 backdrop 层。

### 加载反馈

- Nocturne 页面、数据组件、预览初始化和操作中的占位统一使用 `SkeletonBlock.vue` 与 `src/styles/skeleton.scss` 的 `[data-bew-skeleton]`；原生 Bilibili 播放器的媒体缓冲提示保持原样，LIVE 状态图标不属于加载动画。
- 2026-10-10 用户指定发送控件例外：私信及弹幕发送按钮共用 `src/styles/sendButton.scss`，圆形按钮内显示上箭头，空输入仅显示暗淡静止的上箭头，实际发送/上传/冷却中才显示转圈状态，状态交叉淡入淡出并支持 reduced-motion；原生弹幕按钮保留原节点、事件和禁用权威，不另建发送逻辑。转发媒体卡片默认封面宽 384px、16:9、外侧 8px 留白，随消息区缩小而收窄，不允许固有图片宽度撑破网格或气泡。
- 私信会话历史按 2026-09-08 的交互要求例外处理：点击会话先展开透明的右侧容器，展开结束再请求历史并逐条浮现，不使用历史骨架；会话列表及其他消息分类的骨架不变。展开期间刷新不能提前发出历史请求，关闭、切换或卸载须取消待开始的请求。
- 2026-09-09：私信会话容器在 2026-10-10 消息页实验改版中移除左右两条竖线；滚动、到达历史起点、分页或返回最新消息均不改变展开形态。首次打开才展开容器，切换用户仅淡出消息记录并逐条显示新历史，外框和输入栏保持同一实例；再次点击当前用户关闭详情，不通过 history.back 恢复前一个用户。换号立即清理旧视图，离场记录不可继续交互。输入栏底部在右侧内容区避让 Dock；桌面下输入栏按整屏中线保持左右边距相等，极窄窗口保留控件所需最小宽度，外壳复用播放页底部容器的 modal 圆角、边框、材质和边缘阴影，内部输入区使用匹配嵌套关系的普通实色表面。
- 消息页分类、搜索、筛选与会话列表共用持久侧栏，切换分类不卸载列表。分类复用 `WheelSelector.vue`：字号与几何取共享 token，无右侧箭头或选中背景；深色/OLED 使用白色与 67% 白字，亮色使用对应深色文字，hover 发光不裁切，滚动支持连续及反向输入、惯性尾巴抑制与 reduced-motion。搜索和筛选采用全圆角，会话行沿用置顶分组圆角规则。侧栏外壳贴齐左、上、下边界，内部避让顶栏，并只采样一次毛玻璃。消息顶栏保持 absolute，右侧分类独立滚动，渐变模糊仅覆盖侧栏右边缘到视口右边缘；层级依次为搜索控件、侧栏、模糊、内容，Dock 高于底部模糊。隐藏的会话不继续读取或 ACK。输入栏、返回最新按钮、封面与骨架的最终规范见下方收尾规则，不恢复早期的主题色箭头、矮导航或逐帧几何动画。
- 2026-10-10 消息交互补充：滚筒鼠标按下时不提前移动焦点位置，单次点击必须同时切换分类与页面；键盘方向键预览、Enter/Space 确认保持原语义。失效卡片提供独立的 288×96px 响应式占位。私信视频封面通过会话级 `usePrivateMessagePreviews` 复用 `useMomentPreviews` / `MomentVideoPreview`，封面悬停即开始请求并自动播放，保留暂停/进度控制；离开、离屏、会话/账号切换或隐藏时释放。普通动态/专栏封面只提供内容链接，不猜测其中的视频。聊天头像和会话列表头像通过有效 MID 与既有能力开关链接个人空间，会话选择按钮与头像链接互为兄弟，不嵌套交互控件或让头像导航触发会话选择。
- 文本及图片输入入口在开发和打包构建中保持一致。现有 `experimental` 目录名称仅是代码路径，不代表运行时门禁；不得恢复已取消的图片隐藏开关。
- 骨架复用真实内容的列数、封面比例、字号、行高、按钮尺寸和布局设置。已有数据及提交中的已知标签保持可读，只占位尚未取得的数据；不要用全页骨架遮住可继续使用的旧内容。
- 加载结束后卸载占位，离屏图片停止骨架动画；请求归属和清理复用现有 generation/lifecycle，reduced-motion 统一由共享骨架样式处理。
- Bewly 播放栏须在原生控制栏、弹幕栏和 Shadow DOM 中辅助按钮的实际布局稳定后退出初始化骨架；`playing` 事件不能代替控件布局就绪。
- 播放页侧栏排版优先保留原生作者、关注、充电、消息、评论和播放器节点。原生评论内的排版通过 MAIN world 既有 Shadow DOM 样式桥且限定于 `#bewly-widescreen-root`，不得为换材质重建业务控件。
- 播放页简介、标签和原生操作根节点的迟到更新/替换须由既有侧栏 Observer 处理；不可把它们与装饰、评论长列表和操作动画一概作为内部变化忽略。不克隆业务按钮，不复用已释放导航的节点，也不把脱落的 DOM 当作仍存活的原生组件重新挂回。
- 普通 BV/AV 页的作者、操作栏、简介和标签在移交前通过现有 videoMetadataBridge 同步确认 MAIN world 的原生 Vue 组件已挂载且拥有该根节点。ISOLATED 不直接读取 `__vue__`；DOM 存在、原位标记、API 统计均不能替代组件存活判断。组件销毁通知复用侧栏刷新及统一清理，不新增轮询或第二套业务状态。
- API 返回的点赞/投币/收藏/分享统计不代表原生操作就绪；缺少原生工具栏时不得将侧栏标记为完整。超时提供现有刷新/退出恢复入口，迟到的原生工具栏恢复后清除错误。
- 播放侧栏由 aside 容器自身绘制唯一毛玻璃背景；2026-09-27 用户批准阅读层优化，头部和内容区使用完全不透明的语义阅读面，分类和留白保留外壳材质。内部不得再次采样背景，不使用负 z-index 伪元素承载整栏模糊。
- 播放侧栏默认宽度为窗口 50%，可拖动至 85%；保留已保存的手动像素宽度。作者和完整操作栏按可用宽度并排或上下排布，简介与标签共用无滤镜的内嵌圆角容器；历史弹幕按钮只改变视觉定位，保留原生列表父子关系及模式显隐。

- 2026-10-11 通知阅读与发送状态：Reply / At / Love 使用头像与正文两列、正文下方引用区，System 使用单色线框图标及标题/来源/正文；阅读内容最大宽度 960px，窄栏的引用区跨整行，多人点赞头像组可独立成行，骨架共用同一布局与容器断点。保留原渐变边缘、独立滚动、分类请求、账号隔离与已读提交。图标使用不透明语义前景，不使用 duotone。发送控件统一区分 ready / idle / pending / blocked：空输入是暗淡箭头，明确发送中或倒计时才转圈，原生禁用编辑器或会话 `canSend=false` 显示暗淡感叹号并说明不可发送。只读私信显示禁用 Composer，不赋予发送权限；文本、图片、Enter、表单和重试均须保持权限门禁。评论增强复用原生 Lit 更新与编辑器局部 input 事件，保留原按钮、事件、校验与禁用权威；不新增全局键盘监听或轮询。

- 2026-10-11 底部导航细化：当前筛选结果含置顶会话时隐藏工具栏下分隔线，保留边框占位避免布局跳动。回到底部圆钮复用 `--bew-message-input-height`（44px），与单行输入框垂直中心对齐；搜索匹配胶囊保留现有桌面/窄屏高度。返回与匹配箭头使用 2.5px 线框，暗色/OLED 为纯白、亮色为纯黑，hover 经 300ms 过渡到主题前景；匹配按钮复用表情/图片的中性透明填充，计数增加左侧内距，保留键盘焦点与 reduced-motion。

- 2026-10-11 消息页收尾检查：用户与历史搜索的防抖、读取间隔及结果展开批量由 `privateSearchPolicy.ts` 统一，导航箭头复用 `ChevronIcon.vue`；列表骨架使用最新卡片圆角并保留菜单位置。服务端屏蔽词 `words` 为 null/缺省时，在额度字段合法的前提下视为空列表；读取失败、增删失败及已提交未确认分别呈现，重试撤下旧错误，禁止以失败响应推断空列表。增删必须拥有已读取额度，重复词及越界输入不得发请求；成功写入需确认词的存在/不存在，未确认前不重复提交。已有词及新输入草稿在刷新和异步回读期间保持可读，换号、离场失效旧请求。

- 2026-10-11 消息设置纠错与复查：屏蔽词允许 `words: null` 或缺省的合法空返回，仍验证服务端额度；通过独立 `loaded/failedOperation` 区分初读、增删和对账错误，重试期间撤下旧错误，失败时不显示“暂无”。已接受但未确认的增删必须刷新确认目标词的存在/不存在，不能重复提交；输入草稿保持可编辑且按提交时快照清空。筛选漏斗使用较细的单色线框并以间距 token 内移，保持原生 select 的键盘与筛选能力。

### 排版

- 2026-10-11 资料库左栏统一：收藏、稍后再看、观看历史复用 `LibraryWorkspace.vue` 的贴边持久左栏，宽度与消息页一致，单层毛玻璃及实色降级复用消息页色调；保持页面级主滚动与原有分页／虚拟列表，不另建右侧滚动状态。`LibrarySidebarHeading.vue` 复用 WheelSelector，分类使用精简标题；`LibrarySearchField.vue` 统一全圆角、常驻细边框、单一清除按钮和右侧筛选图标，IME 与空查询门禁必须保留。顶栏搜索及菜单高于侧栏，侧栏高于右侧顶栏边缘模糊，Dock 保持现有层级。收藏目录选中为不透明主题色及匹配对比前景，管理菜单保留 hover/focus/touch 入口；不再把视频封面作为这三个左栏的玻璃背景。首屏骨架使用同一左栏布局。

- 2026-10-11 概览材质与切换修订：保留紧凑两列四卡及细边框，Insights 卡片内底完全透明，不采用生成图中的三分区布局。概览的父层间距通过实际残留 DOM 判断，退出淡出完成前不因会话选择改变而跳动。Composer 在会话初始化时即挂载、测高并预留空间，opening 阶段 inert，入场仅使用 8px transform 与内部内容 opacity；玻璃外壳自身及入场祖先保持不透明。透明会话滚动层的 height/padding 不再逐帧动画，仍保留原来的入场结束后请求历史、切换复用与 reduced-motion 生命周期。

- 2026-10-11 概览密度修订：Insights 在可用宽度 720px 起采用等宽两列、四张紧凑卡片；上排未读柱状图与活动折线，下排私信来源比例（合并已载入／置顶／免打扰统计）与四个最近会话。间距 12px、卡片内距 16px、环图 96px，折线与骨架复用 `--bew-insights-chart-height`；不再使用三列跨栏布局或独立的宽屏底部会话卡。常规桌面一屏呈现，窄屏回退单列并保留正常滚动，不裁切数据与操作。

- 2026-10-11 消息概览：未选会话时使用 `ConversationInsights.vue` 展示权威未读计数、私信来源比例及已载入会话信息；粗柱状图使用不透明的主题色强度分级，活动折线使用主题前景与独立对比色，均复用语义圆角。近 7 天折线统计每个已载入会话的最近活动日期，不得伪称为完整收件历史或伪造趋势；未知计数用占位短线，真实零值保持 0。只有用户点击“全部标为已读”时才通过 `useMarkAllMessagesRead` 显式读取其他分类并遍历私信会话分页；复用真实 category read/update_cursor/ACK，不直接归零 Store。按服务端 seqno 确认成功后更新已载入会话，期间到达的更新序号保持未读，拒绝/停滞提示部分失败并允许重新读取后重试，换号、离页或卸载停止后续操作；系统 cursor 写入前再次确认账号与页面归属。

- 2026-10-11 通知卡片紧凑化：四类 Native Feed 与骨架共用 `.native-notification-grid`，可用内容宽度达到 880px 时由 `MasonryGrid.vue` 按内容自然高度放入较短的一列，窄屏单列；DOM 保持时间顺序，分页追加不重分配已有卡片，ResizeObserver 与帧任务随组件卸载清理。引用与正文跨满卡片内宽，引用左侧与头像齐平，头像及标题区垂直居中；通知外层不再限制 960px 居中宽度。引用底色使用独立语义 token，暗色/OLED 向深色收敛；卡片与私信气泡共用弱化后的表面细边框，自己气泡仍保持不透明主题色。图片类气泡外圆角 16px、媒体 8px、留白 8px，保留双方气泡的指定直角。骨架同步列数、头像、正文与引用结构，点赞无正文占位、系统通知保留来源行；分页、已读与请求生命周期不因排布变化而改动。

- 基础界面文字限定为：caption `12/16px`、control `13/18px`、body `15/24px`、title `15/22px`、heading `20/28px`，优先使用对应的 `--bew-font-size-*` 和 `--bew-line-height-*` token。
- 品牌锁定字等极少量展示文字使用 `--bew-font-size-display`，比分等大号数据使用 `--bew-font-size-data/data-emphasis`；图标字体只使用 `--bew-icon-size-sm/md/lg/xl`。这些不参与正文层级，也不要用任意字号模拟。
- 字重仅使用 `400/500/600/700` 对应的 `--bew-font-weight-regular/medium/semibold/bold`；不要新增 `650`、裸写 `bold` 或其他中间值。
- 正文默认 `400`，次要强调和普通按钮用 `500`，标签/卡片标题/区块标题用 `600`，`700` 仅用于品牌文字、强标题和少量关键数字。
- 页面主标题复用 `.bew-page-heading`，不要在页面里重复组合字号、字重和行高。
- 同组标签的未选中与选中状态保持相同字重，依靠颜色、背景和液态指示器表达状态，避免切换字重导致文字宽度和指示器跳动。
- 新样式不要混用无语义的 px/rem 字号；确需特殊字号时应先判断能否扩充语义 token。

### 紧凑控件

- 2026-10-12 侧栏独立单行操作：卡片、分段控件之外仅含图标与文字的整行按钮复用 `.library-sidebar-action` 与 `sidebarAction.scss`。按钮命中区域等宽居中，内容靠左，首个图标或文字的左边缘与滚筒选中标题对齐；宽度和内距通过 `--bew-sidebar-action-inset/padding` 从标题实际内距计算。常态透明无边框，hover 在亮色/暗色略加深、OLED 略提亮；保留语义警告色、禁用和键盘焦点。卡片内部操作、播放全部卡片、分段筛选不套用此规范。

- 默认规格：外层高 `36px`、padding `4px`、gap `4px`、内部项高 `28px`、文字 `13/18px 600`、图标 `16px`。
- 普通文字项水平 padding 为 `12px`；页面主标签使用 `.bew-segment-control__item--wide` 的 `16px`；纯图标项使用 `.bew-segment-control__item--icon`。
- 必须覆盖 default、hover、focus-visible、active、disabled 状态；不要移除键盘焦点反馈。
- `src/styles/main.scss` 提供全局 `focus-visible` 兜底；2026-10-10 起全项目选择、展开、聚焦与编辑描边统一使用中性 1px 的 `--bew-focus-ring` / `--bew-focus-ring-color` / `--bew-focus-shadow`，不再绘制主题色粗 outline、UnoCSS ring 或外扩阴影环。Input、Select、Slider、布局编辑器以及 MAIN world / 原生页注入样式均遵循此规则；不得通过关闭键盘焦点反馈来实现。组件只有在提供等价反馈时才能覆盖或移除焦点样式。
- 点击目标不得小于 `24 × 24 CSS px`，普通文本与背景对比度目标不低于 `4.5:1`。

### 间距

- 布局使用 `4px` 基准网格，优先选用 `--bew-space-*`：`4/8/12/16/20/24/32/40/48px`。
- `2px` token 仅用于边框、焦点环和光学微调，不用于常规容器 padding 或同级元素 gap。
- 紧密内联元素使用 `4px`，控件内部或紧凑列表使用 `8px`，关联元素组使用 `12px`，组件/栏位之间使用 `16–24px`，页面区块之间使用 `32–48px`。
- 同层级的卡片、列表和工具栏必须使用相同 gap；避免新增 `3/5/7/10/14/18px` 等一次性布局间距。确有视觉校正需求时需保留局部注释说明原因。
- 区分容器 padding 与同级元素 gap，不用子元素 margin 拼接公共布局间距。

### 圆角

- 圆角使用 `--bew-radius-sm/half/md/lg/xl/2xl/full`（`4/6/8/12/16/24px/full`），不要直接新增 `5/7/10/20/999px` 等一次性值。
- 优先使用语义 token：卡片 `--bew-card-radius`、媒体封面 `--bew-media-radius`、普通面板 `--bew-panel-radius`、Dialog/设置窗口等大型模态容器 `--bew-modal-radius`、顶栏 Pop/浮层 `--bew-popover-radius`、普通交互项 `--bew-interactive-radius`、徽标/胶囊 `--bew-badge-radius`。
- 视频卡片、动态卡片和同层级内容卡片默认使用 `12px`；内部按钮/菜单项通常使用 `8px`；小型状态块和骨架条使用 `4–6px`；头像等真实圆形可使用 `50%`。
- 父子元素需要共享裁切轮廓时，子元素使用 `inherit`；不要通过 `calc(父圆角 - 任意像素)` 猜测内层圆角。
- 同一个 Pop、卡片或媒体容器的四角必须来自同一语义 token，局部直角仅允许用于明确的相邻拼接结构。
- 胶囊与面板之间需要动画时，不要直接从 `--bew-radius-full` 插值；起始值应使用胶囊真实几何半径，结束值使用语义圆角，避免大数值被持续裁切后在动画末尾突然跳变。

### Pop 与浮层

- 顶栏搜索、设置搜索、搜索筛选等同类 Pop 默认与触发控件等宽，并复用实色 `.bew-popover-surface`；不要在组件内重复维护背景、边框、圆角、阴影。伸出顶栏边界的固定 `.bew-popover` 可使用独立玻璃，其内部菜单和控件仍用实色。
- Pop 与视口或所属主面板至少保留 `8px` 安全边距；窄屏允许扩展到所属内容区的安全宽度，但不能依赖固定宽度越界后再裁切。
- 结果数量可能变化的 Pop 必须根据下方可用空间限制 `max-height`，内容超出时只在 Pop 内部滚动，并使用 `overscroll-behavior: contain` 避免滚动穿透。

- 2026-10-10 搜索细化：搜索匹配导航的高度与横向锚点独立于 Composer 是否存在，桌面复用单行输入容器的 62px 语义尺寸，窄屏保留 40px 紧凑导航并避让输入栏。搜索状态不显示扫描条数，也不显示骨架条；结果列表独立滚动，底部居中胶囊保留同一按钮实例，运行时为旋转放大镜与往返浮光，暂停后为暂停图标及“继续搜索”，支持 reduced-motion。会话内定位使用无圆角的半透明主题色整行渐变，收到的从左向右消失、发出的反向；这是用户明确要求的主题色透明例外。发出消息的文本/媒体气泡、选中会话及结果关键词使用不透明主题色与对应前景。初始页面骨架按滚筒文字层级与 8px 控件轮廓占位；尚未读取的右侧会话保持透明，不绘制虚构历史和旧有边框卡片。

- 2026-10-10 左栏控件细化：搜索框及“全部 / 未读 / 置顶”（包括搜索时的“用户 / 消息”）使用全圆角；会话类型原生筛选以图标放在搜索框右端，不显示独立文字或 tooltip，保留无障碍名称、键盘焦点与 hover。清除按钮与筛选图标各占独立 28px 位置，中间保留 4px 间隔；类型筛选同时作用于用户和消息搜索结果；历史搜索的计数、选择及前后导航共用筛选后的集合，筛选变化不重新扫描历史。筛选图标 hover/点击/键盘聚焦不画边框或底板，仅在深色/OLED 变纯白、亮色变纯黑；搜索框边框常驻，清除按钮 hover 仅图标使用可读的主题色前景，背景保持透明。匹配渐变的绘制区从左栏右边界开始，不改变头像与气泡的水平位置，上下各超出消息行 8px；搜索时间线间距为 24px，避免渐变侵入相邻消息。搜索与筛选骨架同步采用胶囊轮廓，不再保留旧会话类型独立行。

- 2026-10-10 消息页细化：无符合条件会话时只在列表可用区域水平/垂直居中显示文案，不挂载 Empty 插图，也不追加空列表结束提示。自己发送的消息复用顶栏响应式边距额外内缩，头像保持比顶栏头像更靠内。多行输入的发送按钮与输入框共同变为平滑圆角矩形，按钮随输入区拉高、保留 4px 内嵌间距，单行恢复圆形；继续复用发送/冷却状态与 reduced-motion。侧栏单一半透明磨砂表面改为页面底色的轻微中性偏移：亮色混入 6% 黑、深色/OLED 混入 8% 白，再使用现有透明度合成；因此 OLED 侧栏略高于纯黑页面，而非与页面同为纯黑。关闭磨砂仍使用相应实色 token，初始骨架使用同一侧栏材质。

## 工具约束

- 2026-10-11 搜索缓存与气泡细化：消息分类内修改关键词后按 350ms 防抖自动重新搜索，暂停可取消尚未开始的搜索。同一关键词切换“用户 / 消息”保留两类内存结果、用户分页、消息匹配位置及已展开的结果数量；隐藏分类暂停后续请求，切回时复用缓存或从已有游标继续，保留用户手动暂停的状态。关键词变化、换号或离开消息页清理对应历史缓存，不持久化私信正文。用户与消息结果的“查看更多”共用 `messageSearch.scss` 胶囊，与停止/继续搜索同材质、同高度，位于队尾留白之后居中。对方气泡左上角、自己气泡右上角为直角，这是本轮明确授权的气泡轮廓例外；文字、图片、分享卡片及失效消息外层统一处理，内部媒体圆角保留。

- 2026-10-11：主题切换的圆形裁切保持终态直到 `ViewTransition.finished`，不能在内部动画结束时移除快照样式；取消的旧回调不得重新提交主题。私信匹配渐变须覆盖到屏幕右边缘，并保持消息内缩不变。会话行三点菜单复用 `ContextMenu`/`Dialog` 与页面级 `usePrivateSessionActions`，置顶/免打扰/内容推送依当前发布客户端协议提交并回读，黑名单复用共享关系修改及通知；举报必须由用户选择理由并明确确认，最近最多 10 条证据消息只读、不 ACK、不持久化。“通知正常接收”是内容推送操作的说明，不是独立开关。读回未确认时不允许重复提交，刷新必须匹配目标状态；换号、离场、隐藏及关闭菜单释放临时状态。协议与验证边界见 `docs/maintenance/2026-10-11-private-session-actions.md`。
- 2026-10-11 会话视觉细化：举报确认窗单独关闭顶部渐变模糊，不改变其他 Dialog。选中会话时间、名字和摘要均使用主题色对应的对比前景；会话 hover 轮廓改用 12px 卡片圆角。未选中置顶行在亮色下常驻纯白、暗色/OLED 下常驻加深底色；按当前实际相邻项连接，接缝直角、整组首尾圆角，独立置顶行保留四角。选中状态的实色主题背景优先，筛选及搜索分组不能跨越非相邻项连接。

- **Chrome DevTools MCP**：仅在用户**主动要求排查/调试页面**时使用；非必要不要用。仅当本机已安装且可调用 chrome-devtools-mcp 时参考相关能力；未安装/未开启则整节忽略。

## 提交规范

- 标头遵循 Conventional Commits：`<type>(<scope>)!: <description>`；`scope` 和表示破坏性变更的 `!` 均为可选项
- 支持的 `type`：
  - `feat:`：新增功能
  - `fix:`：修复问题
  - `docs:`：仅修改文档
  - `style:`：仅调整格式，不改变代码行为
  - `refactor:`：重构代码，不新增功能也不修复问题
  - `perf:`：性能优化
  - `test:`：新增或调整测试
  - `build:`：构建系统或依赖变更
  - `ci:`：CI 配置或脚本变更
  - `chore:`：其他维护性变更
  - `revert:`：回退既有提交
  - `merge:`：将 PR 或分支合并到目标分支
- 冒号后说明用中文，准确概括改动
- 合并 PR 时使用 `merge: 合并 PR #<number> <标题>`
- 有对应 [issue](https://github.com/keleus/BewlyCat/issues) 时在 commit 后附 `#{issue}`
- PR 不要提交 tests 文件

## 双仓库开发守则

完整流程见[上游协作流程](docs/maintenance/upstream-workflow.md)，历史设计见[维护索引](docs/maintenance/README.md)。任务明确指定的分支优先于通用基线；当前连续开发沿用 `message_feature`，不自动切分支或创建 worktree。

- 开始任何写入前，必须执行并阅读 `git status --short --branch`、`git remote -v` 和 `git branch -vv`；remote URL、当前分支或追踪关系与文档不符时，停止写入并报告。
- 必须先按任务类型选择基线：Bewly_Nocturne 品牌、外观、交互、个人定制、`port/*` 和 `sync/*` 从最新 `origin/main` 创建；可独立贡献给 BewlyCat 的 `fix/*` 从最新 `upstream/main` 创建。
- 推送目标必须与任务类型一致：`fix/*` 只能推送到 `contrib`，Bewly_Nocturne 功能、`port/*` 和 `sync/*` 只能推送到 `origin`，永远不得推送到 `upstream`。未经用户明确授权，不得 push 或创建、合并 PR。
- 处理上游修复前，必须用 `git merge-base --is-ancestor upstream/main HEAD` 检查 ancestry，并用 `git log --oneline upstream/main..HEAD` 与 `git diff --stat upstream/main...HEAD` 检查提交和差异范围；发现 Bewly_Nocturne 定制内容时不得推送。
- 移植修复只能在从 `origin/main` 创建的 `port/*` 上使用 `git cherry-pick -x <sha>`，并检查 `origin/main...HEAD` 的提交与 diff；不得 merge 整个 `fix/*`。
- 同步上游只能在从 `origin/main` 创建的 `sync/*` 上显式执行 `git merge --no-ff upstream/main`，不得在 `main` 直接 merge。
- 冲突必须逐项、逐块审查。复杂或语义不明确的 UI 冲突必须停止操作、列出行为差异并请求用户决定；不得整文件选择 ours/theirs，也不得使用 blanket ours/theirs 策略。
- 必须保护用户已有的 staged、unstaged、untracked 和 stash 内容。未经明确授权，禁止 reset、clean、删除分支或 Worktree、改写历史以及其他 destructive Git 操作。
- 上游 PR 必须排除 Bewly_Nocturne 专用 `AGENTS.md`、品牌化 `README.md`、维护文档、构建或打包产物，以及与修复无关的格式化；只包含可独立提交给 BewlyCat 的最小修复。
- 实际执行 commit 前必须重新运行 `pnpm lint` 和 `pnpm typecheck`；只有各命令最新一次完整运行的退出码均为 `0`，才能声明检查通过。

## Bewly_Nocturne 维护决策摘要

条目按记录日期理解；后续规则与当前源码优先。完整历史见[维护索引](docs/maintenance/README.md)，不把早期框架、实验门禁或临时验证状态当作当前能力。

- 2026-10-11：完整移除用户自定义样式功能及编辑器、设置/搜索入口、文案和页面/Shadow DOM 注入。旧字段只在统一废弃字段表中保留，用于权威存储加载后的清理与云同步拦截，不迁移或重新启用。保留字体、主题和原生页面适配所需的内部样式注入。

- 2026-10-11：用户冻结消息页与稍后再看页当前设计。后续页面可复用既有组件、token 和交互样式，但不得借重构或统一样式改变这两页的已确认外观。观看历史沿用同一侧栏语言，独立扩展筛选、排序和批量管理。
- 2026-10-11：动态页四类筛选与个人资料、发布入口、直播列表整合到 `LibraryWorkspace` 持久侧栏，分类复用滚筒。三模块仍受原设置控制，但窄窗口和关闭模块不得隐藏分类导航。右侧保留关注用户栏和原有动态流，以实际内容宽度计算列数；侧栏与顶栏沿用共享层级，内部不再采样玻璃背景。
- 2026-10-11：动态页右侧热搜复用 `searchExperience` 的共享请求、缓存和可见性生命周期；关注用户栏与动态卡片共用中间列，不能延伸到热搜列。热搜在宽窗口停靠于顶栏下方，内容区过窄时改为顶部紧凑区域，保留可访问性和内部滚动，不另建热搜轮询。
- 2026-10-11：小电视独立于顶栏的滚动显隐和动画，鼠标及触屏点击均只回到首页；分区浮层移至首页标签栏右侧，保留分区链接、键盘及触屏访问。Dock 只允许底部和右侧，旧左侧值统一迁移到底部，设置、布局预览和运行时复用同一位置策略。收藏侧栏不再显示滚筒上方的重复标题。

- 2026-08-06：完成顶栏模式切换重构。顶栏模式现作为 `DockAndSidebar.vue` 的特殊配置项，复用既有全局页面模式和顶栏状态；旧的搜索框下方悬浮切换器、Teleport、显隐控制、层级、设置项及废弃文案已清理。
- 顶栏模式配置不属于 Dock 导航项，不参与拖拽排序，不显示“新标签页”选项；自定义顶栏选择与全 Bewly / 全原版模式保持同步，不恢复已删除的旧入口或兼容层。
- 本次变更已在独立测试 Chrome 窗口中加载开发扩展并通过 Bilibili 页面注入验收。后续涉及上游顶栏实现的更新默认不批准，必须先取得用户明确授权后再移植或合入。
- 2026-08-06：深色网页背景统一使用受 OKLCH 明度/色度约束的 `--bew-dark-page-bg` 派生 token；`enableOledDarkMode` 仅在有效深色主题下通过 `oled-dark` class 生效，并同步到相关 iframe。首页不直接覆盖 Bilibili `body` 背景，纯黑底色由插件自己的 viewport wrapper 承载，以保护原站布局和滚动层。
- 2026-08-08：完整移除背景图片功能；不恢复壁纸设置、上传入口、存储字段、渲染层或旧数据兼容逻辑。
- 2026-08-08：建立平滑连续圆角、语义表面边框和主题色前景对比系统；统一设置页与 Dialog 的顶部渐变模糊层、关闭按钮、标签删除按钮和媒体裁切轮廓。
- 2026-08-08：毛玻璃默认开启；唯一的负向设置 `disableFrostedGlass` 同时关闭全局毛玻璃与普通顶栏渐变并切换到实色表面。暗色主题色渐变由 `useLinearGradientThemeColorBackground` 统一控制页面与顶栏，不恢复旧顶栏专用开关。
- 2026-08-08：统一扩展失效消息处理和内容脚本刷新提示；开发模式关闭内容脚本压缩，避免长期 watch 后增量函数重命名失配，生产构建仍沿用原有压缩行为。
- 2026-08-09：新版本与重载提示统一为 round 面板轮廓；顶栏登录入口和共享关闭按钮改用实色语义表面。“Bewly 页面”二级导航新增播放页与消息页独立空框架，不预设状态或兼容层。
- 2026-08-09：Dock 新增按钮收起、隐藏收起入口、离开后自动收起三档行为；收起态复用单一 Dock 实例并保持在展开 Dock 的几何中心。同一毛玻璃外壳先连续改变真实宽高，再分阶段加载或退出按钮组，不恢复为两个表面交叉淡入。
- 2026-08-09：Stage 2 完成动态、历史、稍后再看、订阅流、榜单、过滤、快捷键、视频预览和 URL 净化的确定性修复；分页只在成功响应后推进，尾页数据先消费再结束，异步响应按局部 generation 隔离。
- 2026-08-09：扩展重载后的旧 content script 将 context invalidated 视为终止状态；停止共享状态轮询并收敛未处理 Promise。Shadow DOM 样式失败时卸载该次插件 UI，不得显示透明、错位的无样式 Dock 或设置页；刷新页面后由新上下文正常挂载。
- 2026-08-09：For You、Moments 和 Following 的内容缓存、分页与本地状态按 Bilibili MID 隔离，未登录状态与任意已登录账号也必须分开；切换账号时旧请求必须失效。
- 2026-08-09：稍后再看以 `topBarStore` 的完整 `aid` 集合为唯一成员状态源；Moments、VideoCard、顶栏和原站增强不得各自维护 aid/bvid/epid 真值，mutation 后通过专用失效消息跨标签重新获取服务端权威集合。
- 2026-08-09：Bewly 全局播放器/页面快捷键和快捷键设置入口已移除，不得重新注册会与 Bilibili 原站竞争的 window/document 键盘监听；Dialog、Drawer、图片查看器和菜单/输入控件的局部无障碍键盘交互必须保留。
- 2026-08-09：Cloud Sync 保留 pending/quota blocked/failed/synced 语义和有上限退避；存储初读失败不得解释为空存储并回写默认值。MV3 App Auth 使用 `browser.alarms` 保持 token 新鲜度，不恢复后台长期 interval。
- 2026-08-09：站内导航收敛到 `useRouteState.ts` 单例，共享 pushstate/replacestate/popstate/hashchange 和一个低频 fallback；页面模式、主题、顶栏和内容脚本不得重新建立各自的高频 URL 轮询。截图、画面比例、触屏手势、随机播放和收藏弹窗的 observer/listener 必须跟随页面与设置生命周期启停。
- 2026-08-09：TopBar DOM `Ref` 注册表不得使用会自动解包子 ref 的深层 `reactive`；未登录或元素尚未挂载时，transformer 必须仍获得 Ref 容器，不得因读取 `undefined.value` 阻断页面。
- 2026-08-10：选择性同步并审查 BewlyCat 新增修复，同时完整移除 Bilibili Evolved 的样式、DOM 探测、运行时分支、设置和文案。原版顶栏从此严格指 Bilibili 原生 `.bili-header`，不得重新引入第三方顶栏兼容层。
- 2026-08-10：顶栏搜索框的异步宽度校正必须立即生效，不得为水平 `transform` 添加过渡，避免页面重新加载时出现横向入场动画。
- 2026-08-11：首页默认整合搜索页；独立搜索页由单一反向开关控制。整合模式下不得单独进入 `AppPage.Search`，Dock 隐藏搜索项并由首页承接搜索结果选中状态；两种搜索页面继续共用同一组持久化设置。
- 上游审查范围根据已合入源码与[历史索引](docs/maintenance/README.md)中的固定 SHA 确认，不将旧日志游标视为当前远端进度。

## Bewly_Nocturne 上游同步保护基线

以下是本项目有意区别于 BewlyCat 上游的产品设计。同步上游时必须逐项保护；发生冲突时按行为和实现锚点审查，不得直接以整个上游文件覆盖。

### 导航、顶栏与页面模式

- 主 Dock 是完整胶囊；未选中导航项没有圆形底板，Hover 保留发光反馈。浅色模式使用主题色选中背景和主题色光晕，深色模式保留白色发光指示与黑色选中图标。
- Dock 指示器动画和刷新后的严格居中行为必须保留；Bilibili / Bewly / 自定义三档页面模式及其持久化、与 Dock 内容设置的同步关系不得拆散。
- Dock 收起模式保留 `button / hidden / automatic` 三档：按钮模式在设置按钮后显示收起入口，隐藏模式不提供收起功能，自动模式在指针离开后收起且 Hover 圆球立即展开。收起圆球必须保持展开 Dock 的几何中心；展开时同一玻璃外壳先沿主轴增长，完成后按钮组再轻移进入，收起时顺序反转。不得通过 Teleport、第二套 Dock 状态或两个表面交叉淡入实现。
- 顶栏模式只在“Dock 内容调整”中作为特殊配置项存在，不是 Dock 导航项，不参与拖拽，也没有“新标签页”选项。全 Bewly 使用 Bewly 顶栏；全原版使用 Bilibili 原生 `.bili-header`；自定义模式根据现有配置选择 Bewly 或 Bilibili 原生顶栏。不得探测、适配或承诺支持第三方顶栏实现。
- 已删除的 `BewlyOrBiliTopBarSwitcher.vue`、搜索框下方悬浮入口、Teleport、层级、显隐设置和废弃文案不得恢复。任何新的上游顶栏视觉或交互更新默认不批准，移植前必须取得用户明确授权。
- 首页默认整合搜索页并复用单一 SearchBar 实例：初始位置保留聚焦人物，滚动到顶栏后原实例粘附且人物隐藏，不得再生成第二个顶栏搜索框。独立搜索页开关关闭时，`AppPage.Search` 路由归一到首页且 Dock 不显示搜索项；两种形态直接共用现有搜索设置，不恢复“与搜索页共用的配置”跳转入口。首页与搜索页只复用顶栏表面样式，必须保留搜索框自身的 `550px` 最大宽度。
- Dock 默认位于底部；`Notifications` 当前正式基线是 Native Message Center：`reply / at / love / system` 使用 Vue Native Feed，`whisper` 是支持会话管理、文本与图片发送及历史搜索的 hybrid workspace。普通用户、官方助手、未关注和拦截的一对一会话均在当前 Bewly 页面读取；粉丝团和不支持的会话先进入 Native fallback 详情，只有用户明确点击“打开原版私信列表”才离开 Bewly。Whisper 未选择会话时显示当前账号的 Insights 与全部标为已读入口，不隐式挂载原版私信 iframe；无有效账号时保留空状态。Notifications 不包含消息设置分类；消息内容页不提供设置入口，消息设置只存在于全局“Bewly 页面 → 消息页”。旧 `notificationView=settings` 必须在 outlet 渲染前同步规范化并通过同一类型化 Settings API 打开该页面，当前发布版原版消息设置通过独立 background transport 与页面级 composable 原生接入；服务端值不得写入 Bewly 本地 settings，每个字段必须独立提交并以服务端回读结果对账，屏蔽词额度以服务端返回为准。Settings 二级纵向导航的选中态使用主题实色与 `--bew-on-theme-color` 前景，深浅主题保持一致且不使用半透明主题底色。System 只使用当前发布客户端已验证的 `unified + user` 首屏、单一 legacy cursor 历史流和 `update_cursor` 已读契约；系统条目采用独立文本/链接模型，禁止猜测图片、按钮或 module 数组。原版 System URL 必须保留为显式失败 fallback，但 Notifications 不再挂载 System iframe。
- 四类 Native Feed 共用加载、错误、刷新、分页、滚动锚点、账号隔离和 read-commit 生命周期；页面级 controller 按分类保存状态，但同一时间只允许渲染当前一个 Native Feed DOM。隐藏分类不得保留完整长列表、IntersectionObserver 或 visibility listener，也不得通过 KeepAlive 保留多套 Feed 组件。
- Reply / At / Love / System 的 items、cursor、read commit、请求 single-flight、缓存与 scrollTop 必须独立；System 使用专用通知模型和单一 string cursor，不得强塞入 actor 模型。所有 Feed 按当前 MID 隔离，账号变化后旧 generation 的响应不得写入新账号。通知解析、聚合或分页规则变更必须同步脱敏 fixture，并通过 `pnpm verify:notifications`，不得绕过该门禁。
- Native Feed 的自动激活、未读变化与可见性刷新必须使用 `merge-head` 更新首部并保留已加载历史与视觉锚点；用户手动刷新使用 `replace`、重置分页并回到顶部。分页必须检查 cursor 或唯一条目是否前进，停滞后停止 Observer 自动请求；Retry 必须根据 `failedOperation` 精确重试首次加载、刷新或分页，不得根据 items 数量猜测。
- Native Feed 的服务端已读成功后只通过 `topBarStore` 的单一权威路径同步未读与跨标签 broker；不得建立第二套 unread Store。System 必须先成功提交当前发布客户端真实的 `update_cursor`，再创建 read commit；没有逐条 unread 证据时不得推导逐条红点。`NotificationsDrawer` 与直接打开的原版页继续保持路由、滚动和状态独立，Whisper 与 System Native Feed 均不得隐式创建原版消息 iframe。
- 私信 Web IM 固定通过后台 `api.vc.bilibili.com` Web endpoint、显式复用现有 WBI 签名并对已确认的 ID/seqno 字段做窄范围无损解析；消息正文与会话草稿不得持久化。会话历史按 `msg_seqno` 边界分页并以 `msg_key` 去重；ACK 只在当前会话可见且位于最新消息区域时提交，成功后才清除本地未读并通过 `topBarStore.syncUnreadMessageState()` 同步权威角标。会话详情状态按最近访问时间执行页面级 LRU，当前会话与 ACK 请求中的会话不得淘汰；每个会话的消息数组受设置上限约束，裁剪只保留最新消息且必须保留独立历史分页边界。离开 Notifications 必须释放消息数组和失效旧请求，隐藏组件不得保留 visibility listener、Observer 或后台刷新。
- 2026-10-10 用户要求 Telegram 式统一搜索：左栏输入框不显示 placeholder，只保留一个自定义清除按钮；关键词存在时显示“用户 / 消息”分类，退出搜索恢复原筛选和列表滚动位置。用户搜索即时筛选已载入会话并在 350ms 停顿后查询完整关注列表，支持单字名称，不以本地无匹配为前提；关注结果每页 10 条，按服务端分页串行限速自动加载至结束，取消旧的三页上限，然后自动请求全站用户首屏；全站结果仍以每页 10 条、最多三页手动续载。两组分别保存分页、错误与账号/查询缓存，展示“已关注用户”和“所有用户”，跨组按 MID 去重，已关注用户不重复进入所有用户组；无关注结果不展示该组标题或空提示，两组都没有匹配项时仅居中显示“没有找到相关用户”。清空/换查询、隐藏、离场或换号须停止后续自动分页并失效旧响应。远端结果按 MID 去重；没有权威会话的结果只作为内存中的 transient recipient，不污染会话分页、游标、未读或服务端排序，首条消息确认后再换为真实 session。
- 全会话历史搜索只在用户选择“消息”或提交关键词后开始，使用已验证的会话/历史分页接口，消息每页 20 条沿用当前原版客户端参数，串行限速读取并自动分轮续查；暂停、清空/更改查询、隐藏页面、离开或换号均停止后续扫描并失效旧响应。消息正文与搜索结果不持久化；大结果集分批显示并可继续下一批，不能把请求预算或显示上限当成全部检索完成。群聊/不可读取会话明确标注未覆盖，失败保留结果并支持重试或显式跳过。搜索绝不 ACK、不写入普通会话消息缓存或挤占其 LRU；定位结果先打开会话，再读取临时上下文，包含匹配前后的消息。匹配计数及前后导航在输入栏右侧复用原向下箭头的同一材质容器；桌面同高，极窄窗口放到输入栏上方右对齐避让。Enter / Shift+Enter 切换匹配，导航跨会话时保留按钮或输入框焦点，Escape 退出搜索并恢复输入焦点。
- 普通用户与 transient recipient 的会话详情显示文本与图片 Composer；官方助手及不支持会话不开放发送。`send_msg` 的 WBI 只签 `w_sender_uid / w_receiver_id / w_dev_id`，`wts / w_rid` 仅进入 URL query，表单 body 不参与签名；同一账号的 UUID v4 `dev_id` 存于 extension local storage 并在 query/body 复用。Chromium 只对精确 `web_im/v1/web_im/send_msg` POST XHR 改写消息站 Origin/Referer。只有 API `code=0` 且服务端历史对账确认后才显示成功；accepted-but-unconfirmed 不得自动重发。2026-08-14 的真实 HTTP `412` 负向 fixture 必须继续作为 `risk-control` 回归样本，但不得再作为永久禁用 DEV 测试入口的 gate。2026-09-08 用户明确要求开放图片入口：复用现有 upload/send、optimistic/reconcile 与 Composer 资产，选图仅生成本地预览，明确发送后才上传；换号、切会话或卸载后停止未发出的上传/发送步骤并释放对象 URL。表情选择按账号读取原生用户表情目录，不能用历史 `e_infos` 代替用户可用表情包；实站发送验收以本轮维护记录为准。

### 深色背景、OLED 与主题色

- 深色网页底色必须从 `--bew-dark-base-color` 在 OKLCH 中约束明度和色度后派生为 `--bew-dark-page-bg`；不得退回简单混黑，也不得让基准色直接支配网页底色亮度。
- `enableOledDarkMode` 只在有效深色主题下把 `--bew-bg`、`--bew-homepage-bg` 和必要的插件 viewport 底层设为 `#000`；卡片、面板、弹窗和输入框继续使用 content/elevated 层级。不得以覆盖 Bilibili `body`、滚动层或布局容器的方式实现纯黑。
- `--bew-on-theme-color` 必须按最终主题色的 sRGB 相对亮度在黑白前景间选择，并同步到 document 根节点和 `#bewly` Shadow Host；近白主题色上的实色按钮、选中项和图标不得退回硬编码白色。
- 背景图片功能已被产品级移除。上游同步不得重新引入壁纸设置、图片持久化、背景渲染组件或迁移/fallback。

### 圆角、表面与媒体轮廓

- 普通圆角矩形使用集中 token `--bew-corner-shape: superellipse(1.7)`，并保留原有语义 `border-radius` 作为不支持 `corner-shape` 时的回退；组件内不得各自写不同的 superellipse 数值。
- 真实圆形和完整胶囊必须使用 `corner-shape: var(--bew-corner-shape-round)`。头像、圆形图标按钮、关闭按钮、Switch 滑块保持正圆；主 Dock、Switch 轨道和明确胶囊保持完整 round，不得被全局平滑矩形规则覆盖。
- 设置页左侧 Dock 收起时是几何胶囊，展开时切换为 `--bew-modal-radius` 的平滑圆角矩形；表面统一使用 `--bew-elevated-alt`、`--bew-filter-glass-1` 和 `--bew-surface-border-color`，不得叠加更高模糊或更不透明的独立实现。
- 表面边框使用不透明语义 token `--bew-surface-border-color`；深色和 OLED 均为 `#4B4C4E`。不要用它替换普通分隔线的 `--bew-border-color`，也不要在媒体父子层重复绘制边框。
- 视频封面由最外层媒体容器负责唯一几何裁切；图片、视频预览、Skeleton、遮罩和底部渐变继承同一 radius 与 corner shape，Hover Preview 前后不得跳角、露底或出现双边框。

### 毛玻璃、设置页与共享组件

- 毛玻璃默认开启并继续服从全局模糊强度。`disableFrostedGlass` 是唯一关闭入口，开启后同时关闭毛玻璃和普通顶栏渐变；不要恢复 `enableFrostedGlass`、`enableTopBarGradient`、`alwaysUseTransparentTopBar` 等独立或正向旧状态。
- 设置页和 Dialog 的顶部渐变模糊统一由 `PanelTopBlur.vue` 承担。装饰层不绘制背景或边框、不承担内容裁切，遮罩必须在物理边界前衰减透明；清晰表面边框必须在模糊层上方单独绘制，不得以 `overflow: hidden`、实色背景或重复 backdrop-filter 破坏渐变或模糊顶部圆角/边框。
- 设置页从实际 Dock 设置按钮的 `DOMRect` 起源展开并保留 KeepAlive；只动画最外层面板的 opacity/transform，遮罩独立淡入淡出，不缩放顶部模糊层。
- 广告规则优先使用明确广告标记、广告反馈入口及推广 URL，正常推荐缺少“不感兴趣”菜单不能作为广告证据。首页/原版搜索复用现有列表 Observer 标记外层广告槽位，不删除 Vue 所有的 DOM，不对简介、标签和操作弹窗应用文本关键词过滤。
- 圆形操作使用 `IconButton.vue`，关闭浮层使用 `CloseButton.vue`，删除搜索历史或 Chip 使用 `TagRemoveButton.vue`；不得重新在页面组件中复制几何、前景继承和交互样式，也不得混淆三种语义。
- 左下新版本提示与内容脚本重载提示必须共用 `--bew-panel-radius` 和 `corner-shape: round`；不得将其中一个单独改回 superellipse。顶栏登录按钮使用实色主题背景与 `--bew-on-theme-color`，`CloseButton.vue` 的 surface 变体使用 elevated solid token，以保持深浅主题可读性。
- 内存节省相关设置集中在“通用 → 内存节省”，保留各自持久化 key 和独立行为；不得在旧页面重复入口或把网络、画质、动画等无关性能项混入。
- 播放页和消息页设置位于“Bewly 页面”的二级导航，分别由 `PlaybackPage/PlaybackPage.vue` 和 `MessagesPage/MessagesPage.vue` 作为独立叶子模块。实际页面设置出现前保持空内容，不新增存储字段、迁移、fallback 或重复入口。

### 设置与开发运行时

- 当前设置结构以 `src/logic/storage.ts` 的默认值为准；不恢复已移除功能。废弃字段只通过统一清理和同步拦截消退，不迁入新的功能状态。视觉设置搜索目录和四套 locale 必须与实际入口同步，`common.close` 等共享组件文案不得退回局部硬编码。
- 内容脚本、顶栏共享状态和设置存储统一通过 `src/utils/messaging.ts` 发送扩展消息；扩展重载造成的 context invalidated、消息端口关闭或接收端缺失应作为同一失效状态收敛。TopBar 刷新批次的叶子请求必须把 context invalidated 交给共享协调器统一停止轮询，不得局部打印后吞掉。
- Shadow DOM 的主样式未就绪前必须保持插件容器隐藏；样式加载失败时卸载并移除容器，绝不能把无样式的 Dock、Sidebar 或设置页暴露到 Bilibili 原版页面。
- 顶栏动态尾页必须先追加当前 `items` 再设置结束状态；稍后再看使用显式页码、aid 去重和完整集合刷新；History 补屏保持单一 async 请求链。不得退回通过数组长度推页、未等待递归或旧 index 删除。
- `src/utils/bilibiliUrl.ts` 是当前页与分享链接的统一净化来源，必须保留 `p`、`t`、hash 等导航/播放语义；不得为恢复 Bewly 全局快捷键而重建 `src/utils/keyboard.ts` / `src/utils/shortcuts.ts` 运行时。
- 液态分段指示器保持固定启用及现有 morph、ResizeObserver 和 reduced-motion 行为；不得恢复 `enableLiquidSegmentIndicator` 的可见设置项、搜索入口或静态视觉分支。
- `vite.config.content.ts` 的开发构建必须保持 `minify: false`，防止 Vite watch 增量更新后函数重命名与调用点错配；该约束仅用于 `pnpm dev`，不得借此改变生产构建策略。
- `pnpm dev` 只启动 prepare、content/inject 和 background 等真实扩展任务；已移除的 popup/options HTML 入口、`build:web` 和 `dev:web` 不得恢复为假构建流程。

## 通用工程原则

- 删除已被替代的实现和无消费者的兼容层；现存数据清理、有效原生 DOM 变体与网络失败降级须有实际用途和回归依据。
- 以当前可运行架构为起点，按实际职责模块化；不为假设需求增加配置、状态机或重复实现。
- 先复用项目组件与依赖，再评估成熟方案；新增依赖或重写须有当前需求依据。
- 改动交付时保持完整行为、资源清理与回归覆盖，不留下临时分支和“以后再换”的实现。
