# 维护索引

当前行为以源码、设置默认值和本次验证结果为准。旧计划及逐轮操作记录不再作为当前任务的执行指令。

## 当前文档

- [开发约定](../../AGENTS.md)：设计 token、冻结页面、状态与生命周期规则。
- [上游协作](upstream-workflow.md)：远端、分支和来源检查。
- [播放页结构](widescreen-native-adaptation.md)：原生节点归属与模块职责。
- [消息页回归](../notifications/native-message-regression.md)：当前功能与验证范围。
- [System 协议证据](../notifications/system-protocol-investigation.md)：已采样的协议与 fixture。
- [失效私信卡片](2026-10-10-whisper-expired-cards.md)与[会话管理协议](2026-10-11-private-session-actions.md)：当前未提交改动的实现记录。
- [收藏夹管理与切换加载](2026-10-12-favorite-folder-management.md)：原站协议、编辑与上传生命周期、排序、清理及切换审查。
- [动态页精简与推广识别](2026-10-12-moments-simplification.md)：分组移除、直播预览、文字／图文／转发推广识别及侧栏材质复用。
- [交互动效复查](2026-10-12-interaction-motion-audit.md)：弹窗材质跳变修复、现有等价实现、低开销优化顺序与验证范围。
- [三批动效引入](2026-10-12-interaction-motion-implementation.md)：就绪交接、局部布局与刷新连续性、骨架可见性和无尺寸监听的光学层。
- [资料库内存优化](2026-10-12-library-memory.md)：隐藏原站资源、同步 iframe、虚拟窗口、折叠内容与首屏分页边界。

## 历史原文

以下记录已从工作目录收敛到本索引，原文固定保存在 Git 提交 `98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad`。记录中的旧分支、开发构建号、页面截图和当时测试结论只属于对应日期。

无需联网也可读取原文：

```sh
git show 98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad:docs/maintenance/2026-09-16-upstream-experience-adaptation.md
```

| 历史主题 | 固定版本 |
| --- | --- |
| 2026-09-04 功能与交互审查 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-04-feature-audit.md) |
| A01–A24 实施与验证记录 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-05-a01-a24-implementation.md) |
| Bewly Nocturne 0.1.1 项目质量审核 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-05-project-quality-audit.md) |
| Bewly Nocturne 结构重构记录 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-05-structural-refactor.md) |
| Dock 液态玻璃 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-06-dock-liquid-glass.md) |
| 玻璃层级与实色状态 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-06-surface-materials.md) |
| 播放页排版与共享液态玻璃 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-07-floating-liquid-glass.md) |
| 底部液态玻璃与大型表面性能修正 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-07-glass-performance-correction.md) |
| 加载骨架与播放栏初始化 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-07-loading-skeletons.md) |
| 播放侧栏内容与原生操作恢复 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-07-playback-content-recovery.md) |
| 首页搜索与播放页标签修正 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-08-home-and-native-tags.md) |
| 原生组件挂载与广告规则 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-08-native-actions-and-advertising.md) |
| 播放页侧栏布局调整 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-08-playback-sidebar-layout.md) |
| 上游功能语义适配 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-08-upstream-functional-adaptation.md) |
| 2026-09-08 私信交互与输入栏 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-08-whisper-interactions.md) |
| 2026-09-16 上游体验与生命周期适配 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/2026-09-16-upstream-experience-adaptation.md) |
| BewlyMac Brand Fork Implementation Plan | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/plans/2026-08-04-bewlymac-brand-fork.md) |
| BewlyMac Dual-Repository Upstream Workflow Implementation Plan | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/plans/2026-08-05-dual-repository-upstream-workflow.md) |
| Dock Collapse Orb Implementation Plan | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/plans/2026-08-09-dock-collapse-orb.md) |
| Settings Page Shells and Surface Alignment Implementation Plan | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/plans/2026-08-09-settings-page-shells-and-surface-alignment.md) |
| Stage 2 P0–P2 Deterministic Fixes Implementation Plan | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/plans/2026-08-09-stage-2-p0-p2-deterministic-fixes.md) |
| Search Focus, Sticky Search, and Notifications Skeleton Plan | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/plans/2026-08-10-search-focus-sticky-notifications.md) |
| Notifications Runtime Reliability Implementation Plan | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/plans/2026-08-14-notifications-runtime-reliability.md) |
| BewlyMac 品牌迁移与上游同步设计 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/specs/2026-08-04-bewlymac-brand-fork-design.md) |
| BewlyMac 双仓库上游协作设计 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/specs/2026-08-05-dual-repository-upstream-workflow-design.md) |
| Dock 收起圆球交互设计 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/specs/2026-08-09-dock-collapse-orb-design.md) |
| 设置页框架与表面统一设计 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/specs/2026-08-09-settings-page-shells-and-surface-alignment-design.md) |
| 搜索聚焦、单搜索栏吸附与消息页骨架设计 | [原文](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/superpowers/specs/2026-08-10-search-focus-sticky-notifications-design.md) |

旧播放页[迁移设计](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/widescreen-native-adaptation.md)、[模块抽样](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/maintenance/widescreen-module-audit.md)和[早期消息页回归清单](https://github.com/STERILITZIA02/Bewly_Nocturne/blob/98fcf7c4f86aabfa4fef8a7f9da30c3a078d89ad/docs/notifications/read-only-initial-build-regression.md)也保留在同一固定版本。

当前没有重新执行的实站操作不从历史记录推断为通过。新增维护记录只记录决定、代码落点、验证和未解决事项，不追加重复的操作流水。
