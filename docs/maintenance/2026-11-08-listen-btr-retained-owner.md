# 2026-11-08 原版 BTR 下恢复听视频

## 实际故障

在用户当前视频页点击“听视频”，入口被 `listenHandoffVersion !== 1` 提前返回。页面能收到点击，也出现了配套补丁提示，但独立音轨从未开始准备。已安装的 BTR 为原版 `2026.11.3.1`，没有上一轮仓库外补丁的接口。用户明确要求只改 Nocturne，不更新 BTR。

## 当前实现

- 原版 BTR 保留自己的播放器、SourceBuffer 锁和外层控制器。Nocturne 在 MAIN 调用当前媒体的 `pause()`，让 BTR 的暂停意图和真实媒体同步；继续复用原有独立音轨、听视频界面、控制条和 MediaSession 生命周期。
- 此路径的授权仍沿用原队列、gate、session storage 与账号/路由校验，但不创建阻断原视频请求的 DNR 规则。对还持有播放器的 BTR 强行断网会触发它的错误恢复，不能用断网代替挂起。
- `retainNative` 随现有会话保存，恢复时不依赖尚未就绪的媒体快照重新猜测网络策略。恢复音轨准备完成后重新读取当前媒体节点，允许原生视频在等待期间挂载。
- 听视频期间，原播放器的迟到 `play` 事件通过现有生命周期再次在 MAIN 暂停；导航或退出后监听随 AbortSignal 释放。已经暂停且未替换的原版 BTR 媒体不重复执行挂起。
- 返回视频时，原版 BTR 的 full 路径直接恢复它仍持有的媒体位置、倍速、音量、静音和播放意图，不启动闲置的原生 DASH 调度器；compat/普通原生路径继续恢复原生调度器。旧 gate 不能恢复新 owner。
- 普通原生播放器，以及实际具备 handoff 接口的播放器，保留原有音轨独占路径。移除了不再使用的四套“必须安装配套补丁”文案。

没有修改、安装、禁用 BTR，也没有伪造 settings 消息、调用 `getPlayer().destroy()` 或通过刷新页面代替退出听视频。

## 边界

原版 BTR 没有完整挂起接口，因此这里保留其暂停态缓冲策略。它可能继续补齐暂停位置附近的缓冲；不能宣称该路径没有视频请求、完全释放了 BTR，或等同于独占音轨的节流效果。实际发声和进度由独立音轨承担，原视频保持暂停，不用隐藏一个仍在播放的视频冒充听视频。

## 验证

- 定向回归：listen playback 6/6、MAIN bridge 1/1；覆盖无补丁 BTR 的进入、迟到播放、保留型授权保存/恢复、旧 gate 隔离，以及 full/compat 调度器恢复差异。
- 修改文件 ESLint、项目 typecheck、`git diff --check` 通过。未运行完整测试套件。
- 为实站验证，使用仓库配置编译 content、MAIN、background 开发入口，并重载已有 Nocturne Dev。未运行全套生产构建；构建报告了原有 Vite 配置导入扩展名和 TopBar Sass slash-div 警告。
- 真实 B 站页面、原版 BTR full：暂停在 56 秒进入听视频，保持暂停；独立音轨播放到约 93 秒时，原视频仍停在 56 秒。原生播放/暂停按钮正常控制音轨。退出后原视频恢复到 93.44 秒并保持暂停；播放中再次进入、退出后，原视频在 104.66 秒继续播放。验证结束已暂停原视频。
- 最终开发产物上再次验证刷新恢复：暂停的听视频会话恢复到 105 秒，独立音轨就绪时原视频仍在 0 秒暂停；退出后 BTR 的原视频回到 105 秒、保持暂停，随后 `readyState` 为 4、缓冲区间为 105–150 秒、没有媒体错误或播放器错误面板。
- 刷新日志出现原站 `jinkela/video/video.*.js` 的 `style` 和 `laputa-header/bili-header.umd.js` 的 `nextSibling` 初始化错误。本次没有证明其根因，未将其列为已修复；上述听视频与恢复结果是另外实际观察到的媒体状态，不能据此声称页面控制台没有错误。
- 实站没有覆盖 BTR compat、实际 CDN 故障、系统锁屏媒体键或性能录制；这些不能由源码或夹具结果替代。

## 2026-11-11 同窗口推荐视频切换

用户反馈：当前窗口只有最初打开的视频能进入听视频，点击推荐视频进行同文档导航后失效。

后台把消息的 `sender.url` 当成当前视频地址，分别用于 grant、save、recover 和恢复检查点校验。Chromium 的消息来源 URL 使用脚本上下文保存的 URL，不能承担 SPA 当前路由校验：见 [ScriptContext 初始化](https://raw.githubusercontent.com/chromium/chromium/main/extensions/renderer/script_context.cc)和[消息来源 URL 传递](https://raw.githubusercontent.com/chromium/chromium/main/extensions/renderer/ipc_message_sender.cc)。

修复在 `src/background/listenPlayback.ts`：

- 来源仍通过共享 `isContentScriptTargetUrl` 和顶层 frame 校验；当前稿件继续由既有 `ownsRoute` 使用 `tabs.get()` 的 `pendingUrl / url` 判断。
- 会话结构与自身 href 校验独立于发送脚本最初的 URL；保存、恢复和重新授权继续核对当前稿件、gate 与队列所有权。
- 保留授权写入前后、检查点写入前后的实时路由复核。旧视频请求、iframe 请求、无效来源及导航中的旧会话不会获得新授权。

新增真实后台控制器夹具：sender URL 固定为视频 1，标签页连续导航视频 1、2、3，分别覆盖普通规则和 retained BTR 规则下的授权、保存、恢复、续期与旧 gate 释放。旧代码在视频 2 的授权断言失败；修复后通过。

验证：listen playback 7/7，DNR/存储写入期间导航和关 tab 的竞态检查 1/1；改动文件 ESLint、完整 typecheck 与 diff 空白检查通过。没有运行完整测试、生产构建或浏览器验收；没有修改 BTR，也没有重启开发 watcher。此处的验证结论仅属于本次修复，前节的实站记录属于此前版本。
