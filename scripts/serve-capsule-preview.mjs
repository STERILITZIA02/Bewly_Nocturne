import process from 'node:process'

import { createServer } from 'vite'

// Side-by-side capsules for tuning `--bew-corner-shape-capsule`. Every sample is
// a 9999px radius (ends sized by the height, straight top and bottom edges kept
// at any width), compared across corner shapes, heights, widths and nesting.
// The "current" column reads the real token from variables.scss.
const shapes = [
  ['round', 'round'],
  ['superellipse(1.1)', 'superellipse(1.1)'],
  ['superellipse(1.2)', 'superellipse(1.2)'],
  ['superellipse(1.3)', 'superellipse(1.3)'],
  ['当前 token', 'var(--bew-corner-shape-capsule)'],
  ['自定义（滑块）', 'var(--custom-shape)'],
]
const heights = [24, 28, 36, 44, 56]
const widths = [['短', 96], ['中', 220], ['长（搜索栏）', 520]]

const head = shapes.map(([label]) => `<th>${label}</th>`).join('')
const rows = heights.map(height => widths.map(([name, width]) => `<tr><th>${height}px · ${name}</th>${shapes.map(([, shape]) => `<td><span class="capsule" style="--h:${height}px;--w:${width}px;--shape:${shape}"></span></td>`).join('')}</tr>`).join('')).join('')
const nested = shapes.map(([label, shape]) => `<figure><div class="track" style="--shape:${shape}"><span class="thumb"></span><span>推荐</span><span>热门</span><span>直播</span></div><div class="search" style="--shape:${shape}"><span>搜索</span><span class="search__button"></span></div><figcaption>${label}</figcaption></figure>`).join('')

const html = `<!doctype html><html><head><meta charset="utf-8"><title>胶囊形状对比</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<h1>胶囊形状对比</h1>
<p>全部样本都是 <code>border-radius: 9999px</code>：两端半径等于高度一半，中间上下直边保留，不随宽度拉伸。只改 <code>corner-shape</code>。</p>
<nav><button data-mode="light">浅色</button><button data-mode="dark">深色</button><label><input id="overlay" type="checkbox"> 叠加 round 轮廓（红线）</label><label>自定义 K <input id="k" type="range" min="1" max="1.6" step="0.05" value="1.1"> <output id="k-value">1.1</output></label></nav>
<p id="support"></p>
<table><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>
<h2>参考参数（用户给定）：高 56px · border-radius 28px · superellipse(1.1) · border-box</h2>
<p>左为参考写法，右为项目写法（9999px 由浏览器钳到高度一半，同为 28px）；两者应完全重合。</p>
<div class="reference"><span class="capsule" style="--h:56px;--w:520px;--shape:superellipse(1.1);border-radius:28px"></span><span class="capsule" style="--h:56px;--w:520px;--shape:var(--bew-corner-shape-capsule)"></span></div>
<h2>嵌套（分段轨道 2px 内距、搜索框 4px 内距）</h2>
<div class="nested">${nested}</div>
</main><script type="module" src="/__capsule.js"></script></body></html>`

const script = `import css from '/src/styles/variables.scss?inline'
const style = document.createElement('style'); style.textContent = css; document.head.append(style)
const layout = document.createElement('style')
layout.textContent = \`
:root { --custom-shape: superellipse(1.1); }
body { margin: 0; background: var(--bew-bg); color: var(--bew-text-1); font: 13px/1.5 system-ui; }
main { padding: 24px; }
h1 { font-size: 22px; font-weight: 400; } h2 { font-size: 15px; font-weight: 400; margin-top: 32px; }
nav { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
nav button { font: inherit; color: inherit; background: var(--bew-fill-1); border: 0; border-radius: 9999px; padding: 6px 14px; cursor: pointer; }
table { border-collapse: separate; border-spacing: 16px 12px; margin-inline: -16px; }
th { font-weight: 400; color: var(--bew-text-2); text-align: start; white-space: nowrap; }
.capsule, .track, .search { position: relative; border-radius: 9999px; corner-shape: var(--shape); }
.capsule { display: block; box-sizing: border-box; width: var(--w); height: var(--h); background: var(--bew-fill-2); border: 1px solid var(--bew-edge-color); }
.overlay .capsule::after, .overlay .track::after, .overlay .search::after { content: ""; position: absolute; inset: -1px; border: 1px solid #ff3b30; border-radius: 9999px; corner-shape: round; pointer-events: none; }
.reference { display: flex; flex-wrap: wrap; gap: 24px; }
.nested { display: flex; flex-wrap: wrap; gap: 24px; }
figure { margin: 0; display: grid; gap: 10px; }
figcaption { color: var(--bew-text-2); }
.track { display: flex; box-sizing: border-box; height: 36px; padding: 2px; gap: 0; background: var(--bew-fill-1); }
.track > span:not(.thumb) { position: relative; display: grid; place-items: center; width: 64px; }
.thumb { position: absolute; top: 2px; bottom: 2px; left: 2px; width: 64px; border-radius: 9999px; corner-shape: var(--shape); background: var(--bew-elevated-solid); box-shadow: var(--bew-shadow-1); }
.search { display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; width: 200px; height: 36px; padding: 4px 4px 4px 14px; background: var(--bew-content-solid); border: 1px solid var(--bew-field-edge-color); color: var(--bew-text-3); }
.search__button { width: 28px; height: 28px; border-radius: 9999px; corner-shape: var(--shape); background: var(--bew-fill-2); }
\`
document.head.append(layout)
const root = document.documentElement
const mode = value => root.classList.toggle('dark', value === 'dark')
document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => mode(button.dataset.mode))
mode(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
document.querySelector('#overlay').onchange = event => document.body.classList.toggle('overlay', event.target.checked)
const k = document.querySelector('#k')
k.oninput = () => { root.style.setProperty('--custom-shape', 'superellipse(' + k.value + ')'); document.querySelector('#k-value').textContent = k.value }
const supported = CSS.supports('corner-shape', 'superellipse(1.1)')
document.querySelector('#support').textContent = supported
  ? '此浏览器支持 corner-shape：各列形状不同。当前 token = ' + getComputedStyle(root).getPropertyValue('--bew-corner-shape-capsule').trim()
  : '此浏览器不支持 corner-shape：所有列都会退回 round，请用 Chrome 139+ 对比。'
`

const server = await createServer({ configFile: false, root: process.cwd(), plugins: [{
  name: 'capsule-preview',
  resolveId(id) {
    if (id === '/__capsule.js')
      return id
  },
  load(id) {
    if (id === '/__capsule.js')
      return script
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url !== '/')
        return next()
      res.setHeader('Content-Type', 'text/html')
      res.end(html)
    })
  },
}], server: { host: '127.0.0.1', port: 4350, strictPort: true } })
await server.listen()
server.printUrls()
