# 字体规范落地

依据用户提供的 `2026-10-13-typography.md`，本轮覆盖既有冻结页面的文字与图标排版，保留用户明确加粗的图标及页面布局。附件中的历史测量数字不作为本轮测量结果。

## 当前规范与实现

| 角色 | 默认规格 | 字重 |
| --- | --- | --- |
| 时间、元信息、帮助文字 | caption 12/16 | 400 |
| 徽标、计数、时长 | caption 12/16 | 500 |
| 按钮、分段、菜单与链接操作 | control 13/18 | 500 |
| 正文与卡片作者 | body / 既有可配置字号 | 400 |
| 卡片标题、列表标题与姓名 | title 15/22 | 500 |
| 区块、弹窗和面板标题 | title 15/22 或既有紧凑标题槽位 | 600 |
| 页面主标题 | heading 20/28 | 600 |
| 侧栏滚筒与静态展示标题 | display 24/32 | 500 |
| 关键统计 | data 24–28 / 既有数字槽位 | 600 |
| 品牌字标 | 原规格 | 700 |

- `fonts.scss` 定义 `--bew-fonts-ui`，优先系统 SF/苹方，其后为本地 HarmonyOS Sans、MiSans、Segoe UI、微软雅黑 UI、Noto/思源；不使用仅注册 Regular 的原站别名字族作为 Bewly 默认字族，不增加字体下载。
- `:host` 与 `.bewly-wrapper` 禁用字重合成。默认模式只让原生页面保留原站字体；推荐/自定义仍走原有 `modify-fonts` 与 `--bew-custom-fonts` 覆盖，不修改用户的持久化字体值。四语言选项改为“默认”及对应翻译。
- 保留 `400/500/600/700` token 的含义，按组件角色调整使用处。`--bew-wheel-label-weight` 同时供滚筒和侧栏静态标题使用；分段与顶栏媒体行使用 500，退休单一消费者的 `--bew-control-brand-label-weight`。
- 内联 strong/b 使用 600；视频/专栏作者使用 400。状态切换不改变字重，日期选中项与未选中项一致。中文取消正负字距，仅 LIVE 全大写标记保留既有字距。
- 原生页保留全局 tnum；Bewly 恢复 normal font-feature-settings，时间、数字输入、统计、进度、计数等通过 font-variant-numeric 选择 tabular-nums，标题和正文不会被强制等宽化。
- Tabler 在 UnoCSS 实际 customize 管线中将默认 2px 改为 1.75px，运行时 Iconify SVG 只覆盖显式默认 2px 的 Tabler 节点；不覆盖自定义 SVG 或 2.5px 节点。Solar 改为 linear；原 Phosphor 粗体播放/暂停、Fluent 实心直播、Unicons 导入/导出改为可解析的线性图标。默认静态分区/设置图标改为线性，Dock、收藏等激活状态和认证状态保留实心含义。
- 收藏夹元信息、私信状态图标按 caption 使用 14px；普通搜索/操作图标匹配 control 的 16px。点击面积、侧栏宽度、卡片内距与动画不变。
- 搜索媒体卡标题回归 title 尺寸，`MediaHighlightSkeleton` 同步 22px 标题槽位；其他骨架继续读取与真实内容一致的已有字号/行高参数。
- 扫描中发现原有 `i-mingcute:folder-add-line` 在本地图标集不存在，改为 `i-tabler:folder-plus`。不改变创建分组的业务动作。

## 明确保留

- `ChevronIcon.vue` 的 2.5px 上下箭头、`sendButton.scss` 的发送箭头、Dock 收起符号与其粗细均不修改。
- 消息页、稍后再看及统一内容卡片的布局、圆角、间距、侧栏动画、动态展开与业务生命周期保持现状。
- 自定义字号、横/竖卡片排列、预览、原生页面字体选择与有效播放器节点保留。

## 验证与范围

- 真实 UnoCSS 生成检查验证 Tabler 1.75、Solar linear 和激活实心图标；本地 Iconify 图标名校验无缺失。
- 新增 `verify-typography.mjs`：实际 SCSS 与 reset 级联验证默认/推荐/自定义覆盖路径、原生与 Bewly 数字作用域、内联强调及显式描边排除；接入原有共享回归。
- 最终 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`git diff --check` 均退出 0；完整回归为 679 PASS、0 FAIL。
- 真实组件合成预览验证亮/暗/OLED、默认/推荐/自定义字体、长作者/两行标题、窄栏、大字号、真实骨架。浏览器计算值：标题 15/22、500；视频作者 400；统计 12/16、500 与 tabular-nums；滚筒 24/32、500。消息侧栏共享搜索高度仍为 36px，宽度规则保持前一轮值。
- UnoCSS 配置修改后，原开发 watcher 曾保留旧 2px 图标缓存。只重启本任务持有的 `pnpm dev`，重新核对实际产物中的 trash/trash-x 图标已为 1.75，UI 字体 token 与废弃 token 移除也已生效。
- 本机浏览器验证不等同于 Windows/Linux 字体实测。实站需要重载新扩展后确认；不将合成预览、CSS 字族声明或附件中的墨量数据当作跨平台实测，也不宣称帧率或内存收益。
