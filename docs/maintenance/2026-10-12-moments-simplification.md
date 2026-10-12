# 动态页分组移除、直播预览与专栏推广识别

## 当前决定

- 移除想看分组、固定 UP 主的设置、搜索入口、管理组件、额外名单、动态筛选及专用持久缓存。原站经常访问列表与 UP 主动态筛选保留。旧字段仅在统一废弃字段表中保留，用于存储清理与同步拦截，不提供迁移回这些功能的路径。
- 左侧分类“全部”改为“全部动态”。
- 正在直播列表复用页面唯一的 `useMomentPreviews` 与 `MomentVideoPreview`，悬停立即读取并静音播放；键盘聚焦也可预览。读取 v2 `getRoomPlayInfo` 的 AVC 流，兼容只有 HLS/fMP4 的直播间。离开、离屏、页面隐藏、切换及卸载释放播放器，过时地址请求可以取消。沿用现有直播悬停预览设置。
- 直播行悬停／聚焦不改变底色。预览保留轻量折叠外壳，以共享 normal（200ms）时长从 `0fr` 向下展开至 `1fr`，离开反向收起，连续输入从当前高度接续。收起立即卸载播放器与骨架、设置 inert/aria-hidden；无常驻动画、定时器或尺寸观察器，减少动态效果时直接切换。亮／暗／OLED 组件预览确认底色不变，逐帧高度 0→145.23→0px，快速反向在 35.55px 连续接续；离开后播放器数立即为零。此项最新实站显示仍待开发扩展重载验收。
- 专栏、纯文字、图文和转发采用结构证据与文本组合分级：广告标记、商品附加卡片／富文本商品节点，以及下述明确的口令／导购组合，开启既有 `blockAds` 时过滤；证据不足的购买引导、商业合作声明仍只标记“疑似软广”。标签提供依据，使用不透明语义前景及共享胶囊圆角。

## 来源与范围

2026-10-12 核对：

