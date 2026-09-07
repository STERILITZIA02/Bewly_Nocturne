# 玻璃层级与实色状态

开始本轮前，按用户要求提交全部既有修改为 `b5450eaa`，并推送至 `origin/message_feature`。该提交前完整 lint/typecheck 均退出 0，提交后工作区干净。原 stash `7a6ef9155ccd8e5ce92768702da03b5ae8d7184b` 保留。

## 设计规范

根目录 `AGENTS.md` 是当前规范：玻璃上的内部覆盖层使用实色或无滤镜表面，只有伸出原组件边界的覆盖层才允许独立玻璃；Teleport 不代表满足例外条件。灰黑白可以半透明，但不能据此重复添加模糊。

用户随后明确保留顶部模糊。`PanelTopBlur.vue`、Dialog 调用方式、TopBarHeader 渐进模糊和会话顶部/底部滚动边缘恢复并保持原实现，不纳入本轮收敛。液态分段指示器是几何动画，继续保留。

## 实现

- 分段控件的 surface 统一实色，移除失效的 `--solid` 切换分支及首页额外 backdrop。选中项使用实色主题背景和自适应黑白前景，保留同字重、液态移动和焦点反馈；中性细描边保证近白/近黑主题仍能区分选中区域。
- `.bew-popover-surface` 默认实色，覆盖 Select、ContextMenu、设置搜索、日期/选集菜单和表情面板。固定且伸出顶栏的 `.bew-popover.bew-popover-surface` 保留独立玻璃，内部控件继续实色。
- 搜索框、TopBar 投稿按钮、布局编辑操作面板、Toast、私信浮动输入区和加载骨架移除额外背景采样；主 Dock 的毛玻璃/液态玻璃及其参数、独立操作按钮、顶部模糊保留。
- `--bew-theme-surface` / `--bew-theme-surface-hover` 使用主题色与实色基底混合，不含透明端点；配对 `--bew-on-theme-surface` 中性实色文字。初次实测青色文字在深色柔和底色上只有约 3.8:1，已修正为配对中性前景。
- 同步首页、动态、收藏、搜索、历史、稍后再看、消息、设置、共享卡片及原生适配中相应的主题色背景、文字、边框和焦点标记。主按钮使用 `--bew-on-theme-color`，玻璃内实色控件按需要保留或去除装饰边框。
- 品牌发光、既有页面装饰渐变及玻璃材质本身的色调保留，不作为文本/按钮/选项的半透明状态色。没有新增设置、存储字段、观察器或计时器。

## 实际验证与边界

- 实际共享组件的 Chromium + Shadow DOM 桌面测试覆盖 5 个主题色（青、粉、近白、近黑、黄）× 明暗主题；深色使用 OLED 黑底。主操作前景样本对比度为 7.97–20.82:1，柔和标签及 Hover 为 6.46–17.78:1。这是指定样本的实测，不代表所有原生页面均已做对比度验收。
- 场景中的内部菜单和分段控件最终 `backdrop-filter: none`，实色背景无 alpha。四个保留的 backdrop 节点是两个外层面板与两个用户要求保留的顶部模糊层。点击、Tab/Space 切换和近白主题焦点反馈已检查。没有测量或声称 FPS、长任务、内存的量化收益。
- 自动回归调用实际 SettingsSegmentedControl、LiquidSegmentIndicator、PanelTopBlur 及编译后的共享 SCSS，保留选择行为和观察器清理断言。JSDOM 不计算 backdrop-filter，CSSOM 声明检查由上述浏览器实测补充。
- 旧播放页骨架“必须使用玻璃”的样式断言改为“实色且无 backdrop”，原有 DOM、Loading、布局、动画/reduced-motion 断言保留。
- 设置二级导航的旧半透明底色断言更新为新的主题实色/黑白前景配对，路由、设置入口、账号、消息和布局断言均保留。
- Bilibili 重载开发扩展后的全页检查尚未完成；已请求用户手动重载。尚需实页检查设置搜索/Select 菜单、各类页面模式、私信 Composer、原生适配和 Safari。未做移动端浏览器分辨率检查。

最终完整 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm knip` 均退出 0，`git diff --check` 退出 0。knip 保留原有 52 个 export、6 个 type、4 个 enum member 警告。现有 `pnpm dev` watcher 已完成最新 content/inject/background 编译，未执行生产 build。Git 差异确认 `PanelTopBlur.vue`、`Dialog.vue`、`TopBarHeader.vue` 与 `b5450eaa` 完全一致。

本轮视觉修改留在当前工作区，未再次提交或推送。
