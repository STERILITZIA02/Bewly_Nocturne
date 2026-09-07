# 原生组件挂载与广告规则

继续在 `message_feature` 工作；保留此前视觉、骨架和生命周期修改。未提交、推送或执行生产 build。

## 危险回归的关键缺口

原生元素存在不等于原生控制器可用。此前只检查 DOM、原位标记及普通事件监听，未覆盖 Vue 初始化与销毁：SSR 元素可能尚未绑定业务，销毁后的 DOM 也可能仍然存在。上一轮重新挂回脱落节点的代码因此被移除。Vue 2 的 [生命周期实现](https://github.com/vuejs/vue/blob/v2.7.16/src/core/instance/lifecycle.ts) 会在销毁时停止组件并清除根节点的组件引用，简单重新附着不会恢复业务。

- `src/utils/videoMetadataBridge.ts`：复用现有字符串 DOM 事件、channelId、requestId 和当前 URL 校验，同步探测指定根节点的原生组件。临时响应监听在 finally 中移除；诊断标记不作为缓存真值。
- `src/inject/videoMetadata.ts`：只在 MAIN 读取原生 Vue 挂载、销毁状态及 `$el` 所有权，返回布尔值，不暴露组件对象或复制业务数据。原生销毁钩子按组件去重；销毁后通知现有侧栏刷新，页面桥释放时移除订阅。
- `src/utils/bewlyWidescreen/nativeDom.ts`：普通 BV/AV 原生信息组件未挂载时留在原位；尚未初始化的新壳不能替换正在工作的组件；已销毁、被丢弃的节点不重新附着。其他播放器类型沿用现有路径，不假定它们也是 Vue 2。
- `src/utils/bewlyWidescreen.ts` 与 `types.ts`：组件销毁通知与原生评论就绪事件共用 `sidebarReadyCleanup` 和原来的 RAF/导航归属，不新增轮询。

点赞、投币、收藏、分享仍由 Bilibili 原生组件与服务端处理，没有新增四套 API 控制器。顶部模糊、底部液态玻璃、侧栏排版与统一毛玻璃背景保持此前决定。

## 广告规则更新

参考本次读取的 [AdGuard Chinese Filter](https://github.com/AdguardTeam/AdguardFilters/blob/master/ChineseFilter/sections/specific.txt) 和 [EasyList China](https://github.com/easylist/easylistchina/blob/master/easylistchina.txt)，按语义适配广告反馈入口、普通/创意广告标记和 `cm.bilibili.com` 推广链接。未复制整个过滤引擎或执行远端脚本。

- `src/contentScripts/features/blockUselessFeedCards.ts`：保留一个列表 Observer，补齐迟到 class/href、广告移除和卡片复用；标记写入幂等，嵌套卡只隐藏外层槽位。
- `necessarySettingsWatchers.ts`：沿用当前路由生命周期，覆盖原版搜索结果及其 iframe 文档。
- `src/styles/blockAds.scss`：删除“缺少不感兴趣菜单即广告”和无条件隐藏右侧卡片/普通直播推荐的规则；保留明确播放页广告选择器。没有删除原生 Vue DOM，也没有按简介或标签文字过滤内容。

## 实际验证

- 最新完整 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm knip` 均退出 0；knip 保留原有 52 个未使用导出、6 个类型、4 个枚举成员提示。`pnpm dev` 的 content/inject/background 已编译成功。
- 实际模块回归覆盖 SSR 等待、已挂载根节点、销毁/替换、四种原监听保留、原位恢复、迟到内容、销毁通知与清理，以及广告标记新增/移除、正常推荐、搜索结果和原生控件保留。
- Chrome 中另用真实 Vue 2.7.16 和实际项目桥/搬运模块构造受控夹具：挂载前探测/搬运均为 false；挂载后为 true，四个测试按钮的点赞状态、投币/收藏/分享测试面板及输入草稿正常；恢复原位保留状态；销毁后拒绝空壳且槽位为空。Vue 2 仅用于临时夹具，没有添加生产依赖。这不是 Bilibili 服务端写操作验收。
- 本轮在真实 `BV1Zibx6yExR` 页面固定展开侧栏后，确认按钮存在且点击命中，但投币面板未创建；退出 Bewly 后同一失效元素也未恢复响应。测试后已回到原来的 Bewly 模式，没有确认投币、修改收藏或对外分享。
- 真实页面尚未运行本轮新增探测：DOM 中没有 `data-bew-native-component-ready` 标记。已请求用户重载开发扩展，Chrome 内部管理页被工具明确拒绝接管。因此，修复后的 Bilibili 四项真实交互、慢启动和连续切稿件仍待重载复验，不能用受控夹具宣称这些全部通过。