- [Bilibili-Evolved 功能文档](https://github.com/the1812/Bilibili-Evolved/blob/master/doc/features/features.md)及[相关讨论](https://github.com/the1812/Bilibili-Evolved/discussions/4425)：商品带货过滤使用商品节点／类型证据。
- [富文本节点](https://github.com/bilibili-plugins/bilibili-api-collect/blob/master/docs/opus/rich_text_nodes.md)：`RICH_TEXT_NODE_TYPE_GOODS` 与商品链接结构。
- [直播流接口](https://github.com/bilibili-plugins/bilibili-api-collect/blob/master/docs/live/live_stream.md)：沿用现有直播地址读取与 FLV/HLS 播放管线。
- [Streamlink Bilibili 插件](https://github.com/streamlink/streamlink/blob/master/src/streamlink/plugins/bilibili.py)：交叉确认 v2 的 HLS、fMP4、AVC 选择与 `host + base_url + extra` 地址组合。
- [BilibiliSponsorBlock API](https://github.com/hanydd/BilibiliSponsorBlock/wiki/API)与[adskip](https://github.com/OtokoNoIzumi/adskip)：面向视频广告时间片段，不能直接充当专栏分类器。

检测只分析当前动态接口已返回的标题、摘要／正文和富文本结构，在映射阶段执行一次；不额外遍历文章、不发送到外部模型。没有商业证据或只有普通品牌／价格讨论时保持原样。文本规则不是语义模型，仍可能漏报或误标，不能声称识别全部软广。

## 纯文字推广漏判修复

截图及实站的三个样本没有命中旧版结构规则，旧文字规则也未覆盖口令变体。核对原文后补充 `美団嗖`、`陶丨宝`、`腹制整段`、`(://` 及中文搜索词写法，未硬编码作者、具体数字口令或文章 ID。

`momentPromotionText.ts` 将以下组合视为明确导购：

- 购物平台 + 促销信息 + 搜索／密令／数字或中文口令；
- 购物平台 + 购物兑换串 + 促销 + 复制或购买引导；
- 评论区置顶／蓝链／小黄车／橱窗 + 领券，或下单与具体优惠；
- 专属链接／优惠码 + 下单 + 返佣或粉丝折扣。

全角文本使用 NFKC，去除零宽字符；文本预算 32KiB、固定重叠窗口，不拼接远隔文章段落推断推广。反诈提醒和话术分析中的相关引用降为提示，普通品牌、售价、游戏兑换码不单独触发屏蔽。API 商品与广告证据保持优先。

额外参考：[公开脚本的促销写法样本](https://greasyfork.org/en/scripts/574002-%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%E6%97%A0%E6%84%9F%E5%B1%8F%E8%94%BD%E5%B9%BF%E5%91%8A%E5%8A%A8%E6%80%81/code)、[BilibiliSponsorBlock 的文本模式讨论](https://github.com/hanydd/BilibiliSponsorBlock/issues/255)、[中文口令公开示例](https://www.bilibili.com/video/BV1Ma1pBfEUH/)、[评论区置顶导购公开示例](https://www.bilibili.com/video/BV1Z94y1L7qa/)。只参考表达类别，没有引入这些方案的全页 DOM 扫描、单关键词即隐藏或视频分类流程。

## 验证

- 回归覆盖明确广告、商品节点、疑似推广、无广告声明、普通讨论、转发专栏、设置开关、退休字段清理、直播聚焦与离屏释放。
- 实际开发扩展已显示“全部动态”，动态设置与设置搜索不再出现想看分组／固定 UP 主；原有“不想看此 UP 主”视频菜单功能独立保留。
- 实站直播地址成功解码并播放（静音、`readyState=4`、960×720），离开后侧栏 video 节点移除。
- 本地推广标签使用合成正反例验证；没有把真实作者的普通内容当成广告来凑测试结果。
- 后续漏判修复：471 项 selected-p2 回归、lint、typecheck、diff 检查通过。三条实际文本覆盖旧 article、新 opus 和转发路径；增加中文口令、谐音、全角、零宽、购物兑换串、评论区导购、返佣及正常／反诈反例。
- 开发扩展重载后，在独立实站专栏标签验证：截图的三条和另一条京东红包口令帖已过滤，显卡调查、航天新闻、动画评论和游戏更新仍显示。未修改过滤设置，也未操作用户账号。截图 `/private/tmp/bewly-article-filter-verified.png`。页面另有原站 hydration 与其他用户脚本错误，不归入本扩展规则测试。

## 全部动态、共享材质与 Dock 收尾

- 识别模块和展示字段统一为 `momentPromotion`，徽标复用 `MomentPromotionBadge.vue`，旧专栏专用命名及入口已移除。WORD／DRAW／Opus 的正文和分段富文本复用相同规则，普通视频文案不自动扩展为文本广告依据，明确 API 广告／商品证据仍有效。
- 转发从外层到原帖独立分析，最多 8 层、合计 32KiB 文本，并检测循环引用。外层自身导购与内层广告均可识别；不拼接不同层的普通句子形成广告证据。转发者明确反诈或避雷时，引用的广告降为提示并保留。识别发生在数据映射阶段，不加入 DOM 扫描、请求、轮询或额外常驻缓存。
- `sidebarSurface.scss` 统一消息／动态／收藏／历史／稍后再看侧栏、消息骨架和热搜卡片的材质与实色回退；使用 `--bew-sidebar-background` / `--bew-sidebar-background-solid` 语义 token，维持已确认侧栏色调与模糊。各宿主仅保留自身布局、圆角和边界，不新增玻璃观察器或重复背景采样。
- 侧栏滚动区复用纵向滚动规则，明确 `overflow-x: hidden`，内容项可收缩且不超过容器宽度；消息会话、历史搜索和收藏目录的内部滚动区同样处理，纵向列表和键盘操作保留。
- Dock 页面模式切换器的 glyph 与 SVG 使用同一个语义尺寸，移除 1em 外盒与更大 SVG 之间的几何不一致；底部／侧向与宽屏尺寸沿用原 token，交叉淡入淡出不变。
- 验证：472 项回归、完整 lint/typecheck、diff 检查通过。640px 窗口的五页预览侧栏 `scrollWidth === clientWidth`；亮／暗／OLED 的热搜与侧栏背景及滤镜逐项相同，关闭磨砂共同回退实色。重载后实站 Dock 图标中心偏差由 3.5px 变为 0px，热搜与侧栏材质一致。截图 `/private/tmp/bewly-unified-sidebar-dock.png`。

## 首个直播间错误收起与徽标

- 2026-10-12 实际首个房间 `25620747` 仍为开播状态；旧 `Room/playUrl` 的 web/h5 均返回 `19001012`，v2 成功返回 HLS/fMP4（AVC/HEVC）。旧代码读取失败即清空悬停所有者，使预览动画反向收起。
- `livePreviewSources.ts` 提取 AVC 地址、按实际清晰度及格式排序并去重，只保留最多三条备用源。动态直播直接使用 v2，正常悬停仍只请求一次接口；播放失败按有限备用源切换，不轮询、不无限重试、不创建并行播放器。其他仍使用旧 API 的视频卡片调用不受此次修改影响。
- 直播失败与指针离开分开：失败释放媒体但保持悬停所有者，侧栏保留固定比例区域，显示“暂时无法预览”和显式重试。真实移开、隐藏、离屏、切换及卸载仍释放并收起；旧播放器错误不能影响替代播放器。
- 直播徽标移到行尾独立槽位：24px 外圆、16px 内图标，四边均为 4px 留白，不覆盖头像，不依赖图标字体的隐式 em 尺寸。
- 480 项回归覆盖 HLS-only 解析、畸形/受限响应、备用线路上限、失败保持展开、显式重试及旧错误隔离；类型检查与 lint 通过。实际房间的新 HLS 流在组件预览中已解码为 1280×720、readyState=2、paused=false、currentTime 约 6 秒；这不替代长时连续播放测试。自动重载后实站 DOM 仍将徽标放在头像内，说明旧产物仍在运行；最新扩展的实站最终验证待手动重载。
