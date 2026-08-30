# Bewly Widescreen 原视频页模块可访问性审查

审查日期：2026-08-30

## 方法与结论范围

本审查同时检查：

- `utils/bewlyWidescreen.ts` 的 selector、DOM 搬移、样式和恢复逻辑；
- 视频页适配样式中出现的模块，包括弹窗、AI、笔记、章节、音乐和特殊信息；
- 当前 Chrome 中一个普通 UGC 视频页的实际 DOM 归属与可见结构。

条件模块会受账号、视频类型、地区、灰度版本和服务端实验影响。表中的“支持”表示当前代码具有明确、可恢复的接入路径；不是对未知未来 DOM 的承诺。

## 支持矩阵

| 原视频页模块 | 当前状态 | 宽屏路径 / 限制 |
| --- | --- | --- |
| 播放器画面与控制栏 | 支持 | 整个原播放器节点搬入 player slot，播放、进度、清晰度、倍速、字幕、音量、设置、画中画和全屏控制继续使用原监听器。 |
| 弹幕发送栏与在线观看人数 | 支持 | 原发送栏搬入播放器下方 danmaku dock。 |
| 视频标题 | 部分支持 | 宽屏复制标题文字；原 `video-info-title` 模块及其附加徽标/链接没有整体搬入。 |
| 播放量、弹幕数、发布时间 | 未接入 | 原 `video-info-meta/detail` 仍留在被宽屏覆盖的页面中。 |
| 转载/版权声明 | 未接入 | 与原视频 meta 区同属未搬移模块。 |
| UP 主与联合创作成员 | 支持 | `up-panel-container / up-info / upinfo` 整体搬入顶部信息区。 |
| 点赞、投币、收藏、分享入口 | 支持 | 原 `arc_toolbar_report / video-toolbar-container` 搬入顶部操作区。 |
| 三连动画与操作状态 | 支持 | 原节点与状态保留，并有宽屏内动画几何校正。 |
| 稍后再看 | 支持 | 复用现有独立按钮和 `topBarStore` 权威成员状态。 |
| 工具栏右侧其他入口 | 未完整接入 | 当前宽屏样式只保留稍后再看；笔记等其他 right-side action 会被隐藏。 |
| 简介与字幕制作信息 | 支持 | 原简介节点搬入，支持两行折叠和展开；简介内字幕制作列表继续保留。 |
| 标签 | 支持 | 原标签容器整体搬入。 |
| 评论 | 支持但依赖 hydration | 现代 Shadow DOM 或 legacy 评论根在形成有效内容后搬入；本轮增加有界补填以避免空壳、假未登录和头像/列表缺失。需要重新加载最终开发扩展后做一次登录态实测。 |
| 弹幕列表 | 支持 | 原 danmaku box 搬入独立 Tab。 |
| 分 P、合集、UGC Season、番剧选集 | 条件支持 | 已覆盖 `video-pod / multi-page / video-sections / eplist` 等当前结构；新灰度结构若不匹配 selector 会停留在 loading。 |
| 推荐视频 | 支持 | 当前 `recommend-list / rec-list / recommend_wrap` 结构搬入选集/推荐 Tab。 |
| 播放器内章节/观点菜单 | 支持 | 属于被整体搬移的播放器内部。 |
| 播放器外 AI 章节/AI 总结助手 | 未接入 | `_VideoAssistant / video-ai-assistant / _SeekSections` 没有 Widescreen content adapter 分区。 |
| 笔记列表、笔记编辑器 | 未接入 | 页面级 `note-list / note-pc / note-detail` 未搬入，且其工具栏入口可能属于被隐藏的右侧操作。 |
| 音乐信息模块 | 未接入 | `#musicApp` 没有迁移路径。 |
| 荣誉、争议、警告和特殊稿件状态 | 未接入 | `video-honor / video-argue / video-owner-state` 没有统一迁移；其中嵌在 UP 面板内的个别状态可能随父节点出现，但不构成契约。 |
| 投币、收藏、分享、举报等 body 弹窗 | 条件支持 | 入口保留，弹窗继续由 Bilibili 挂到宽屏根外。主宽屏根必须保持普通 overlay 层级，加载遮罩单独置顶，才能让这些弹窗显示在宽屏之上。 |
| 广告、活动横幅和商业推广 | 有意排除 | 不属于目标接入范围。 |

## 实时页面观察

当前浏览器中的普通 UGC 视频显示：播放器、弹幕发送栏、UP/联合创作信息、主互动工具栏、简介、标签、选集和推荐已进入 Widescreen；原视频 meta 与版权声明仍在宽屏根外。浏览器当前加载的是重新编译前的扩展实例，评论 Tab 仍显示 loading，因此只能作为旧问题证据，不能替代最终构建重载后的验收。

## 最终结论

Bewly Widescreen **不能宣称原视频播放页除广告/活动外的所有模块均可访问**。它目前覆盖普通观看所需的核心播放、UP、互动、简介、标签、弹幕、评论、选集和推荐主链；但 meta/版权、AI、笔记、音乐、荣誉/争议信息和部分工具栏右侧功能仍缺少正式接入。

后续补齐应按 `widescreen-native-adaptation.md` 的 Content Adapter 分区推进。每增加一个模块，必须同时定义 readiness、loading/error/empty、账号与导航 identity、恢复/清理和四套语言行为；不得继续把新 selector 无边界地堆入主控制器。
