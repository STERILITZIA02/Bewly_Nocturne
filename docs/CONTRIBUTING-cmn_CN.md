# 贡献指南

[English](CONTRIBUTING.md) · [繁體中文](CONTRIBUTING-cmn_TW.md)

## 开发

使用 `package.json` 指定的 pnpm 版本：

```sh
pnpm install
pnpm dev
```

在 Chrome/Edge 扩展管理页启用开发者模式，加载 `extension/`。代码更新后重新加载扩展并刷新 Bilibili 页面。已有开发 watcher 时直接复用；不要重复启动或停止其他任务的进程。

也可用 `pnpm start:chromium` 启动独立开发窗口。浏览器配置目录为 `chromium-web-ext-profile/`，属于本地用户数据，不参与项目清理。

## 验证与发布

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm knip
```

开发验证不运行生产构建。发布时运行 `pnpm build`，再用 `pnpm pack:zip` 生成 `extension.zip`；Safari 使用 `pnpm build-safari`。

源码或组件检查与重载后的浏览器验收分别记录。涉及服务端写入时，以真实响应和状态回读判断结果。

## 分支与提交

遵循[上游协作流程](maintenance/upstream-workflow.md)和[项目约定](../AGENTS.md)。先核对任务指定的分支；不要直接在 main 开发，也不要将 Nocturne 定制提交到上游修复分支。

提交格式为 `type(scope): 中文说明`，类型使用 Conventional Commits。提交前 lint 与 typecheck 必须通过，PR 不加入构建产物、tests 文件或无关改动。

## 翻译

维护 `src/_locales/` 的四种语言，保持键和实际设置入口一致。删除功能时一并删除对应文案；避免翻译工具重排无关内容。
