# System 通知协议调查

调查日期：2026-08-16

结论：当前发布客户端仍使用 `unified + user` 首屏、单一 `legacy` 历史流与 `update_cursor` 已读提交。Bewly 只按这些当前客户端已证实的字段和行为实现 Native System Feed；原版 System URL 继续作为用户主动打开的 fallback。

## 证据范围

- 调查页：`https://message.bilibili.com/#/system`
- 当前发布 bundle：`https://s1.hdslb.com/bfs/static/2233-monorepo/message-pc/static/js/index.716ab17b.js`
- bundle SHA-256：`253a12987b20b1bd77ac6936522edae2c24b4863439dd969a8138926588f7138`
- bundle 大小：`1055810` bytes
- 调查环境中原版登录态 System 时间线已成功渲染；同时以发布 bundle 中的实际调用点核对请求参数、合并、分页和已读行为。
- 当前可用的浏览器审计接口不提供原始 XHR response body 导出，因此本仓库的成功 fixture 是保留当前 schema、数值类型、排序和 cursor 关系的脱敏结构 fixture，不声称为字节级原始响应副本。

调查和 fixture 均不保存 Cookie、CSRF、MID、用户名、通知正文或私有 URL query。

## Endpoint 矩阵

所有 System 请求均以 `https://message.bilibili.com` 为 host，method 均为 `GET`。

| 职责 | endpoint | 参数 | 容器 |
| --- | --- | --- | --- |
| unified 首屏 | `/x/sys-msg/query_unified_notify` | `page_size=10&build=0&mobi_app=web` | `data.system_notify_list` |
| user 首屏 | `/x/sys-msg/query_user_notify` | `page_size=20&build=0&mobi_app=web` | `data.system_notify_list` |
| legacy 历史 | `/x/sys-msg/query_notify_list` | `cursor=<legacy cursor>&data_type=1&build=0&mobi_app=web` | `data` 数组 |
| 已读提交 | `/x/sys-msg/update_cursor` | `cursor=<首屏最新 cursor>&has_up=0&build=0&mobi_app=web` | `code=0` 成功响应 |

`unified` 和 `user` 只是两个首屏数据源，当前客户端没有分别为它们持续分页。两组请求并行完成后：

1. 按 `cursor` 降序合并；
2. 以 `id` 去重；
3. 最新条目的 `cursor` 用于 `update_cursor`；
4. 最旧条目的 `cursor` 作为第一次 legacy 历史请求边界。

legacy 响应非空时，下一 cursor 取本次响应最后一条的 `cursor`；响应 `data=[]` 时到达尾页。不从合并后的展示列表猜测 cursor，也不为 unified/user 虚构独立分页。

## 条目字段与内容格式

当前发布客户端的 System 列表实际读取：

```text
id       唯一 ID，也是首屏跨流去重键
cursor   排序、legacy 分页和已读 marker
title    标题
time_at  毫秒时间戳
content  正文字符串
```

`id` 和 `cursor` 在 Bewly transport 中通过通知专用 lossless parser 保留为 string，不转为 `Number`。

当前发布 renderer 可确认的 content 格式：

- 纯文本；
- JSON 对象中的 `web` 字符串；
- `#{文案}{URL}`；
- `#{文案}{"URL"}`；
- 普通 Bilibili URL；
- `BV` / `av` / `cv` / `vc` 标识。

Bewly 只生成 text/link segment，不使用 `v-html`。链接只允许 `http/https`；非法链接作为文本，不执行。无法解析的 JSON 或条目只降级当前条目。

当前 bundle 没有读取 System 的 image、actions、fields 或 module array，因此本次不伪造这些字段，也不实现未经证实的 POST action。

## 已读契约

System 首屏只在 unified 和 user 都是合法 `code=0` 响应后合并。有首屏条目时，再以最新 cursor 请求 `update_cursor`。只有 `update_cursor` 也返回 `code=0` 后，该首屏才交给 Native Feed，然后复用现有 read-commit 与有上限 badge reconcile，通过 `topBarStore.syncUnreadMessageState()` 重新读取权威 `sys_msg`。

不会在进入页面时直接本地清零 `sys_msg`；`update_cursor` 失败时不发布首屏成功，也不伪造已读。

本次调查时原版页在采样前已完成已读，因此没有捕获到正数 `sys_msg` 到 `0` 的完整时序，也不将这一未观察时序写成已通过。

## 脱敏 fixture 与验证

```text
tests/fixtures/notifications/system/
├── unified-first.json
├── user-first.json
├── legacy-next.json
├── legacy-empty.json
├── update-cursor-success.json
└── api-error.json
```

成功 fixture 保留了当前字段集、不安全数值 ID/cursor、跨流重复 ID、排序、legacy 非空页和空尾页；标题、正文和链接已替换。`api-error.json` 保留无 Cookie 实测的 `code=-101` 错误结构。

`pnpm verify:notifications` 覆盖 lossless ID/cursor、首屏合并去重、legacy cursor/尾页、安全 content segment、已读先后顺序、read 失败不假成功、System 独立状态与 MID generation 隔离。

## 仍未确认

- 正数 `sys_msg` 在 `update_cursor` 后归零的精确最终一致时序；
- 浏览器审计工具不可导出的原始成功 response body 字节副本；
- 当前发布客户端未读取的图片、字段、模块、多按钮或 POST action；
- Firefox 登录态运行验证。

上述未确认内容不会被推断或伪造为生产能力。
