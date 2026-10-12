# 貢獻指南

[English](CONTRIBUTING.md) · [简体中文](CONTRIBUTING-cmn_CN.md)

## 開發

使用 `package.json` 指定的 pnpm 版本：

```sh
pnpm install
pnpm dev
```

在 Chrome/Edge 擴充功能管理頁啟用開發人員模式，載入 `extension/`。程式更新後重新載入擴充功能並重新整理 Bilibili 頁面。已有開發 watcher 時直接沿用，不重複啟動或停止其他任務的程序。

也可使用 `pnpm start:chromium` 開啟獨立開發視窗。`chromium-web-ext-profile/` 含有本機瀏覽器資料，不屬於專案清理範圍。

## 驗證與發布

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm knip
```

開發驗證不執行正式建置。發布時使用 `pnpm build` 及 `pnpm pack:zip`；Safari 使用 `pnpm build-safari`。

原始碼或元件檢查與重新載入後的瀏覽器驗收分別記錄。伺服器寫入以實際回應和狀態回讀確認。

## 分支與提交

遵循[上游協作流程](maintenance/upstream-workflow.md)和[專案約定](../AGENTS.md)。先核對任務指定的分支；不直接在 main 開發，也不將 Nocturne 定製混入上游修正分支。

提交使用 Conventional Commits，格式為 `type(scope): 中文說明`。提交前 lint 與 typecheck 必須通過，PR 不加入建置產物、tests 檔案或無關變更。

## 翻譯

維護 `src/_locales/` 的四種語言，使鍵名與實際設定入口一致。移除功能時同步刪除文案，避免翻譯工具重排無關內容。
