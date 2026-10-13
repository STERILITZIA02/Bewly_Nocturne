# 上游兼容适配 A01—A13

参考 `keleus/BewlyCat` 的 `bb0df626..b2c80d67`，在 `message_feature`（起点 `65df636e`）逐项按最终语义适配，不合并或批量移植。保留开始前的 11 个卡片内收修改文件；本批不提交、不推送。

## 范围及状态

| 项 | 状态 | 实现与验证落点 |
| --- | --- | --- |
| A01 | 底/右外壳实站通过；新增竖向胶囊待重载 | `Dock.vue` 仅底/右零尺寸边定位条；保留胶囊、命中通道、缩放与 Composer 位移 |
| A02 | 已实施 | `notificationBadge.ts` 统一规范化真实计数，再派生总角标；下拉分类和 Insights 不受总提醒设置影响 |
| A03 | 已实施；暗色抽屉实站确认，其余待验 | `useDark` 临时父覆盖；`iframeDocument/iframeMessage` 文档挑战与消息归属；移除宿主定时主题重发和入口重复 DOM 写入；MAIN 评论标签直接消费外层语义变量 |
| A04 | 已实施；普通抽屉开关与初始外链实站确认，其余待验 | 有界关键词/分类/意图请求；当前活动宿主校验并导航；普通 Drawer 与动态详情独立外链，不重建 iframe |
| A05 | 已实施 | `videoPreviewProgress` 统一目标与媒体身份；Cover 按会话绑定监听、重置/卸载前保存、结束归零；删除未回填 videoElement，单一进度状态 |
| A06 | 已实施；服务器写入未验 | 视频收藏选择器、差额提交与确认门禁；顶栏收藏有效视频复用 `updateOwnedWatchLater`；菜单配置/四语言/搜索目录完整接入 |
| A07 | 已实施 | 选择目录与显示目录分离；旧目录失活、首屏错误归属当前夹；保留原分页成功推进/停滞/账号版本保护 |
| A08 | 已有展示复用，补真实缺口 | 保留 `popoverCards.scss`、IconButton/Tooltip 与 `retiringListTransition`；补删除焦点、历史删除互斥、主题前景及播放并移除的激活窗口保留 |
| A09 | 尺寸已有等价；补弹层定位 | 原生发送栏仍在播放器节点树内，不适用上游整套移出后尺寸补丁；现有圆形发送键不变；设置弹层按实际锚点、视口及裁切边界定位，复用布局同步 |
| A10 | 已实施；活动 Drawer 实际应用已验 | 现有 0.25—5 倍速增加输入/应用；当前播放器或活动 Drawer 文档处理；显式意图防止旧值恢复；不增加快捷键设置 |
| A11 | 读取与缓存已有等价；修动画差额 | 保留 `MomentCommentSection` 就绪/空/失败/缓存/取消读取；反向 transitioncancel 不再提前卸载；隐藏阶段不接受新的点赞操作 |
| A12 | 已有等价，回归保留 | 自然高度网格、单一外侧滚动、共享预览与有限备用源；3/15 行及失败占位/收起局部浏览器验证 |
| A13 | 已有合理近距布局，保留 | 本地批量入口为左对齐独立行（与原生尾部仅 4px 间距），分页控件就近置于原生 footer 并自动折行；没有上游靠右推远的 auto margin；文案仍为“分批加载回复” |

## 验证记录

逐项记录真实命令及结果；隔离组件测试与重载后的实站验收分开。不使用账号写入替代隔离测试，不推断 FPS 或内存收益。

- 独立功能用例：`scripts/verify-compatible-a.mjs`，由现有 `verify-selected-p2.mjs` 执行；补充真实评论生命周期与实际 Dock 组件测试。新增用例覆盖后台请求序列化、真实通知菜单、同 WindowProxy 重载、主题响应式覆盖、受控 iframe 命令、实际媒体事件、收藏事务与回读、跨夹乱序、焦点和原生弹层几何。

| 实际命令 | 结果 |
| --- | --- |
| `pnpm lint` | 退出码 0 |
| `pnpm typecheck` | 退出码 0 |
| `pnpm test` | 退出码 0，674 项 PASS；含原有 targeted / selected-p2 / private-message / notifications 完整链 |
| `git diff --check` | 退出码 0 |
| `pnpm dev` | 本任务 watcher 已重启；content 1173 模块、inject、background、native appearance 开发产物更新；未执行生产 build |

