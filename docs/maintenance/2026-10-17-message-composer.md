# 消息页输入栏统一

用户要求私信底部输入栏沿用动态评论框的类 Codex 风格。输入栏改为 32px 大圆角磨砂卡片，正文使用 15/24 文字，上方透明输入区，底部左侧表情 / 图片按钮、右侧圆形上箭头。多行时仅输入区增高，发送按钮仍为圆形；取消内部实色底板与单行胶囊切换。

`src/styles/composer.scss` 提供外壳和输入区两个 mixin，由动态回复和私信共用。圆角使用 `--bew-composer-radius`，颜色、滤镜、阴影、焦点和实色降级均来自现有全局 token。私信外壳移除液态折射挂载，保留单层普通磨砂；工具和表情选择器不添加内部模糊。

`ConversationView` 仍持有原来的 footer 和 `composerRef`，由现有 `useConversationViewport` 测量实际高度、预留消息空间并避让 Dock。会话切换、入场结束再请求历史、搜索导航、左右边距与回到底部位置均沿用原有逻辑。没有新增发送 / 上传请求或权限状态。

原有文本、图片、表情、Enter / Shift+Enter、IME、发送中、只读及会话切换清理保持不变。删除只用于胶囊变形的 textarea ResizeObserver；外层高度观察继续负责真实占位，不新增第二套观察器。

验证：TypeScript 与修改文件 ESLint 通过；9 项 Whisper 回归覆盖真实 Composer、会话复用、输入法、表情、图片校验、权限禁用与发送去重。4346 本地预览使用真实 Composer、IconButton、Tooltip、表情选择器及共享表面，发送仅为本地模拟。已检查默认 118px 外框、32px 圆角、透明输入区、36px 圆形发送按钮；三行输入时外框增至 150px，按钮仍为 36px，内部 backdrop-filter 数量为零。实站检查需扩展重载后单独确认。
