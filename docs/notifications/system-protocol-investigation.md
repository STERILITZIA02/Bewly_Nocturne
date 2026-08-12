# System 通知协议调查（Stage 3B）

调查日期：2026-08-12

结论：**暂不将 `system` 切换为 Native Feed，继续使用原版 iframe。** 当前发布客户端足以确认请求路径、参数、基础条目字段和 read cursor，但在禁止使用浏览器登录态的条件下，无法取得成功响应的实际脱敏副本，也无法确认需求中描述的图片、字段模块和多按钮结构。按 Stage 3B 门禁，不猜测这些字段或注册未经验证的 renderer。

## 证据范围

- 当前 `https://message.bilibili.com/` 引用的发布 bundle：`index.716ab17b.js`
- bundle URL：`https://s1.hdslb.com/bfs/static/2233-monorepo/message-pc/static/js/index.716ab17b.js`
- SHA-256：`253a12987b20b1bd77ac6936522edae2c24b4863439dd969a8138926588f7138`
- 无 Cookie 请求实测：下述四个 endpoint 均返回 HTTP 200、JSON `code=-101`、`message=-101`；响应副本保存在 `tests/fixtures/notifications/system/api-error.json`。

本调查没有读取、保存或输出 Cookie、CSRF、通知正文或个人账号信息。

## 当前发布客户端的读取协议

所有请求均以 `https://message.bilibili.com` 为 origin，method 均为 GET。

| 流 | endpoint | 首次参数 | 返回数据职责 |
| --- | --- | --- | --- |
| `unified` | `/x/sys-msg/query_unified_notify` | `page_size=10&build=0&mobi_app=web` | 首屏统一系统通知，客户端读取 `data.system_notify_list` |
| `user` | `/x/sys-msg/query_user_notify` | `page_size=20&build=0&mobi_app=web` | 首屏用户定向系统通知，客户端读取 `data.system_notify_list` |
| `legacy` | `/x/sys-msg/query_notify_list` | `cursor=<cursor>&data_type=1&build=0&mobi_app=web` | 首屏之后的历史通知，客户端读取 `data` 数组 |

首屏并行请求 `unified` 和 `user`。发布客户端将两组条目按 `cursor` 降序合并并按 `id` 去重，然后把合并后最旧条目的 `cursor` 作为 `legacy` 首次下一页请求的 cursor。这是发布代码的明确行为，不是从本项目展示列表推测的分页规则。

`unified` 与 `user` 没有在当前客户端中继续独立翻页；它们只负责首屏来源。后续分页只属于 `legacy` 流：

```text
GET /x/sys-msg/query_notify_list
  cursor=<上一次 legacy 返回的最后一条 cursor>
  data_type=1
  build=0
  mobi_app=web
```

`legacy` 返回非空数组时，下一 cursor 取该响应最后一条的 `cursor`；返回空数组时，客户端将分页标记为结束。由于没有成功响应副本，本调查不把未被发布代码使用的 `data.cursor` 或 `has_more` 字段视为已确认协议。

## 条目结构与渲染行为

当前发布客户端实际读取的字段只有：

```text
id       唯一 ID，也是首屏跨流去重键
cursor   排序、历史分页和 read marker
title    通知标题
time_at  时间；客户端按毫秒时间构造 Date
content  正文字符串
```

当前原版 System renderer 只产生文本与链接节点：

1. 优先尝试将 `content` 解析为 JSON，并读取其中的 `web` 字符串。
2. 否则解析 `#{文案}{URL}` / `#{文案}{"URL"}` 形式的旧链接标记。
3. 也识别普通 Bilibili URL，以及 BV、av、cv、vc 标识。
4. 未识别内容按纯文本显示。

在当前 bundle 中没有发现 System 页面读取以下字段：

- 封面或图片模块；
- fields/status 模块数组；
- action/button 数组；
- 需要 POST 的 System 条目操作。

因此不能依据当前证据制作真实的 `image-notification`、`multi-action-notification` fixture，也不能注册对应 renderer。创建这些结构会违反“只注册真实 fixture 已验证模块”的门禁。

## 已读协议

首屏成功合并后，当前发布客户端发起：

```text
GET /x/sys-msg/update_cursor
  cursor=<首屏合并结果中最新一条的 cursor>
  has_up=0
  build=0
  mobi_app=web
```

页面 mounted 时客户端还会在本地调用 `syncNotifyCounts({ system: 0 })`，但服务端 read side effect 是上述 `update_cursor` GET。无 Cookie 实测只能确认该 endpoint 的登录错误响应；尚未确认成功响应结构，也未确认提交后 `sys_msg` 的最终一致性时序。因此本阶段不实现 Native read commit，也不在本地假清零。

## 错误行为

2026-08-12 的无 Cookie 实测结果：

| endpoint | HTTP | Content-Type | Bilibili code |
| --- | --- | --- | --- |
| `query_unified_notify` | 200 | `application/json; charset=utf-8` | `-101` |
| `query_user_notify` | 200 | `application/json; charset=utf-8` | `-101` |
| `query_notify_list` | 200 | `application/json; charset=utf-8` | `-101` |
| `update_cursor` | 200 | `application/json; charset=utf-8` | `-101` |

这与现有 Notification transport 的 `login-required` 分类一致。HTML、5xx 与风控分类继续由 Stage 3A 的共享 transport 处理，本调查没有伪造 System 专用响应。

## 阻断门禁

以下条件尚未满足，因此 `notificationSections.ts` 中的 `system.implementation` 必须保持 `original`：

- 成功首屏响应的实际脱敏 fixture；
- 成功下一页响应的实际脱敏 fixture；
- `update_cursor` 成功响应及 `sys_msg` 归零时序；
- 图片、字段、多按钮模块的真实结构（当前发布客户端也未读取这些结构）；
- Chrome/Firefox 登录态运行验证。

解除阻断时应重新抓取当前发布客户端的成功 Network 响应，先补齐脱敏 fixture 和失败验证，再实现 System 专用模型、独立 `legacy` cursor、read commit 与 renderer。不得从旧 Stage_2_fix 客户端复制未验证的数据模型或操作 mutation。
