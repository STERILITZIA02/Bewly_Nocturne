# 搜索历史读取修复

用户反馈搜索历史显示读取失败，点击重试仍失败。

2026-11-11 核对 B 站公开的[原生顶栏脚本](https://s1.hdslb.com/bfs/static/laputa-header/bili-header.umd.js)：读取、搜索新增、单条删除和清空均操作当前页面的 `localStorage.search_history`，记录是含 value/timestamp 的数组。扩展此前仍读 `s1.hdslb.com` 的 COLS iframe 中的 `search_history:search_history`，既不是这份原生记录，也会额外依赖跨域页面加载与消息应答。

`src/components/SearchBar/searchHistoryProvider.ts` 改为共用原生本地记录，保留公开 Promise 接口、时间倒序、去重、20 条上限、串行修改队列和同源标签页 Web Lock。删除旧 iframe、请求 ID、监听和超时流程。读取或解析失败继续报错，不能作为空历史覆盖已有数据；新增、删除和清空的本地存储异常仍反馈失败。

存储范围与原生顶栏一致，按页面 origin 隔离。此修复没有迁移或清除旧 COLS 域中的记录，没有新建另一份扩展历史存储。

回归使用真实 provider，仅替换 Storage/Web Locks 等边界。新增“原生 key 有记录且外部文档不可用”的场景：旧实现失败，新实现能读取原生历史。保留并验证读取失败不写入、非法数据不覆盖、原生后续编辑可见、去重与容量、单条删除、清空范围、多标签页合并及锁等待取消。退役的 iframe 源码写法断言与对应传输夹具移除，不修改仍被其他功能使用的共享 iframe 消息校验。

验证：搜索历史与搜索框定向回归 10/10、`verify-targeted-fixes`、完整 typecheck、改动文件 ESLint 和 diff 空白检查通过。未运行完整测试套件或生产构建。

没有读取或改写用户浏览器里的真实搜索记录；测试中的存储全部是夹具。实站验收由用户在开发产物更新后进行。