检查日志在本任务临时目录：`/private/tmp/bewly-a-final-{lint,types,tests}.log`、`/private/tmp/bewly-a-dev.log`。中途失败包括测试运行器 IPC 沙箱限制、已替换定位方式的旧断言、测试桩依赖更新及格式检查；均有修复后重跑，不降低检查规则。
- A06 协议依据：[上游 642ac4e](https://github.com/keleus/BewlyCat/commit/642ac4e2b0e15952c740e77f6abdf6f00cbb8107)、[自建目录成员查询记录](https://github.com/bilibili-plugins/bilibili-api-collect/blob/master/docs/fav/info.md)、[视频收藏写入记录](https://github.com/bilibili-plugins/bilibili-api-collect/blob/master/docs/video/action.md)。使用 form-urlencoded 的 `rid/type=2/add_media_ids/del_media_ids/csrf`；不使用通用资源 id 推测 aid，不写批量移除或订阅接口。
- 本地合成预览 `http://127.0.0.1:4323/` 使用真实 Dock、LibraryWorkspace、MomentsSidebar、FavoriteVideoDialog、Dialog 与 Input，API/账号为隔离数据。底边定位条实测高度 0；右边定位条宽度 0；1280×720 无横向溢出。390px 收藏弹窗左右各留 8px，内容无横溢；空态无插图、无残留骨架；保存后焦点恢复到来源按钮。
- 合成预览已检查亮色/暗色/OLED，正常/空目录/失败重试、满夹门禁、多选提交、Escape 和焦点恢复。普通 Dialog 无顶部模糊，玻璃外壳 opacity 为 1；自定义倍速空值禁用、小数 step=any、无主播放器反馈正确。页面空闲后的工具滚动使正文滚到 720px，Dock 定位不变；没有测量延迟或物理触控板/FPS。
- A12：3 个直播时卡片 226px，15 个直播时 946px，由既有侧栏视口（644px）滚动；内部列表 overflow 为 visible。预览失败保持展开，移出后恢复自然高度。以上是合成数据的实际组件几何，不是直播源实播验收。
- 性能测量边界：收藏差额测试的一次已接受写入，在回读失败及再次点击保存后仍只有 1 次写入；刷新只重读。未测量实站 FPS、空闲滚轮延迟或内存变化，不声明收益。

### 用户重载后的 Chrome 只读检查

2026-10-13，用户确认已重载 Bewly Nocturne Dev 后，在本任务新建标签页验证；没有提交收藏、删除、发送，也没有切换持久化主题、Dock 位置或播放偏好。

- 首页 1744×1083：实际 39 张视频卡；底部 `.dock-wrap--bottom` 高度 0，无横向溢出。收起后“展开 Dock”可重新打开；设置可从齿轮进入并正常关闭。关闭初期焦点回到“设置”，动画完成后 Dialog 卸载、Dock 随后收起；不据离散采样推断具体动画耗时。
- 视频菜单存在“收藏到收藏夹”；实际读取 32 个目录，加载后无错误和残留骨架。弹窗 440×619.195px、居中；未改选择，Escape 关闭后焦点回到“更多操作”。服务器写入仍只由隔离测试覆盖。
- 普通视频 Drawer 实际承接 iframe，初始 `src` 与“在新标签页打开”的链接一致；子文档为暗色。第二次打开后 iframe 保持挂载，点击原生视频标签创建新标签时原抽屉仍在；点击关闭后恢复首页 URL，原 39 张视频卡恢复呈现。新搜索标签在工具读取时没有有效地址，访问被工具策略拒绝，未绕过；搜索落地结果不标记通过。
- 一次早期抽屉检查中，展开完整播放侧栏后、尝试定位标签时，页面后来成为顶层播放页；没有建立具体触发链，第二次没有复现。该现象保留为未确认观察，不据此修改导航或宣称已修复。原生播放器/顶栏脚本出现 `style`、`nextSibling` 等异常，另一扩展报告 BTR 启动失败；来源不足以证明与本批无关，也没有据此认定 Nocturne 回归。
- 设置搜索“自定义倍速”能定位 Bilibili / 播放器；实际数字输入为 `min=0.25`、`max=5`、`step=any`，应用入口存在。本轮没有点击应用或更改记忆偏好。
- 实站截图：`/private/tmp/bewly-a-live-home.png`。本轮只更新维护记录，没有新增生产代码修改，开发产物无需再次重载。

## 保留项与验证边界

保留统一视频卡、现有内距与网格 token、来源弹窗动效、设置/顶栏/会话边缘模糊、Dock 与 Composer 的现有通信、原生播放器节点和发送权威、资料库分页与虚拟窗口。A12/A13 没有为了凑修改量搬回上游旧布局。

第二类功能、第三类设计、Firefox、想看分组、固定 UP、全局快捷键、旧首页快照均未引入。WBI 总期限、关系查询失效终止、响度 Dialog 保留原实现。真实收藏/删除/发送没有执行。

未完整实站验证：sandbox 当前标签搜索、同 URL iframe 完整重载和旧文档消息对抗、独立父子主题偏好冲突、原生 revision 2、IME/冷却/全屏/网页全屏、真实账号收藏写入及回读、私信 Composer 避让、物理触控板空闲唤起。当前遇到的 Drawer/Opus iframe 无 sandbox，播放器为 revision 1，全屏原生按钮处于 display:none；不修改安全策略或伪造宿主 DOM 来凑验收。写入类继续遵守用户禁止收藏/删除/发送的约束，异常归属与事务故障由已有受控回归覆盖。首次抽屉观察的顶层跳转原因仍未确认；本轮切稿与 Opus 重定向没有复现该现象。

## 第二轮重载后的补验与右侧胶囊

- 普通 Drawer 从 `BV16daw6sE2W` 点击推荐切到 `BV1wWep6RErF` 后，外链更新到后者，iframe 的初始 src 仍为前者。中键打开的新标签实际为后者，原 Drawer 保留。
- 活动子文档随父页从亮色切为暗色和 OLED，OLED body 为 rgb(0,0,0)。真实评论 ShadowRoot 的“UP主觉得很赞”标签前景为 rgba(212,215,222,0.9)，对应外层 `--bew-comment-tag-color`；不是只改外部不生效的规则。
- 自定义倍速在真实活动 Drawer 内应用 1.25，playbackRate/defaultPlaybackRate 均为 1.25，后续读取仍一致；再应用 1 恢复。倍速记忆原为 false，未切换它。
- revision 1 弹幕输入区可编辑并已清空，未发送；输入时保留原生 DIV 按钮，data-bew-send-state=ready、36×36。弹幕设置键盘展开后为 320×359，坐标 (348.46,515.5)—(668.46,874.5)，处于 1744×963 子视口内，Escape 可收起。
- 动态详情初始 src 为 www/opus，实际重定向到 t.bilibili.com 后暗色继承正常，外链同步到已验证的新文档；键盘外部打开的新标签地址一致，Dialog 正常关闭。
- FavoritesPop 快速切夹时，新目录标题下旧列表具有 inert 与 stale 标记；最后目录接管后 20 行、18 个有效稍后再看入口、骨架/错误/旧列表均为 0。没有点击稍后再看或收藏提交。
- 右侧 Dock 外壳实测宽度 0，收起可重开，工具滚动正文达到 scrollTop=1027，未被外壳拦截。用户随后指出收起胶囊应随右侧停靠竖向排列，因此增加本轮修订。
- 本轮结束时，主题恢复“设备”、OLED=false、Dock=bottom、广告过滤=true、主视频倍速=1；没有真实收藏、删除、点赞或发送。测试标签已关闭。

右侧胶囊修订只修改 `Dock.vue` 与对应回归：按停靠方向交换收起长短边，标记旋转 90 度，用短边半径补偿壳层缩放；内部使用居中 flex 防止旋转前的宽标记撑大 grid 轨道。右侧命中通道覆盖原展开高度及靠屏幕边的留白，正文侧不额外扩展。保留原状态机、设置退出门禁和 bottomShiftChange，无新增监听或逐帧测量。

本地实际组件已检查亮/暗/OLED、连续反向开合和底部布局：右侧表面约 19.44×116.62（含当前响应式缩放），内部标记与按钮中心一致；屏幕右缘、可见胶囊之外的扩展区命中正确，正文左侧不被阻挡，横向溢出为 0。截图 `/private/tmp/bewly-dock-right-capsule-fixed.png`，预览 `http://127.0.0.1:4323/`。`pnpm verify:selected-p2` 503 项 PASS；lint/typecheck 与 diff-check 通过。开发产物已更新，新增竖向胶囊需再次手动重载后实站确认；此前整批 675 项完整回归记录仍保留。
