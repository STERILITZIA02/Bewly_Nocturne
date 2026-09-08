# 2026-09-08 私信交互与输入栏

本轮继续 `message_feature`，保留此前未提交的首页、骨架、原生标签和 i18n 修复。未提交或推送。

## 修改

- 分类栏按真实内容宽度布局，受视口限制后才横向滚动；未读徽标不再占固定 32px 空位，数字出现时自然扩宽。保留单一 TopBar 未读来源、液态分段指示器与激活项滚动定位。
- 会话先沿既有几何展开；展开结束后才读取历史。透明容器保留滚动边缘渐变模糊，历史使用短距离渐现，减少动画设置下直接呈现。初始化的 latest 定位不再触发立即收起，显式返回最新消息仍保留原有收起行为。旧会话未完成的展开、刷新和发送回调不会影响新视图。
- 左侧使用实色深色基准色，浅色使用实色内容表面。底部输入栏使用既有 `vLiquidGlass`，所有持久化材质参数和禁用开关共用；普通消息气泡和表情 Pop 不挂载滤镜。
- 表情选择目录与历史 `e_infos` 分开归属：前者按账号从原生用户表情面板读取，后者继续供聊天历史渲染。保留服务端返回的完整可用包，包括默认、已安装/已购/收藏包与颜文字；不从历史里猜测用户拥有哪些表情。只有打开选择器才加载目录，重复打开复用页面缓存，换号或离页清空。
- 公开现有图片 Composer 入口。选图/粘贴只生成本地预览，明确发送后才上传；保留上传取消、重试与 URL 释放。原生限制为 PNG/JPEG/GIF、20 MiB，普通私信 GIF 上限 1 MiB。服务端接受后进行有上限的历史回读；未确认时仅重试对账，不重复发送，确认后才更新会话摘要。

## 协议依据

读取当前[原生消息客户端](https://s1.hdslb.com/bfs/static/2233-monorepo/message-pc/static/js/index.072ddb26.js)及其[表情组件](https://s1.hdslb.com/bfs/seed/water-ui/common/bili-emoji-picker.js)：

- 表情：`x/emote/user/panel/web?business=reply`，复用已有 `api.moment.getMomentEmotes` transport 参数；按返回包展示，类型 4 是颜文字，其余以文字 token 插入，发送继续使用现有 `new_face_version`。
- 图片：`x/dynamic/feed/draw/upload_bfs`，`file_up` 与 `biz=im`；发送 type 2，内容包含 URL、尺寸、imageType、size、original。沿用当前后台签名、CSRF 和发送端点。

新增入口由本轮用户明确要求，取代旧记录中隐藏图片入口的阶段性产品限制；原有风控负向 fixture、失败状态和服务端对账断言继续保留。没有自动向真实联系人发送测试消息。

## 验证记录

- 真实组件回归：先展开后请求、展开期间刷新、快速换会话、卸载、迟到历史、初始 latest 不收起、浮现前不 ACK；表情目录 single-flight、换号、离页与失败重试；真实 Picker/Composer 的已购包插入、选区恢复、IME 和图片显式提交。
- 原有图片回归继续覆盖上传失败、发送失败、历史对账失败、取消、换号与 URL 释放；对账测试将服务端可见性延迟覆盖到全部四次有上限回读，仍要求不能重传。
- 本机浏览器使用真实 Nav、ConversationView、Composer、PrivateMessageItem、材质组件及页面样式，API 返回受控样本。1440×900 桌面下未读变化使导航从 494.33px 增至 575.77px，内部 567.77px 加两侧各 4px，完整容纳 3 / 99+ / 5 / 12。展开后的历史容器背景透明且无 backdrop，左侧 `rgb(42,45,50)` 无 backdrop，底部仅一套液态表面；关闭材质后液态节点为 0，输入栏回到普通模糊。浅色着色白、OLED 着色黑。该验证不代替真实账号发送验收。
- 当前分支 `pnpm dev` 首轮完整 content/inject/background 编译成功，日志 `/tmp/bewly-message-dev.log`；未执行生产 build。原来另一个 worktree 的开发进程未改动。
- 最终源码 `pnpm lint`、`pnpm typecheck`、完整 `pnpm test` 均退出 0；`pnpm knip` 退出 0，仍报告 52 个 unused exports、6 个 unused exported types、4 个 unused enum members。`git diff --check` 退出 0。
- 最后一轮浏览器复核：18 条真实组件消息、8 条处于可见区域，结束后 `entryPhase=ready`、`history-open`、历史骨架 0、未结束的浮现标记 0、液态表面 1；控制台未捕获 error。临时服务器/标签页已关闭，桌面尺寸覆盖已恢复。
- 实站重载、账号实际表情目录以及真实图片上传/接收结果仍待验收。访问用户表情 JSON 的浏览器导航被 `ERR_BLOCKED_BY_CLIENT` 阻止，未绕过。当前没有把接口结构核对或本地 fixture 写成实站通过。
