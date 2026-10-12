# Bewly Nocturne

基于 [BewlyCat](https://github.com/keleus/BewlyCat) 定制的 Bilibili Manifest V3 浏览器扩展。技术栈为 Vue 3、TypeScript、Vite、UnoCSS、Pinia 和 SCSS；版本与包管理器以 [package.json](package.json) 为准。

## 当前功能

- **页面与导航**：全 Bewly、全原版、自定义三种页面模式。Dock 支持底部或右侧及三种收起方式；独立小电视返回首页，分区入口位于首页标签栏右侧。
- **搜索与推荐**：首页整合搜索，搜索框原位粘附顶栏；保留推荐模式、关注投稿、热门、排行榜、订阅和直播等入口。
- **消息中心**：回复、提及、赞和系统通知使用原生 Vue 信息流；私信支持会话管理、文本和图片发送、用户与跨会话历史搜索。未选择会话时显示 Insights，消息设置位于全局设置内。
- **资料库与动态**：收藏、稍后再看、观看历史和动态共用持久侧栏设计；稍后再看与历史支持高级筛选、排序、批量管理和局部刷新，动态右侧显示共享热搜。
- **播放页**：在保留 Bilibili 原生播放器及操作节点的基础上提供 Bewly 布局、侧栏、评论和媒体预览。
- **外观**：亮色、深色和 OLED，统一的圆角、排版、主题色对比、毛玻璃及独立小表面的液态材质。
- **状态管理**：账号隔离、分页与请求取消、跨标签稍后再看成员同步、设置同步及扩展重载恢复。

消息页与稍后再看页的已确认设计保持冻结。背景图片、自定义 CSS、重复顶栏切换入口和全局快捷键框架已移除。

## 开发与检查

使用 `package.json` 指定的 pnpm 版本：

```sh
pnpm install
pnpm dev
```

在 Chrome/Edge 扩展管理页加载 `extension/`。重新加载扩展后刷新 Bilibili 页面，使页面接入新的内容脚本。开发期间沿用现有 watcher，不重复启动；验证不执行生产构建。

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm knip
```

发布时才使用 `pnpm build` 和 `pnpm pack:zip`，输出 `extension/` 与 `extension.zip`。Safari 使用 `pnpm build-safari`，输出 `extension-safari/`。

## 维护

- [贡献指南](docs/CONTRIBUTING-cmn_CN.md)
- [当前维护索引与历史记录](docs/maintenance/README.md)
- [远端、分支和上游协作](docs/maintenance/upstream-workflow.md)
- [项目开发约定](AGENTS.md)

上游源自 BewlyCat / BewlyBewly，保留其历史和贡献者信息。选择性接收上游更新，并逐项保护 Nocturne 定制。本仓库接收外观与交互问题；通用上游问题请提供可在 BewlyCat 复现的证据。

## 许可

使用[基于 MIT 并附加使用限制的许可](LICENSE)。不得将项目封装、转换或发布为独立客户端；复制、修改或分发时保留版权声明与许可文本。
