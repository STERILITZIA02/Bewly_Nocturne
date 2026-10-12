# Bewly 播放页：当前结构

本文描述源码职责，不代表新一次浏览器验收。早期迁移计划及 2026-08-30 模块抽样已归入[历史索引](README.md)。

## 模块

| 模块 | 职责 |
| --- | --- |
| `src/contentScripts/index.ts` | 按设置进入播放页，协调导航与退出 |
| `src/utils/bewlyWidescreen.ts` | 当前实例、准备与提交、资源清理 |
| `src/utils/bewlyWidescreenPolicy.ts` | 不依赖 DOM 的就绪和交互策略 |
| `src/utils/bewlyWidescreen/shell.ts`、`geometry.ts`、`styles/` | 外壳、测量和视觉布局 |
| `src/utils/bewlyWidescreen/sidebar.ts`、`nativeDom.ts` | 原生侧栏内容、占位与恢复 |
| `src/utils/videoMetadataBridge.ts` | MAIN world 原生组件存活与元数据桥 |
| `src/utils/bewlyWidescreen/danmaku.ts`、`playlist.ts` | 原生弹幕与选集接入 |
| `src/utils/bewlyWidescreenNative.ts` | 原生页面内容适配 |

## 当前契约

- 原生播放器留在其所属组件树内，按 Bewly player frame 测量定位，不重建第二个播放器。
- 作者、工具栏、简介、标签、评论和选集优先保留原节点与事件。需要移动的节点使用占位恢复；原生组件存活由既有桥确认，不能仅凭 DOM 存在或 API 统计判定就绪。
- 侧栏分区分别处理 readiness，迟到或替换的原生根节点由现有观察器接管；缺少必需工具栏时显示既有恢复入口。
- 侧栏本体绘制单一毛玻璃，阅读区域使用实色表面；不再用负层级伪元素承载整栏模糊。宽度、拖动与持久化使用共享几何策略。
- 底部控制栏复用统一材质设置，原生弹幕发送控件保留权限、校验和事件。液态外壳不通过整体 opacity 创建新的背景采样边界。
- 退出、导航和卸载释放本实例的观察器、定时器、动画帧及监听器，并恢复仍存活的原生节点。

## 回归

运行 `pnpm test` 中的播放器生命周期、原生节点、弹幕和布局回归；浏览器检查分别记录 UGC、PGC、换集、全屏、退出、主题与窗口尺寸。条件模块以当前匹配的原生结构和实际验收结果为准，不沿用旧抽样表声称已覆盖全部 Bilibili 模块。
