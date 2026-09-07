# 播放侧栏内容与原生操作恢复

2026-09-08 更正：本文中的“脱落 DOM 恢复”已撤回。原位标记不能证明 Vue 控制器仍存活，重新挂回 DOM 可能留下无功能空壳；当前修复以 [原生组件挂载与广告规则](2026-09-08-native-actions-and-advertising.md) 为准。

在 `message_feature` 上继续，保留已有未提交修改和 stash；不提交、推送或执行生产 build。

## 已确认的问题与修改

- 真实失效页面的操作区已变成 `.bewly-widescreen-fallback-stats`，其中是没有原生监听的四个 span；简介和标签原生节点也已不在 document 中。原来 `readiness.top` 允许 API 统计或元信息替代原生工具栏，导致这种页面仍标记完整。
- `nativeDom.ts` 原先忽略整个 Bewly root 内的变化。现在识别简介/标签迟到内容，以及作者、工具栏、简介和标签根节点的替换或移除；评论列表和操作动画继续忽略，沿用一个 RAF 协调刷新。
- 同一导航中，原位标记仍连接时可以重新附着被移除的原始节点，保留四种点击监听和组件 DOM。已释放的导航、失去原位标记的旧节点不复用。原生外壳含原位标记时，不再被误当作新的内层组件而删除现有内容。
- 简介的展开按钮始终位于正文之后。侧栏就绪要求真实原生工具栏；只读统计标为 disabled 并取消 hover。原生工具栏缺失至既有 deadline 时提供刷新/退出入口，迟到恢复后清除错误。
- `layout.ts` 将唯一背景及 backdrop-filter 放到侧栏 aside 自身，删除负层级的背景伪元素。头部、分类下方和三个面板共享完整背景，不增加液态滤镜或第二层模糊。

修改文件：`src/utils/bewlyWidescreen/{nativeDom,description,sidebar,videoInfo}.ts`、`styles/layout.ts`、`AGENTS.md`；回归位于 `scripts/verify-playback-content-lifecycle.mjs`，由 `verify-selected-p2.mjs` 注册，原定向样式/就绪断言同步到新行为。

## 广告核查

对照 [AdGuard Chinese Filter](https://github.com/AdguardTeam/AdguardFilters/blob/master/ChineseFilter/sections/specific.txt) 与 [EasyList China](https://github.com/easylist/easylistchina/blob/master/easylistchina.txt) 的 Bilibili 规则。当前真实播放页的 `.ad-report`、`.slide-ad-exp`、`.video-card-ad-small` 等广告均为 display none；游戏广告规则已有等价实现。没有找到必须新增且可确认不误伤的播放页规则，故没有扩大过滤范围或复制远端脚本。简介、标签、工具栏不属于本项目的播放页广告选择器。

## 验证及边界

- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm knip` 已完成且退出码为 0；knip 仍有既有 52 个导出、6 个类型、4 个枚举成员提示。`pnpm dev` 持续编译成功。
- 新测试调用实际 nativeDom、description 和 sidebar 模块，覆盖移除后恢复同一节点、四个原始监听保留、迟到简介显现、外壳/内层选择器、导航释放、统计不能冒充原生操作，以及超时/迟到恢复。另验证评论和 canvas 更新不会触发全侧栏 hydration。
- Chrome 桌面夹具中，995px 高侧栏自身为一层 `blur(20px) saturate(1.8)`，伪元素 content 为 none，侧栏 SVG 滤镜为 0。头部和三个内容面板共享该背景，截图未见分类下方的背景断层。夹具数据不是原生 Bilibili 业务结果。
- 修复前的独立 Bilibili 新页面能挂载原生简介、标签、操作工具栏，并能打开原生投币面板；切换至另一稿件后取得该稿件的简介与标签。这说明问题并非所有原生入口都已被永久删除，但失效页面的首次触发过程尚未在真实浏览器完整复现。
- 未执行真实点赞、投币确认、收藏提交或对外分享。四种监听的模块回归不等于服务端写操作验收。
- 已请求重载开发扩展。再次刷新测试页后仍读取到旧的 sidebar 伪元素背景，修复后的真实 Bilibili 验收尚待重载；不能据本地夹具或旧脚本页面宣称四项功能与所有内容组合全部通过。
