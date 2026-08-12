# System 通知协议调查（Stage 4.2）

调查日期：2026-08-12

结论：**`SYSTEM_PROTOCOL_BLOCKED`。`system` 必须继续使用原版 iframe。**

本轮已在登录态 Chrome 中重新打开当前发布的 `https://message.bilibili.com/#/system`，确认页面成功渲染系统通知，并从浏览器已观察资源中核对当前请求 URL、首屏请求、历史触发请求和 `update_cursor` 请求。但当前可用的 Chrome 审计接口不提供 XHR/fetch 响应正文导出，直接导航 API endpoint 又由浏览器以 `ERR_BLOCKED_BY_CLIENT` 拒绝。因此无法在不绕过浏览器安全边界的前提下取得成功响应副本，不能制作本阶段要求的真实脱敏 fixture，也不能确认 `sys_msg` 归零时序。

本调查没有读取、保存或输出 Cookie、CSRF、MID、通知正文或私人 URL query。

## 发布客户端指纹

- 页面：`https://message.bilibili.com/#/system`
- 发布 bundle：`index.716ab17b.js`
- bundle URL：`https://s1.hdslb.com/bfs/static/2233-monorepo/message-pc/static/js/index.716ab17b.js`
- SHA-256：`253a12987b20b1bd77ac6936522edae2c24b4863439dd969a8138926588f7138`
- Chrome：`151.0.7922.110`
- 登录态页面结果：System 列表成功渲染；未输出条目正文或账号信息

bundle URL 与 SHA-256 均与 Stage 3B 的静态调查一致。以下静态读取行为也没有变化：首屏并行请求 `unified` 与 `user`，按 `cursor` 降序合并并以 `id` 去重，历史只使用 `legacy` 流，首屏合并后提交 `update_cursor`。

## 本轮实际观察的请求

所有 System 请求均使用 GET。浏览器资源清单还记录了客户端自动附加的 `web_location`，该字段不参与当前发布 bundle 中的 System 分页状态。

| 名称 | host | path | 本轮实际观察的 query 字段 | 响应正文 |
| --- | --- | --- | --- | --- |
| unified | `message.bilibili.com` | `/x/sys-msg/query_unified_notify` | `page_size=10`, `build=0`, `mobi_app=web`, `web_location` | 未能导出 |
| user | `message.bilibili.com` | `/x/sys-msg/query_user_notify` | `page_size=20`, `build=0`, `mobi_app=web`, `web_location` | 未能导出 |
| legacy | `message.bilibili.com` | `/x/sys-msg/query_notify_list` | `cursor`, `data_type=1`, `build=0`, `mobi_app=web`, `web_location` | 未能导出 |
| update cursor | `message.bilibili.com` | `/x/sys-msg/update_cursor` | `cursor`, `has_up=0`, `build=0`, `mobi_app=web`, `web_location` | 未能导出 |
| unread | `api.vc.bilibili.com` | `/x/im/web/msgfeed/unread` | `build=0`, `mobi_app=web`, `web_location` | 未能导出 |

本轮实际进入 System 时观察到：

- `unified` 与 `user` 各发起一次首屏请求；
- 首屏完成后发起一次 `update_cursor`；
- 滚动到首屏底部后发起 `legacy` 请求；
- `legacy` 的 seed cursor 与首屏最旧条目的 cursor 一致，类型在 URL 中表现为十进制字符串；
- `update_cursor` 提交首屏合并结果最新条目的 cursor，类型在 URL 中表现为十进制字符串；
- `legacy` 请求参数仍为 `cursor + data_type=1`，与当前 bundle 一致。

为避免泄露真实通知时序，本文件不记录捕获到的 cursor 值，只记录其类型和使用关系。

## 当前发布 bundle 的字段读取与合并规则

当前 bundle 继续读取：

```text
unified.data.system_notify_list
user.data.system_notify_list
legacy.data
```

条目只读取：

```text
id       首屏跨来源去重键
cursor   排序、历史分页和已读 marker
title    标题
time_at  时间；客户端按毫秒构造 Date
content  正文字符串
```

静态确认的首屏和历史关系：

