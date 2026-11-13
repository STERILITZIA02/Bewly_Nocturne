# 2026-11-05 收尾审查与 CI 修复

后续修正：用户要求保持原版 BTR，当前已[取消配套补丁的强制依赖](2026-11-08-listen-btr-retained-owner.md)。下文的配套要求是当时的交付状态。

本记录承接[可靠性与增量性能修复](2026-11-05-reliability-followup.md)。沿用 `message_feature`，保留原有未提交改动及前两轮实现，没有重新设计 Token、12 栏/8:4、材质、圆角或动画。以下记录本次额外发现并修复的缺口；不是对项目不存在其他问题的保证。

## 生产代码修复

- **私信阅读与已读边界**：返回最新请求提交前检查现有 viewport intent。点击后重新阅读旧消息会使该次提交失效，不覆盖阅读窗口。将服务端最大序号和已证明读取的最新边界分开使用；服务端序号包含非展示记录时仍能正确确认最新窗口，旧历史窗口不能据此越界确认已读。窗口更新复用 reader 与现有锚点，不新增历史缓存。
- **私信数据开销**：会话记录改用浅响应式，消息按根数组替换。表情目录每次 hydration 只建一次索引；解析结果相同时保留消息/content/数组引用，只替换受实际变化影响的记录。缓存限额检查不再重算未变化的窗口。
- **路由生命周期**：移除 `useCurrentLocationHref` 的模块级订阅，外观适配导入不再提前启动路由观察。支持 Navigation API 时订阅 `currententrychange`；旧浏览器继续使用既有可见性约束下的回退。停止 owner 时同步移除监听器和定时器。浏览器事件依据见 [Chrome Navigation API](https://developer.chrome.com/docs/web-platform/navigation-api) 与 [MDN currententrychange](https://developer.mozilla.org/en-US/docs/Web/API/Navigation/currententrychange_event)。
- **收藏读取取消**：最后一个消费者的 AbortSignal 同步释放共享读取 owner；尚未进入 API 的队列任务检查取消状态。另一个消费者仍在时不误取消它。扩展既有 `waitWithSignal`，不另建请求框架。
- **布局与交互**：私信定位复用顶栏高度、界面缩放和间距 token；动态列宽/栏距复用共享网格值，并将重复列数与虚拟范围更新合并。字体/缩放改变重新计算实际几何，隐藏期间仅失效缓存。设置深链等待折叠组真正展开后再定位，不在动画提交前读取隐藏目标。
- **稍后再看与 PiP**：稍后再看读取失败正确返回 false。PiP 随 URL 更新替换 iframe 文档，复用统一外链解析与修饰键习惯；界面尺寸和玻璃偏好同步到 iframe，保持现有关闭动画。
- **共享格式化**：计数解析完整识别分组数字、K/M/B、万/萬/千万/千萬/亿/億；任意文本里的数字不再变成计数。过滤和显示共用解析，单位表不在每次调用重建。日期按本地日历日比较，修复夏令时 23 小时日的“昨天”判断。
- **听视频释放与 BTR 返回**：MAIN 根节点通道按 gate 释放，不依赖已被移除的 video。原生切换恢复成功后也释放 BTR 外层 owner。仓库外配套补丁 revision 2 补齐听视频期间用户关闭 BTR 或 full 转 compat 时的原生源恢复；恢复能力缺失返回 false、保留 lease，不报告假成功。

## 测试与 CI

实际查到的[旧 CI 运行](https://github.com/STERILITZIA02/Bewly_Nocturne/actions/runs/41947103920)在依赖审计失败后跳过类型、测试、knip 和构建。当前配置让 lint、typecheck、test、knip、build 与安全审计独立产出；同一 PR/ref 的新运行取消旧运行，pnpm 启用工具自身缓存。

`pnpm test` 使用 `run-s --continue-on-error`，使一个检查失败后其余检查仍产出结果；任何子检查失败时总命令仍返回非零。安全审计没有 `continue-on-error`，精确回补的规则沿用上一轮实现。补齐 knip 的真实动态验证入口。

修复夹具缺失的 cursor、分页和异步取消契约；共享 MediaQueryList 夹具恢复真实事件模型，测试结束恢复全局 RAF、偏好与观察器。异步 flush 等待 Vue 队列和宿主任务结算，不绑定固定微任务次数。空过滤结果明确报错，不把零个检查当作通过。

删除六组已退役或重复的源码拼写断言，包括旧动态/专栏封面实现约束、巨型页面布局快照、已移除函数、固定 Transition 数量与私信外壳源码快照。保留对应实际组件/控制器行为验证，以及翻译键、权限、Token、字体和圆角策略。没有因为失败就删除有效行为要求。

`AGENTS.md` 新增测试质量规则：按风险选择最小充分验证；不为低影响可逆修改机械增加测试；不固定函数名、模板空白、包装层、任意毫秒或帧数；源码策略只约束真实产品不变量。修正动画等待 scope、既有可见性回退等与当前实现不一致的绝对限制。

## 验证证据

| 层级 | 实际结果 |
| --- | --- |
| 仓库完整测试链 | 为确认 CI 测试链已修复，运行一次完整 `pnpm test`，退出码 0；当时 selected-p2 682/682、私信 127/127，targeted-fixes、notifications、颜色、图标、样式失效、界面尺寸、license fixture 检查均通过。 |
| 最后两处补充后的定向验证 | BTR/MAIN 释放调整后 listen playback 6/6、MAIN bridge 1/1；日期修复后 final audit 4/4。没有为这些局部补充再次跑完整测试链。 |
| 静态与依赖检查 | lint、typecheck、knip、`git diff --check` 通过。最后追加的格式化代码和检查脚本另过定向 ESLint，最终 typecheck 通过。`verify:dependency-security` 通过；原始审计中的两个精确版本 advisory 经已验证回补记为 BACKPORTED，不宣称原始 audit 零告警。 |
| 真实 Chrome 路由夹具 | Chrome 156.0.8078.80，使用实际路由模块，导入时 0 监听、支持 Navigation 时 0 路由轮询；预先缓存的原生 pushState/replaceState 触发 2 次路由更新，停止后监听释放且不再更新。 |
| 真实 Chrome 媒体/控制器夹具 | 普通暂停/播放、BTR full/compat、在途启动、听视频期间关闭 BTR、full 转 compat、恢复能力缺失，共 8 场景通过。普通媒体为实际 HTMLMediaElement/WAV；BTR 使用真实 MAIN bridge/page-hook，Bpx/传输工厂是夹具。先在旧补丁复现关闭 BTR 后位置恢复失败，再验证修复。 |
| 工作量计数 | 200 条私信的表情目录无变化时替换 0 行；一个表情定义变化只替换含该表情的 100 行。此前几何、章节、历史投影与目录窗口计数见前一份记录。没有把计数换算成耗时/内存收益。 |

本次未执行扩展生产构建；license 检查只编译其临时测试夹具。没有推送或触发远端 CI，配置修复不等于新远端运行已经通过。

## 配套与待验证路径

BTR 依赖仍是正式版 `2026.11.3.1`（`e409a42cbec60d4ceb430dc53d8a7942e07c1d31`）或本轮核对的 main（`1e709faf8d210c10fbdcfac5e9933e2ea96162c1`），加仓库外 `btr-listen-handoff-v1.patch` **revision 2**；API 版本仍为 1。补丁仅修改现有 page-hook 控制器，反向应用检查通过。源码、说明和浏览器夹具结果在 `/private/tmp/bewly-btr-listen-handoff/`，交付包为 `/private/tmp/bewly-btr-listen-handoff-v1.tar.gz`。未构建/安装第三方 userscript，未向第三方推送或创建 PR。

尚未完成：重载扩展与配套脚本后的真实 B 站端到端播放、实际 CDN 网络切换、worker 回收下真实 DNR 事件交错、系统媒体键/锁屏 MediaSession、Safari、用户视觉验收、真实账号写入，以及 Performance trace/堆内存录制。上述边界保留，不能用源码或夹具结果替代。
