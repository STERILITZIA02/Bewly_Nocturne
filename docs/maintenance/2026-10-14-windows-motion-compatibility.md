# Windows Chrome 动效与跨平台检查

## 复现与根因

用户报告 Windows Chrome 中所有弹窗瞬间出现、消失，Windows 系统动画已开启。本轮可访问的实机为 macOS Chrome，未直接连接 Windows。

发现并通过本仓库 Vite 使用的 esbuild CSS 压缩器复现：

```text
/* 开发样式 */
--bew-duration-moderate: 300ms;
/* 压缩后 */
--bew-duration-moderate: .3s;
```

原 JavaScript 用 `parseFloat()` 读取 CSS 时长，传给 Web Animations API 或定时器时默认为毫秒，因此 `.3s` 变成 **0.3ms**；`.2s` 和 `.15s` 同样会变成 **0.2ms / 0.15ms**。这足以让弹窗看起来完全没有动画，也会让依赖 CSS 结束时长的行为提前完成。开发模式不压缩 CSS，过去的本机开发预览没有覆盖此差异。根因是压缩产物与读取语义不一致，并非 Windows 专属禁用分支；仍未直接核对用户 Windows 所安装的包。

仅运行 Sass / esbuild 的样式转换回归，没有执行扩展 build 或生产打包，也没有更改压缩规则。

## 实施

- `utils/motionTiming.ts`：统一解析 CSS `s` / `ms`，转换为毫秒；保留合法的 0 时长，非法值使用调用方既有默认值。
- 迁移全部九处错误的时长读取：`useGlassPanelMotion`、`useLayoutMotion`、`useSurfaceMorph`、`MasonryGrid`、`ContextMenu`、`WheelSelector`、`useHistoryDayMotion`、`FavoriteSidebarItem`、`selectionScrollAnchor`。原生回复区的 `parseCommentReplyMotionDuration` 原本已识别单位，保留。
- 共享弹窗引擎覆盖普通 Dialog、设置、确认框和使用同一来源动效的查看器。浏览器取消当前动画时结算当前过渡；主动反向、卸载和旧动画回调不结算新过渡。绘制层启动失败会释放已创建效果并完成 Vue 收尾，避免残留遮罩、关闭门禁和焦点归还问题。
- 完成回调先移交本轮动画归属，旧绘制层的清理不触及回调中重新打开的弹窗。保持来源捕获、快速反向、KeepAlive 离场暂停、关闭后焦点恢复和 Dock 设置退出门禁。
- `pageScrollLock.ts`：适配占位式滚动条，按锁定前后实际释放的宽度补偿，叠加原有内距，保留内联 overflow 长属性及 `!important`。嵌套锁定只补偿一次；overlay scrollbar 和 stable gutter 不重复补偿。

## 全局检查范围与保留项

- 搜索全项目 CSS 时间读取和动画调用，没有遗留将时间 token 直接 `parseFloat()` 后当作毫秒的调用。
- CSS 自身的 transition / animation 时长由浏览器解释，无需改写。现有原生评论动效的秒／毫秒解析已等价。
- 继续响应 `prefers-reduced-motion`；没有按 Windows UA 绕过无障碍偏好，没有新增平台分支或动效设置。
- 保留 Windows 字体栈（Segoe UI Variable / Segoe UI / Microsoft YaHei UI）、Ctrl / Meta 导航语义以及原有窄屏断点。没有为追求字体栅格化完全相同而下载字体或覆盖原生业务节点。
- 圆角新语法保留现有 border-radius 基础轮廓；动态内容自然高度动画已有能力检测与网格降级。没有为了桌面平台差异增加逐帧测量或轮询。
- 玻璃外壳与祖先不新增 opacity 动画；普通弹窗顶部不恢复模糊，设置窗口及既有顶栏／会话边缘模糊保持不变。

## 验证

- `pnpm lint`、`pnpm typecheck`、`git diff --check`：通过。
- 完整 `pnpm test`：683 项通过（当次包含前四项新回归）。之后加入实际 CSS 压缩器回归，五项平台专项全部通过；最终再次运行 `pnpm verify:selected-p2`，512 项通过，确认新用例已接入常规入口。本轮共覆盖 684 项不同检查。
- 新专项位于 `scripts/verify-platform-compatibility.mjs`，注册到 `verify:selected-p2`，执行实际模块与可控 Animation Promise，而非仅检查源码字符串。覆盖压缩前后时间 token、0/非法时间、外部取消、主动反向、卸载、部分绘制失败、15px 占位滚动条、已有内距、stable gutter、内联优先级及嵌套锁定。
- 开发 watcher 已更新实际 `extension/dist/contentScripts/index.global.js`，包含 `getMotionDuration` 和异常收尾实现。
- 隔离真实组件预览 `http://127.0.0.1:4329/` 使用 `.3s` 时长：普通 Dialog 与真实 `useSettingsMotion` 均记录到 `duration: 300` 及多帧中间 transform；设置内容为合成测试容器。
- Chrome 155 / macOS：真实普通 Dialog 打开、关闭，模拟浏览器取消及绘制失败后能够继续操作，不遗留遮罩。Chrome 中发现 Dark Reader 改写测试页颜色，颜色检查改用无该扩展的内置 Chromium 预览，没有修改用户的 Dark Reader 设置。
- 亮色／暗色／OLED、480px 窄窗：正常材质与终态几何；480px 下弹窗宽 400px、两侧各 40px，页面无横向溢出。快速关闭记录到从中间 transform 反向退出，最终无残留 Dialog。预览视口已恢复。

