# 私信会话管理与主题过渡修复

## 协议依据

读取原版消息中心公开发布的客户端脚本：
https://s1.hdslb.com/bfs/static/2233-monorepo/message-pc/static/js/index.8083b3b4.js

2026-10-11 重新只读获取 `https://message.bilibili.com/` 公开 HTML，确认仍引用以上带内容哈希的入口脚本。

本轮没有操作真实账号的置顶、免打扰、黑名单或举报。协议、状态协调和 UI 验证使用脱敏合成数据，不能替代服务器实站写入验收。

| 操作 | 原版路径与参数 |
| --- | --- |
| 读取会话 | `session_svr/v1/session_svr/session_detail`，`talker_id / session_type` |
| 置顶 | `session_svr/v1/session_svr/set_top`，`op_type=0` 置顶、`1` 取消 |
| 免打扰 | `link_setting/v1/link_setting/set_msg_dnd`，`uid` 与 `dnd_uid`（群聊为 `dnd_group_id`），`setting=1/0` 开启/关闭 |
| 推送能力及状态 | `link_setting/v1/link_setting/get_session_ss`，`talker_uid`；仅 `show_push_setting=1` 显示推送操作 |
| 推送开关 | `link_setting/v1/link_setting/set_push_ss`，`talker_uid`，`setting=1/0` 关闭/开启内容推送 |
| 黑名单 | 复用项目 `changeUserRelation(..., 5)` 与关系变更通知，再用 `getRelations` 回读 `attribute=128` |
| 用户举报 | `x/bplus/im/report/add`，`biz_code=4`、`module=607`、`accused_uid / object_id`，理由 0–6；`comment={group_id:0,msg_key:''}`；`extra.msg_keys` 为最近最多 10 条消息的原始 ID |

除用户关系 API 外，上述路径均在 `api.vc.bilibili.com`。表单使用既有后台 transport 与 CSRF。`assets/rules.json` 的规则 6 仅为上述四个新增 POST 路径设置消息站 Origin/Referer；保留原有 `send_msg`、ACK 和用户关系请求的专项规则，不自动重试写入。

原版“通知正常接收”是关闭内容推送时的说明，并非第六个独立开关。菜单保留该语义。官方助手、群聊不提供普通用户黑名单和用户举报入口；推送能力由服务器决定。

## 状态与交互

- 列表真实会话的右侧三点入口在 hover、键盘 focus-within 和触屏时可见；不为未建立会话的 transient recipient 伪造会话设置。
- 复用 `ContextMenu` 和 `Dialog`，无第二套菜单焦点/定位系统；菜单首次定位完成后才聚焦选项。
- 打开菜单只读。状态开关先提交，再回读权威状态，最后更新列表的置顶/免打扰显示。
- 已接受但未确认的请求不能再次提交；刷新必须确认目标状态，而非仅收到任意成功响应。
- 黑名单必须在确认对话框中说明影响；举报必须选择理由，其他理由最多 60 字，读取证据不 ACK、不写入普通历史缓存。提交成功后禁用重复提交。
- 换号、离开、关闭菜单或隐藏页面失效旧请求并释放临时证据 ID。已发出的请求不会伪装为可撤销操作。

## 主题与渐变

- 主题圆形动画使用 `fill: forwards`，临时禁用 CSS 过渡的样式保持到 `ViewTransition.finished`；不在内层 `Animation.finished` 时提前移除，以免旧快照回闪。
- 一次点击的目标主题固定，fallback 幂等；被取消的旧回调不能重新切换主题。
- 消息滚动绘制区延伸到左右屏幕边界，相应增加内部留白，保持头像、气泡与输入栏几何位置。

## 操作失败与菜单加载修复

用户随后确认已检查，上述操作可以正确运行；此前等待的故障诊断不再作为待完成事项。本次新增修正仅涉及视觉：举报确认窗关闭自身 `PanelTopBlur`，不改变共享 Dialog 或其他边缘模糊；选中会话的时间与名字共用主题对比前景；置顶会话在亮色下为纯白、深色/OLED 下加深，连续置顶行的接缝为直角、整组首尾保留 12px 平滑圆角，普通 hover 使用相同圆角。

- 重新核对原版公开 HTML，仍使用上方入口脚本。置顶的 `op_type`、免打扰的 `uid/dnd_uid/dnd_group_id`、推送的反向 `setting` 以及举报 payload 与当前原版调用一致；不采用网络摘要中不一致的旧接口名称和参数。
- 已确认代码缺口：新增四个写入路径未匹配消息站 Origin/Referer 规则。补齐精确域名、精确路径、POST、XHR 限定，路径尾部仅允许 query 或 URL 结束；不把整站 API 加入规则。
- 单会话管理响应只校验并传递 `talker_id/session_type/top_ts/is_dnd`，不依赖列表游标字段，不把最后一条私信正文传给菜单。目标不匹配、状态字段非法仍拒绝，不以默认值假装读取成功。
- 会话元数据、推送设置、用户关系分别读取和确认。推送读取失败不阻断其他操作；关系失败只禁用拉黑；置顶和免打扰必须取得合法详情才启用。写入后只回读该操作的权威状态，不被无关服务失败误判为写入失败。
- 失败提示保留登录、限制、网络、响应异常分类及数字 API 错误码，不记录凭证、目标 MID 或私信正文。已接受但未确认的写入仍锁定重复提交。
- 菜单初次加载直接显示已知操作和图标，只在未知开关状态的检查标记位置用 `SkeletonBlock` 占位，读取完成保持相同菜单几何。拉黑/举报确认窗关闭整窗骨架遮罩，原表单保持可读，顶部使用共享细骨架进度条；提交仍受单次写入及确认锁保护。
- 定向测试覆盖精确请求头匹配、最小状态响应、正文剥离、可选请求失败、API 错误码、权威回读和账号隔离。浏览器验证采用本地合成数据；直接读取真实会话详情的尝试被自动审批拒绝，已向用户请求针对性只读授权。在取得响应前，不把上述代码缺口宣称为本次真实失败的唯一根因，也不宣称四项真实账号写入验收通过。
