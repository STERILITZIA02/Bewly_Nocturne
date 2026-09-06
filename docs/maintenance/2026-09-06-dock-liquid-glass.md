# Dock 液态玻璃

在 `message_feature` 的既有未提交工作上增量实现，未提交或推送。使用 [WXperia/liquid-glass-vue](https://github.com/wxperia/liquid-glass-vue) 的公开 `GlassFilter`，锁定 `@wxperia/liquid-glass-vue@1.0.9`，沿用项目 Vue 3.5.19。

## 设置入口与行为

设置 → Bewly 组件 → Dock 栏 → Dock 玻璃材质。默认关闭；开启后替代主 Dock 和独立操作按钮的毛玻璃。提供标准/圆润/鲜明三种折射风格，以及折射强度、独立模糊半径（0–36px）、玻璃色调、色调不透明度（0–100%）、边缘色散、饱和度（0–200%）。设置搜索和四套语言同步。

模糊度直接控制 Dock 的背景模糊半径，默认 6px，对应库默认 blurAmount 的视觉管线；移除旧的全局模糊百分比字段和文案。色调可跟随明暗主题的表面色，或选择独立 HEX 颜色；不透明度为 0 时无着色、100% 时纯色覆盖。全局“关闭毛玻璃与顶栏渐变”继续优先，关闭时不挂载折射组件。

## 色块修复

上一版把半透明底色画在受 SVG 位移的 warp 上，底色也被折射、分色和裁切，形成内缩或悬浮色块。前次无嵌套检查没有覆盖均匀着色问题。

现在 warp 只采样背景，背景色为 transparent；色调放在同一表面内的独立 tint 兄弟节点，inset 为 0，与容器完全对齐，继承同一圆角，filter/backdrop-filter 均为 none。着色不受折射参数影响。库提供折射/色散等光学处理；色调和透明度由 Nocturne 表面组件组合，未虚构库的 tint API。

## 结构

- `LiquidGlassSurface.vue` 管理折射 SVG、单一背景采样层、无滤镜着色层及尺寸观察；复用 VueUse 的尺寸/销毁生命周期，没有新增轮询、鼠标跟踪或持续 RAF。
- Dock 继续拥有原有表面节点、边框、阴影、圆角、位置、收起动画及按钮。材质切换不替换 Dock 节点，指示器和按钮内容不套玻璃。
- `constants/liquidGlass.ts` 统一风格及参数范围，`storage.ts` 沿用现有设置存储与归一化；主题 tint 集中于 `variables.scss`。
- 当前使用库的 SVG 折射模式；未使用其完整容器附带的字体、定位、弹性控制和 shader 模式。Safari 未实测。
- 发行包的 ESM worker 路径写成网站根目录，Vite 会在分析统一入口时解析失败。pnpm 补丁只把该路径改为包内相对路径；补丁与 hash 纳入版本控制，不手改 node_modules，也不复制整个库。Vite 仍生成该 worker 资产，当前三种模式不会启动它。

## 首次接入时的玻璃叠加检查

实际 Chrome Dev 扩展重载、刷新 Bilibili 后，通过 DevTools 元素面板读取 DOM 和 Computed 样式（未绕过控制台粘贴保护）：

| 检查 | 结果 |
|---|---|
| 展开时精确匹配玻璃表面 | 3：主 Dock、刷新、回顶；独立并列 |
| 玻璃表面包含另一玻璃表面 | 0 |
| 主壳最终背景/旧 backdrop-filter | transparent / none |
| 独立操作按钮最终背景/旧 backdrop-filter | transparent / none |
| 默认参数下的新折射层 | blur(6px) saturate(1.4) + 库 SVG filter |

未发现新旧毛玻璃叠加。收起 hover 的旧背景也通过材质变量停用；独立操作按钮原有的普通 `filter: blur(...)` 重复路径已移除。库内部的 RGB 分色/合成属于同一光学层，不额外采样父级玻璃。

## 验证

实际库组件与编译后的真实 SCSS 回归覆盖唯一 filter ID、三种模式、尺寸变化、每表面一层 backdrop、卸载/Observer 清理；同时断言 warp 透明、tint 与 warp 为兄弟节点、tint 铺满容器和颜色/透明度响应式变化。实际 Dock 入口覆盖旧/新材质切换、节点/按钮保留、全局关闭、独立模糊、主题/自定义色调、保留自定义颜色及撤销/重做表面。

本机真实 Shadow DOM 页面实测折射、明暗、64px 收起尺寸和关闭后 SVG 移除。Bilibili 实页检查设置搜索键盘跳转、参数修改/恢复、主 Dock 与独立按钮、收起/展开、深浅主题、全局关闭提示；验收后恢复原毛玻璃偏好。

### 本次色块修复验证

- 修复前实页读数：主壳 555.5×60，内部表面与 SVG 均为 553.5×58，排除了展开尺寸失配；带 40% 透明度的底色位于 SVG 位移层内。
- 修复后独立 Chromium/真实 Shadow DOM：纯色背景上使用自定义 #cf4770、70% 不透明度，着色层分别与 648×62 长胶囊内部和 62×62 圆形内部完全对齐。着色层 filter/backdrop-filter 都为 none，warp 背景透明，每个表面只有一个背景采样层。
- 图案背景、不透明度 0%/100%、模糊度 36px、收起圆形均已检查；颜色不再变成位移后的小块，0% 时仍保留库的折射效果。
- 实际设置页面入口回归覆盖开启材质、独立模糊、自定义 HEX、透明度、切回主题后保留颜色和全局关闭提示。真实组件及编译后 CSS 回归继续保留。
- `pnpm dev` 已增量编译最新色调/模糊设置与样式，未执行生产 build。本次完整 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm knip` 均退出 0，`git diff --check` 退出 0；既有 knip warning 保留，原 stash SHA 未变。
- Mac 锁定，无法完成修复版本在原生 Chrome Dev 窗口中的扩展重载/刷新验收，已请求用户解锁；独立浏览器验证不冒充该项通过。解锁后还应检查设置中的原生颜色选择器、明暗/OLED 和 Dock 展开/收起。左右 Dock 位置、Safari 未另作实页矩阵验证。

### 收起圆球纯黑背景斑纹修复

- 在实际 `LiquidGlassSurface`、库 SVG 和 Shadow DOM 的纯黑背景中复现重复斑纹。仅隐藏光学层父节点的边框，斑纹即消失；此前父节点先绘制边框和 inset 高光，子节点的背景采样把自己的装饰再次折射进内部。
- `Dock.vue` 保留原 1px 边框的几何占位；液态玻璃启用时父节点边框透明、shadow 为 none，由光学层之后的 `::after` 绘制原描边及阴影。阴影值共用 `--dock-surface-shadow`，继续响应收起 hover、关闭发光及按钮 inactive。伪元素无背景、无滤镜、不接收事件，未新增玻璃层。关闭液态玻璃后由原节点恢复绘制。
- 未修改库滤镜、折射参数、色调设置、Dock 内容或收起状态机。实验中改变 filter/backdrop-filter 的组合未解决根因，未保留该改动。
- 独立 Chromium 页面使用实际组件和编译后的真实 Dock SCSS 验收：三种折射模式的纯黑圆球均无内部斑纹；0px 模糊、0% 着色下仍成立；有图案背景保留位移/色散。展开、收起、明暗主题、主题/自定义色及 100% 着色、36px 模糊已检查。液态模式父层 border 透明、shadow/backdrop-filter 为 none，前景描边仍为 1px；关闭后 SVG 为 0，原描边阴影恢复。
- 实际 Dock 组件回归新增编译 SCSS 检查，覆盖父层不再绘制装饰、收起态、全局关闭和恢复。JSDOM 不计算 backdrop-filter，使用匹配元素的 CSSOM 声明断言；光学结果由上述真实浏览器验收，不将 JSDOM 当作视觉验证。
- 新开的 Bilibili 桌面页面仍加载旧扩展（父层可见描边、`::after` 为 none），已请求用户在受浏览器工具限制的扩展管理页手动重载。修复版本在重载后的 Bilibili 实页验收仍待完成；未检查移动端。
- 验证结果：`pnpm verify:selected-p2`、完整 `pnpm test`、`pnpm lint`、`pnpm typecheck` 和 `pnpm knip` 退出码均为 0；knip 原有 warning 保留。现有 `pnpm dev` watcher 已编译此次 Dock 修改，未执行生产 build；未提交、未推送，原 stash SHA 不变。
