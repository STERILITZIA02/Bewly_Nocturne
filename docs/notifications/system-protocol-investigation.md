# System 通知协议证据

2026-08-16 在原版消息页采样的客户端使用 `unified + user` 首屏、单一 legacy 历史流和 `update_cursor` 已读提交。本地实现沿用此契约；采样版本不代表 Bilibili 当前线上版本。

采样 bundle：`https://s1.hdslb.com/bfs/static/2233-monorepo/message-pc/static/js/index.716ab17b.js`，SHA-256：`253a12987b20b1bd77ac6936522edae2c24b4863439dd969a8138926588f7138`。成功 fixture 为保持字段、类型、排序和游标关系的脱敏结构，不是原始响应字节副本。

## 请求

host 为 `https://message.bilibili.com`，以下 method 均为 GET。

| 职责 | endpoint | 参数 | 数据 |
| --- | --- | --- | --- |
| unified 首屏 | `/x/sys-msg/query_unified_notify` | `page_size=10&build=0&mobi_app=web` | `data.system_notify_list` |
| user 首屏 | `/x/sys-msg/query_user_notify` | `page_size=20&build=0&mobi_app=web` | `data.system_notify_list` |
| legacy 历史 | `/x/sys-msg/query_notify_list` | `cursor=<cursor>&data_type=1&build=0&mobi_app=web` | `data` 数组 |
| 已读 | `/x/sys-msg/update_cursor` | `cursor=<最新 cursor>&has_up=0&build=0&mobi_app=web` | `code=0` |

两组首屏都成功后按 cursor 降序合并、按 id 去重；最新 cursor 用于已读，最旧 cursor 用于首个历史请求。历史页以下一响应末项 cursor 继续，空数组结束，不给 unified/user 创建独立分页。

## 内容与状态

- 已证实字段为 `id / cursor / title / time_at / content`，其中时间为毫秒。ID 与 cursor 通过通知专用无损解析器保留为字符串。
- content 支持纯文本、JSON 对象内的 web 字符串、`#{文案}{URL}`、Bilibili URL 和 BV/av/cv/vc 标识。渲染为 text/link segment；非法 URL 保留为文本，不执行 HTML。
- 首屏已读提交成功后才发布 read commit，并由 `topBarStore.syncUnreadMessageState()` 对账未读。失败不直接清零本地角标。
- 图片、按钮数组和 POST action 没有该采样版本的证据，不属于此实现。

## 验证与历史限制

`tests/fixtures/notifications/system/` 覆盖两组首屏、legacy 下一页与空页、已读成功和 API 错误。`pnpm verify:notifications` 检查解析、去重、游标推进、内容降级、已读顺序和账号隔离。

采样时原版页面已经完成已读，未捕获正数 `sys_msg` 到零的完整时序。该限制是历史证据范围，不是永久关闭正常已读功能的条件。
