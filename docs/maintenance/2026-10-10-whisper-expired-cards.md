# 私信失效卡片适配

- 核对来源：2026-10-10 原版消息中心公开客户端 `https://s1.hdslb.com/bfs/static/2233-monorepo/message-pc/static/js/index.8083b3b4.js`。
- 经用户限定授权，只读核对已打开会话的目标占位，DOM 为 `MsgVideo → ArchiveCard → 内容已失效`。未发送消息、上传或翻查其他会话，也未保存真实消息正文或标识。
- 官方 `MsgVideo` 根据 `cover` 是否存在选择 ArchiveCard 失效占位；`MsgArticle` 根据 `image_urls` 是否存在选择同一占位。
- 本地仅对可解析的对象采用此契约：类型 11 的 `cover` 缺省/null/空字符串、类型 12 的 `image_urls` 缺省/null，转换为 `expired`，界面显示本地化“消息已失效”，不显示跳转链接。类型不符、非法 JSON、不安全地址仍走 unknown；撤回状态优先，空图片数组的有效专栏仍正常展示。
- `expired-video-card.json` / `expired-article-card.json` 为根据公开客户端分支构造的最小合成 fixture，不宣称是真实接口抓包。
- 回归覆盖失效状态、撤回优先级、合法无插图专栏、非法数据与普通文本，以及实际 Vue 组件的提示/链接切换。开发产物与本地自动化验证不代替扩展重载后的实站验收。
