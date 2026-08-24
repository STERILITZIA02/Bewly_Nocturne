# BewlyMac 品牌迁移与上游同步设计

## 目标

将当前定制分支建立为名为 **BewlyMac** 的个人定制项目，同时保留从 BewlyCat 上游获取更新的能力。品牌迁移只覆盖项目元数据和用户可见内容，不改动会影响既有用户数据或扩大上游合并冲突的内部兼容标识。

## 仓库关系

- GitHub 仓库从 `STERILITZIA02/BewlyCat` 重命名为 `STERILITZIA02/BewlyMac`。
- 本地 `fork` remote 指向 `STERILITZIA02/BewlyMac`，用于推送个人定制版本。
- 本地 `origin` remote 继续指向 `keleus/BewlyCat`，作为只获取更新的上游来源。
- 更新上游时使用正常的 merge 流程。无冲突的上游改动正常接收；涉及 BewlyMac 定制行为的冲突逐项审查，并优先保留明确的本地定制。
- 不配置全局 `ours` merge driver 或整文件自动忽略规则，避免静默遗漏安全修复和必要的上游变更。

## 改名范围

### 修改

- `package.json`：包名改为 `bewly-mac`，显示名改为 `BewlyMac`，主页改为新仓库地址。
- 扩展 manifest：继续从 `package.json` 生成，因此生产版和开发版分别显示 `BewlyMac` 与 `BewlyMac Dev`。
- 用户可见文案：设置页、About 页面、版本提示和其他直接展示给用户的品牌名称改为 `BewlyMac`。
- 指向本项目的仓库、Issue、Release 或源码链接改为 `STERILITZIA02/BewlyMac`；明确表示上游来源的链接保持不变。
- `README.md`：重写为最小说明文档。

### 保留

- 本地存储键、云同步协议键、事件名、DOM 标识、CSS 类名和脚本内部命名中的 `BewlyCat`。
- 浏览器存储结构和已有设置迁移路径。
- 现有图标资源和功能实现。
- Git 历史和原贡献者信息。

这些兼容标识不是用户可见品牌，保留它们可避免设置丢失、同步不兼容以及无意义的上游冲突。

## README 结构

README 只保留以下内容：

1. `BewlyMac` 标题和一句项目用途说明。
2. 项目来源：说明 BewlyMac 基于 BewlyCat，且 BewlyCat 基于 BewlyBewly，并链接到两个上游项目。
3. 项目定位：个人定制浏览器扩展，继续选择性合并 BewlyCat 上游更新。
4. 最小本地构建说明：安装依赖、Chrome 开发构建和生产打包命令。
5. 许可说明：项目保留当前 `LICENSE` 中基于 MIT 的条款及额外的客户端封装限制；分发副本必须保留适用的版权与许可文本。

删除版本徽章、商店链接、下载和用户统计、时效性公告、完整功能列表、截图、Star History 及其他宣传性内容。

## 许可与署名

- 不修改当前 `LICENSE` 的实质条款，也不删除“禁止封装、转换或发布为客户端”的额外限制。
- README 不将该许可简称为“纯 MIT”；统一称为“基于 MIT 并附加使用限制的自定义许可”。
- 保留 Hakadao 和 Keleus 的现有版权与来源说明。
- BewlyMac 的新增改动通过 Git 历史保留作者信息；本次不擅自新增未经确认的法定版权主体。

## 验证

- 检查所有用户可见品牌文案，确认不再误显示 `BewlyCat`。
- 检查保留的旧名称只存在于兼容标识、上游署名或历史说明中。
- 运行 `pnpm lint`、`pnpm typecheck` 和 Chrome 生产构建。
- 检查生成的 `extension/manifest.json` 显示 `BewlyMac`，并验证 `extension.zip` 完整可解压。
- 检查 Git diff，确保没有修改存储协议、扩展 ID、功能逻辑或无关代码。

## 非目标

- 不重写内部命名体系。
- 不改变插件行为、设置结构或浏览器权限。
- 不脱离 GitHub fork network，也不自动屏蔽上游文件。
- 不打包或发布为桌面、移动或其他独立客户端。
