# 2026-11-05 可靠性与增量性能修复

后续补充与最新验证见[收尾审查与 CI 修复](2026-11-05-final-audit.md)。下文保留本轮结束时的验证范围；之后为修复 CI 已运行完整测试链，BTR 配套补丁已更新为 revision 2。

本轮沿用 `message_feature` 的工作区。前一轮 16 组适配作为既有实现保留；本轮只修后续核实的缺口。Design Token、12 栏/播放页 8:4、材质、圆角与动画没有重新设计。

## 实现落点

| 请求组 | 实际修改 |
| --- | --- |
| 1 听视频初始化 | `listenControl` 先提交准备好的音频状态，再绑定原生控制条；`listenAudio` 保留默认倍速、播放意图和 CDN 切换前位置，取消事件不能倒写旧状态。恢复/重试使用当前 MAIN 挂起 owner，而非假定它始终等于刚轮换的 DNR gate。 |
| 2 DNR 所有权 | 授权、保存、恢复、导航和关页共用原队列。队列内读取 gate/unit；实际 `tabs.get` 的 `pendingUrl/url` 在 DNR 和 storage 写入前后核验。内部释放不再入队，旧 gate 不能释放新授权。 |
| 3 BTR 交接 | MAIN bridge 使用版本化的 BTR 控制器能力，去掉直接 `getPlayer().destroy()` 和强制刷新退路。配套补丁位于仓库外，版本和局限见下节。 |
| 4 后台请求 | `stateConsumers.release` 等待持久状态载入；注册替换、释放和消息投递使用 documentId，失败的旧投递不能删除新订阅。云同步合并条件包含 generation、规范化 mode 和 expectedState，保留关闭同步的回滚。 |
| 5 私信历史 | reader 按当前阅读锚点保留窗口，读旧页释放远端的新消息；后台最新页只更新相交记录和最新边界。返回最新复用首次读取路径，同时废弃在途旧页。旧历史窗口不能触发最新窗口的已读判断。 |
| 6 搜索 | `live_user` 第 2 页以后正常显示；更多主播事件交给父级更新分类/页码/URL。翻页模式纳入现有请求身份，变化时同步取消旧请求并归第 1 页。 |
| 7 稍后再看 | batch commit 返回真实 Promise；等 `dissolve.released` 后再次检查 actionLifetime，再提交本地列表变更。busy 和选择状态等提交完成再结算。 |
| 8 播放页语言 | Tab 只改专属 label，保留 icon/count 节点；信息折叠按钮和 up-next 文案随语言同步，继续使用原 shell。 |
| 9 观看历史 | 普通写入广播与应答复用同一 patch/epoch/revision/operationId。重复修订不重复投影；无展示基线的 ACK 走既有读取恢复，不能仅推进 revision。无编辑时复用 canonical；索引按受影响 base 更新，容量排序只在实际超限时运行。 |
| 10 几何 | 播放页排程只锚定一次，控件与 readiness 共用本次测量，再写样式；稳定侧栏刷新和弹幕宿主变更加入既有排程。章节几何在尺寸/结构变化时失效，媒体事件合帧绘制；网格 ResizeObserver 保留，但更新交给 viewport frame。 |
| 11 列表/定时器/缓存 | 私信普通目录和搜索结果复用同一个 `useCardWindow`；选中、焦点和菜单 pin 保留，键盘可定位未挂载行。投票改为到期定时及可见性恢复检查。评论快照按实际序列化内容判变，总预算增量维护，不共享可变评论对象。历史专用消费者仅在读写结算且无人使用后释放。 |
| 12 待测路径 | HistoryPop 补齐完整 cursor、去重、停滞/同游标重试和读取取消，游标规则与完整历史页共用。MAIN 记录原生 MediaSession 回调并在听视频结束恢复。原生条在暂停期间被替换也会重绑。未改变听音计入已看或多声道选择语义。 |
| 13 依赖/CI | 修复父依赖或回补最小上游安全补丁；独立安全审计 job 保持失败语义。lint、类型、测试、knip、build 分别产出结果。按本轮要求没有本地构建或完整测试。 |

## BTR 配套依赖