## 实机边界与性能

Windows 硬件上的实际帧率、显卡驱动、125% / 150% 系统缩放、字体栅格化及用户原安装包尚未实测，不能据 macOS 或 UA 模拟声称 Windows 已验收。Windows 需要更新到含本次修复的扩展再重载测试；单纯刷新网页不会更新旧包。

生产代码没有增加网络请求、常驻监听、逐帧持久化或新的动画库。时长解析复用原有读取时机；滚动锁定只在首个锁定时比较一次前后宽度，嵌套锁定不再测量。不报告未实测的 FPS、显存或内存收益。

## Windows 审计报告补充核对

用户随后提供 `HANDOFF.txt`（2026-10-14）。本次读取的是该报告；报告列出的 `evidence/*.json`、`source-baseline.zip` 和 `local-extension.zip` 未随这次文件提供，因此以下现场值按“Windows 审计报告记录”引用，没有声称重新核验原始证据或 ZIP 哈希。

- 实站 Shadow DOM 原始 CSS、本地 `style.css` 与 computed style 都是 `.15s / .2s / .3s`；编辑收藏夹 Dialog 的 enter/leave 均为 `.3s`。这补强了压缩产物与 JS 解析不一致的证据，不能改写为“Windows Chrome 把 computed style 单位改坏了”。CSS 使用秒是合法行为，修复后不需要把正式包 CSS 强制改回 `ms`。
- 用户真实 Console 为 `reducedMotion=false`、`webAnimations="function"`、`documentVisible="visible"`；Chrome 为 `155.0.8059.80`，采集视口为 `1468 × 961` CSS px，DPR 为 `1.5`。受限浏览器工具曾返回的 `webAnimations="undefined"` 不作为浏览器能力证据。
- Windows 仓库报告为 `main` / `cd4bd2f27616f200b764878f4fe02453c03a8b52`，合并 PR #37，包含功能提交 `71ccad1e`。本轮修复从 `message_feature` 的 `71ccad1e` 开始；Windows 审计发生于修复提交之前，重载原 Windows 包本身不会获得这些改动。不要因为报告分支不同而切换本机分支。
- 滚筒 `.2s` 被旧实现计算成 `0.0002s` 的 response，再被弹簧钳制为 `0.001s`，同样足以让过渡看起来消失。该现象不能证明物理滚轮事件没有触发；当前未改动滚轮阈值、惯性抑制、分类提交或键盘预览语义。
- 报告列出的九个时长调用点全部已迁移，包括收藏夹收起清理和滚动锚点的结束时间；原生评论已有正确单位解析，保留实现。本轮滚动条补偿修复属于另外发现的问题，不将它作为弹窗动画消失的解释。
- 硬件加速配置项为 true 不证明实时 GPU 状态；BTR、hydration、第三方扩展错误也没有证据与本次时间单位问题构成因果关系。无需据此加入 Windows 专用参数、禁用第三方扩展或强行动画覆盖 reduced-motion。

补充验收重点：Windows 加载包含本次修复的新 JS 后，普通弹窗 enter/leave 的实际 Animation duration 应为 300ms；滚筒 `.2s` 与 `200ms` 应产生相同弹簧轨迹；连续/反向滚动、单击及键盘预览/确认保持原语义。快速开关、嵌套弹窗、焦点恢复及 150% 系统缩放仍需 Windows 实机复验。跨平台对照应使用同一版本产物，不能只对比 Mac 开发模式和 Windows 压缩包。现有包及新包身份需要在该设备上记录，版本号 `0.1.1` 本身不足以区分两者。

据此新增两项真实组件／模块回归：实际 `WheelSelector` 在 `200ms` 和 `.2s` 下保留相同的首个中间帧，覆盖行单位滚轮、像素惯性尾巴、反向、Ctrl+滚轮不拦截、键盘预览、一次点击提交、reduced-motion 直接完成及卸载取消帧；实际 `FavoriteSidebarItem` 与 `keepSelectionScrollAnchor` 在 `.2s` 下等待 200ms 加既有 50ms 完成余量，而不是 50.2ms，用户主动滚动立即释放锚点。该回归是可控事件和时钟测试，不能替代 Windows 物理输入设备验证。

补充后 `pnpm verify:selected-p2` **514 项通过**，包含七项平台专项；本次修改文件的 ESLint 及 `git diff --check` 通过。报告没有揭示九处时长修复之外的新生产代码缺口，本次只补测试与维护记录，没有增加 Windows 专用运行逻辑。
