# 2026-10-22 工具链与安全升级

## 运行时与安装

项目使用 Node 26.12.1、pnpm 12.14.0。`.node-version` 供版本管理器与 CI 读取，`package.json` 的 `devEngines.runtime` 让 pnpm 下载并使用相同 Node；不替换机器上其他项目使用的全局 Node。

使用 `pnpm install --frozen-lockfile` 安装，`pnpm exec node --version` 检查项目运行时。旧 pnpm 11.17 自动安装 pnpm 12 时存在无 shebang 启动器问题；本次已运行下载包自带的安装器完成本机项目管理器修复。新环境直接安装 pnpm 12.14.0。

Vite 8 使用 Rolldown。配置改用 `rolldownOptions`、完整 TS 导入扩展名与 JSON import attributes；开发内容脚本继续关闭压缩。TypeScript 7.0.2 的原生编译器不提供现有 `vue-tsc` 与测试转译器需要的 JS API，且 typescript-eslint 明确不支持，因此采用兼容的最新 6.0.3。没有关闭类型检查。

## 安全与依赖范围

2026-10-21 的 PHP 公告涉及 PHP Web 运行时，本项目没有 PHP 服务。Node/npm 升级处理的是本仓库自己的依赖风险，不能替代外部服务器的 PHP 修复。

- `npm-run-all` 替换为维护中的 `npm-run-all2`。
- `crx` 替换为 CRX3 格式打包器 `crx3`；签名密钥保存在 `extension.pem`，不得提交。
- 删除只为上传命令引入的 WXT，直接使用它内部的 `publish-browser-extension`；`pnpm submit:chrome` 仍使用 `--chrome-zip`。运行上传命令仍需用户授权。
- 删除 `web-ext`，消除它的 Android ADB → `node-forge` 未修复漏洞链及 Firefox linter 的弃用依赖。`pnpm start:chromium` 通过 Node 直接启动独立开发配置；可用 `CHROMIUM_BINARY` 指定 Chromium/Chrome for Testing 路径。普通 Chrome 用扩展管理页重载。构建监听仍由 `pnpm dev` 负责。
- 移除过时的 `release-it-pnpm` 插件，使用 release-it 原生的 `npm.publish: false`，版本更新后用 pnpm 更新锁文件。
- 对仍限制旧版本的间接依赖 `basic-ftp`、`katex`、`tinypool` 施加修复版本下限；不忽略安全公告。
- qrcode.vue 的额外 Agent skill 权限明确拒绝，不影响二维码库功能。

## 上游补丁

补丁由 pnpm 的 `patchedDependencies` 和锁文件管理，本地和 CI 安装一致。

1. `@vue/language-core@3.3.13`：生成类型检查代码时，以正则把 `//` 转为块注释会破坏模板中的 `https://` 字符串，并丢失循环变量作用域、条件收窄。保留原始属性代码和换行，修复类型检查代码，不改业务模板或关闭诊断。后续升级需用 `pnpm typecheck` 验证后移除补丁。
2. `@asamuzakjp/dom-selector@10.0.4`：Element 查询错误限制参与匹配的祖先必须位于查询容器内。无显式 `:scope` 时在所在树匹配，再仅返回容器内后代，符合 DOM 查询语义。只影响 JSDOM 回归环境，不进入扩展产物。漫画筛选键盘/焦点测试覆盖此问题；后续升级需要保持测试通过再移除。

## CI 修复

任务 `39595032368 / 119205114845` 原先在 Knip 失败：遗漏样式回归脚本入口及未使用导出。登记真实入口、删除无调用导出，API 响应模型的合法枚举值用 `@public` 标明；这些值来自服务端，不应因 UI 没有独立分支而从协议模型删除。已退役、此前为保留工作而留在源码中的 wiki 样式移到 `archive/nativeWikiCommunity.scss.txt`。

GitHub Actions 升级到当前正式版本，Node 与本地共用 `.node-version`，使用冻结锁文件，增加依赖安全审计；Lint 不允许 warning，Knip 的类型、导出和枚举检查均按 error 执行。

测试夹具显式指定 CommonJS 的 interop 行为以保留原有模块替身约定，并为新增 VueUse scheduler、显式模板 ref 赋值及 JSDOM CSS 计算行为调整验证边界。预期故障日志应在对应测试中捕获并断言，不屏蔽产品中的失败报告。

## 本次验证

`pnpm install --frozen-lockfile`、`pnpm lint`（零 warning）、`pnpm typecheck`、`pnpm knip`、`pnpm test`、`pnpm build` 均通过，最终日志无告警。`pnpm audit --audit-level low` 报告无已知漏洞。测试日志含 727 条 PASS，另有颜色采样与源码策略检查。Sass 最终更新至 1.106.0。

ZIP 验证包含根目录 manifest；使用临时密钥生成的 CRX 验证为 CRX3。开发监听已重启并完成所有入口首轮编译，产物中卡片字号、封面比例和评论连续加载修复仍在。没有实际上传扩展、提交或推送；远程 CI 需在提交后重新运行，浏览器目测由用户完成。