核对的正式版为 [2026.11.3.1](https://github.com/MrTangLuyao/Bilibili-thread-ripper/releases/tag/2026.11.3.1)，提交 `e409a42cbec60d4ceb430dc53d8a7942e07c1d31`；main 为 `1e709faf8d210c10fbdcfac5e9933e2ea96162c1`。两者的播放器源码相同，main 的额外差异在说明文档和生成的 canary 文件。

正式版自身没有完整挂起接口。所需配套是上述源码加 `btr-listen-handoff-v1.patch`，暴露 `__biliThreadRipperDebug.listenHandoff.version === 1`。接口位于现有控制器闭包内：取消 route request/延迟启动，调用 `stopPlayer(false)` 恢复 buffer 方法和外层 owner，暂停自动接管，按 lease 恢复既有 retakePosition/resumeHint。生产适配不广播虚构 settings、不关闭 BTR，也不刷新页面。

补丁和验证夹具保存在本轮交付的仓库外目录 `/private/tmp/bewly-btr-listen-handoff/`。未安装该补丁的 BTR 会得到明确的配套依赖提示；这不代表未打补丁的正式版已经兼容。没有向 BTR 仓库提交、推送或创建 PR。

## 安全依赖的精确范围

- `@intlify/unplugin-vue-i18n` 11.2.7 → 11.2.8：其 `vue-i18n-extensions` 依赖从 8 升到 9，移除单独引入的 `@intlify/shared` 10.0.8。
- `rimraf` 6.1.3 → 6.1.4：其父链使用已修复的 glob 14.0.3。
- `@ffflorian/jszip-cli` 仍要求 glob 13.0.6；ESLint/typescript-estree 等仍要求 minimatch 10。没有跨主版本 override。
- glob 13.0.6 回补上游 [4682e8c](https://github.com/isaacs/node-glob/commit/4682e8c9babee1b385202ede36389634e12076d7) 的取消遍历修复。
- minimatch 10.2.6 回补上游 [77a0f5c](https://github.com/isaacs/minimatch/commit/77a0f5c4b80bdc641c3c930a1d9edf5ad2db57f8) 的展开预算与大集合优化跳过。

`pnpm verify:dependency-security` 先检查所有锁文件解析均带补丁、实际安装的 ESM/CJS 文件哈希及行为，再运行未过滤的 `pnpm audit --json`。原始审计仍报告这两个旧版本 advisory；只有精确 advisory + 精确版本 + 已验证的补丁可记为 BACKPORTED。新告警、其他版本、补丁缺失或审计失败仍使 job 失败，不使用全局 ignore。

## 验证分层

- **源码/模型**：查看现有 owner、队列、窗口和增量协议后修改；没有将源码推断当作实测。`verify-targeted-fixes` 包含源码策略断言，不能代替浏览器验收。
- **仓库定向回归**：`verify-selected-p2.mjs 'reliability '` 覆盖本轮竞态与界面状态；另运行 listen playback、data local history、controls readiness、上一轮 approved upstream，以及私信 message limits 的定向检查。lint 和 typecheck 单独执行。本轮不运行完整 `pnpm test` 或扩展 build。
- **真实 Chrome 夹具联调**：仓库外加载真实 Nocturne MAIN bridge 和 BTR page-hook 控制器，核验 full、compat、在途启动取消；B 站内核与播放传输工厂是夹具。普通路径用真实 HTMLMediaElement/WAV 核验暂停/播放、音量、静音、倍速、位置与 gate 校验。这不等于已重载扩展的 B 站实站播放验收。
- **性能计数**：100 个同帧播放布局请求合为 1 次处理，5 个被跟踪的盒子各读一次；100 次尺寸不变的后续处理没有额外 resize 广播。稳定章节的 50 次 timeupdate 合为 1 次 paint、0 次新布局读取，resize/节点替换各读 3 个盒子。1000 项观看历史基线的普通写入只有乐观/确认两次投影、共 4 个受影响 key，重复修订不增加投影。500 项私信目录及宽泛搜索都维持少于 40 个挂载行。这些是受控夹具计数，没有耗时、堆内存或真实页面性能录制结论。

最终检查结果：lint、typecheck、`git diff --check`、targeted-fixes 均通过；本轮 reliability 16/16、listen playback 6/6、MAIN bridge 1/1、data local history 2/2、controls readiness 1/1、私信 message limits 2/2、上一轮 approved upstream 11/11。安全校验通过，两个精确回补 advisory 仍在原始审计中列出。Chrome 156.0.8078.80 的五种夹具场景全部通过（普通暂停/播放各 9 项、BTR full/compat 各 16 项、在途启动取消 3 项），结果在仓库外交付包的 `browser-results.json`。

## 未完成验证

真实 B 站页面上重载 Nocturne 和配套 BTR 后的端到端播放、实际 CDN 网络切换、浏览器 worker 被回收后的真实 DNR 事件顺序、系统媒体键/锁屏 MediaSession、Safari，以及 DevTools performance trace 尚未完成。付费/风控媒体和真实账号的发送、删除、投票等写入没有作为本轮验收。CI job 拆分已落在配置中，远端 CI 运行结果尚不存在。
