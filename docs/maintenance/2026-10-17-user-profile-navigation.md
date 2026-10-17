# 头像资料卡与私信定位

## 原生组件与视觉

检查了当前原站公开脚本 `https://s1.hdslb.com/bfs/seed/jinkela/commentpc/bili-comments.js`。头像使用 `bili-user-profile`，原生 `uid` 是发消息的权威目标；保留 `handleFollow`、数据读取、缓存与 hover 逻辑。

`inject/nativeUserProfile.ts` 在原生类注册前补充显隐动效与消息导航，并回补已注册类；样式通过既有 `patchCommentComponentUpdate` / `ensureCommentShadowStyle` 更新，不新增全局 DOM 轮询。动效为进入 200ms、退出 150ms，使用共享曲线与时间解析器，从头像对应位置缩放 0.97 + 透明度过渡。反向操作撤销旧动画，旧完成回调不再隐藏重新打开的资料卡；减少动态效果仅淡入淡出。

外壳使用 `--bew-popover-radius`（当前 12px）；两个操作按钮使用 36px control 高度、8px interactive 圆角和 13/18 字号。已关注 / 发消息为中性表面；未关注主按钮保留原始主题色及对应对比前景，键盘焦点使用统一中性细线。

## 消息路由与侧栏

消息按钮复用 `buildPrivateConversationUrl`，生成 `page=Notifications&notificationView=whisper&notificationTalker=<MID>&notificationSessionType=1`，通过 `_blank` 与 `noopener,noreferrer` 打开新标签页。

消息页先检查已载入会话，缺少目标时通过 `getPrivateConversationTarget` 单独读取原站 `session_detail`，保留完整会话类型与能力，再经现有转换器合入并选中。直接读取的旧会话不参与历史分页游标计算；正式分页返回它后恢复普通管理，刷新保留当前已选目标。

实站只读检查确认：存在的会话返回完整字段；尚未有会话的动态作者返回 `1000004`。当前原站 Web IM (`https://s1.hdslb.com/bfs/static/2233-monorepo/message-pc/static/js/index.beee4580.js`) 对这种目标构建 contact 条目。已在原站页面确认新联系人入口，同时再次查询仍无服务器会话。仅对此已验证返回码和合法空返回进入临时联系人路径，登录、风控、网络及异常形态仍显示错误并支持重试，不默认赋予只读会话发送权限。

临时联系人在左栏显示真实用户卡与选中状态；已有目标即使被筛选隐藏也保留一条选中入口，避免重复行。选中后仅滚动侧栏至可见，不抢走键盘焦点。切换目标、账号或离场使旧请求失效。

## 验证边界

5 项专项覆盖原生关注处理保留、精确 MID 新标签导航、动画反向取消、异常 / 缺失会话、只读能力、换号与迟到请求、旧目标不跳过分页，以及真实侧栏组件的选中 / 去重。最终 536 项 selected-p2 回归、126 项私信验证、TypeScript、相关文件 ESLint 与 diff 空白检查全部通过。后台、主内容脚本、注入脚本和主样式的开发产物均已确认更新，包含新接口、样式标记与新联系人返回码处理。

4347 为原生结构模拟，使用真实补丁和样式，导航只展示目标链接。实站只读核对发现当前运行的资料卡仍为原来的 8px 外壳 / 30px 按钮 / 3px 按钮圆角，未载入新样式标记，因此新版本最终实站验收需要扩展重载。没有发送私信、关注或取消关注。