1. `unified` 与 `user` 仅作为首屏来源，不在当前客户端中独立翻页。
2. 两组首屏条目按 `cursor` 降序排列并以 `id` 去重。
3. 合并结果最旧条目的 `cursor` 作为第一次 `legacy` 请求的 seed。
4. 非空 `legacy.data` 的最后一条 `cursor` 作为下一页 cursor。
5. 空 `legacy.data` 是当前客户端使用的尾页条件。
6. 当前发布客户端没有读取额外 `has_more` 或顶层分页 cursor。

这些规则来自当前发布 bundle，并由本轮实际请求 URL 的首屏、历史和 `update_cursor` 关系再次佐证；由于响应正文缺失，尚不能作为成功 fixture 证据。

## 已读与 unread 时序

当前 bundle 的服务端已读请求保持为：

```text
GET /x/sys-msg/update_cursor
  cursor=<首屏合并结果最新条目的 cursor>
  has_up=0
  build=0
  mobi_app=web
```

本轮登录态 Network 确认该请求确实发出，也确认页面同时请求 `api.vc.bilibili.com/x/im/web/msgfeed/unread`。但是当前审计接口不能导出两者响应正文，且进入 System 前没有可审计的 unread 成功响应副本，因此以下内容仍未确认：

- `update_cursor` 成功响应的 `code` 和结构；
- 进入 System 前后的 `sys_msg` 原始值；
- `sys_msg` 是否立即归零；
- 若存在最终一致性延迟，具体延迟和是否需要第二次 unread 请求；
- 跨标签同步延迟。

不得根据页面本地 `syncNotifyCounts({ system: 0 })` 推断服务端已经归零。

## 内容格式

当前发布 renderer 仍只处理字符串内容：

1. 尝试将 `content` 解析为 JSON，并读取 `web` 字符串；
2. 解析 `#{文案}{URL}` 与 `#{文案}{"URL"}` 旧链接标记；
3. 识别普通 Bilibili URL；
4. 识别 BV、av、cv、vc 标识；
5. 其他内容按纯文本显示。

登录态页面中实际可见了纯文本、普通 Bilibili 链接和 BV 标识的渲染结果。但 DOM 渲染结果不能还原原始 `content` 字符串，因此本阶段没有为这些格式创建响应 fixture。JSON `web`、旧链接标记、av/cv/vc 的成功原始样本仍待捕获。

当前发布客户端仍未读取 `image`、`actions`、`fields` 或 module arrays；不得在 fixture 中伪造这些字段。

## 响应采集阻断

可用 Chrome 审计能力能列出已观察资源的 URL、类型和发起方式，但只允许导出字体、图片、样式表和视频文件，不支持导出 XHR/fetch 响应正文。直接把 API endpoint 作为顶层页面打开会得到 `ERR_BLOCKED_BY_CLIENT`。浏览器安全策略明确禁止通过间接脚本、原始 CDP 或替代浏览器控制面绕过该限制。

因此本轮没有：

- 保存任何未脱敏原始响应；
- 根据当前 DOM 猜测 `id`、`cursor` 或响应容器；
- 从旧 Stage_2_fix 或归档文档制造 fixture；
- 修改生产 API、页面、路由或 `system.implementation`。

## 解除门禁所需证据

以下真实、脱敏成功副本仍全部缺失：

- `unified-first.json`：`code=0`；
- `user-first.json`：`code=0`；
- `legacy-next.json`：`code=0` 且 `data` 非空；
- `legacy-empty.json`：`code=0` 且 `data` 为空；
- `update-cursor-success.json`：`code=0`；
- `unread-before.json` 与 `unread-after.json`；
- 至少一种真实原始 `content` 格式 fixture。

下一次调查需要用户在 Chrome DevTools Network 中导出上述请求的响应，或提供不含 Cookie/Authorization 的 HAR。导出后必须先在本地脱敏，再进入仓库；未经脱敏的 HAR 不得提交。只有 fixture 结构、敏感字段扫描、cursor/尾页关系和 `sys_msg` 时序全部验证后，才可输出 `SYSTEM_PROTOCOL_READY`。
