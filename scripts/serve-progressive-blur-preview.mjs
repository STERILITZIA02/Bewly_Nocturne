import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { createServer } from 'vite'
import { compileStyleAsync, parse } from 'vue/compiler-sfc'

// Use the real menu styles and ProgressiveBlur component. No account or API calls.
const filename = resolve('src/components/VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue')
const { descriptor } = parse(await readFile(filename, 'utf8'), { filename })
let css = ''
for (const block of descriptor.styles) {
  const result = await compileStyleAsync({ source: block.content, filename, id: 'data-v-blur-preview', scoped: false, preprocessLang: block.lang, preprocessOptions: { loadPaths: [dirname(filename)] } })
  if (result.errors.length)
    throw result.errors[0]
  css += result.code
}
css += `
body { margin: 0; background: var(--bew-bg); color: var(--bew-text-1); font: 14px/1.5 system-ui; }
main { padding: 24px; } h1 { font-size: 22px; }
nav { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 24px; }
nav button, nav input { font: inherit; }
nav button { padding: 8px 12px; border: 1px solid var(--bew-separator-color); border-radius: 8px; background: var(--bew-elevated); color: inherit; }
.cases { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; }
.scene { position: relative; padding: 40px 24px; background: repeating-conic-gradient(#dfb873 0 25%, #38546f 0 50%) 0/80px 80px; }
.scene .context-menu-container { position: relative; width: 100%; height: 320px; max-height: none; z-index: 0; }
.probe { height: 80px; background: repeating-linear-gradient(to right, #fff 0 2px, #111 2px 4px); }
.context-menu-item { display: flex; align-items: center; appearance: none; background: transparent; border: 0; color: inherit; }
.description { min-height: 44px; }
/* Deliberate negative controls: the regression scanner rejects these in src/. */
.broken .context-menu-container { overflow: hidden; }
.transparent .bew-progressive-blur__layer { mask-image: linear-gradient(transparent, transparent) !important; }
.radial-scene { position: relative; height: 400px; background: repeating-linear-gradient(to right, #fff 0 2px, #111 2px 4px); }
.radial-blur { inset: 0; }
@media (max-width: 900px) { .cases { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`
const template = `
<main>
  <h1>渐变模糊 · 圆角裁切回归验证</h1>
  <nav>
    <button @click="theme('light')">浅色</button>
    <button @click="theme('dark')">深色</button>
    <button @click="theme('oled')">OLED</button>
    <label>强度 <input aria-label="模糊强度" type="range" min="2" max="40" v-model.number="strength"> {{strength}}px</label>
    <button @click="hidden = !hidden">切换边缘</button>
    <button @click="settings.disableFrostedGlass = !settings.disableFrostedGlass">切换毛玻璃</button>
  </nav>
  <div class="cases">
    <section v-for="[key, label] in cases" :key="key" :class="key">
      <p class="description">{{label}}</p>
      <div class="scene">
        <div class="context-menu-container bew-popover-surface">
          <ul class="context-menu-list" :aria-label="label" tabindex="0">
            <li class="probe" role="img" aria-label="高对比条纹" />
            <li v-for="i in 16"><button class="context-menu-item">{{i}} ⊕ 渐变模糊 Scroll edge</button></li>
          </ul>
          <ProgressiveBlur class="context-menu-edge context-menu-edge--top" edge="top" :radius="radius" :visible="!hidden" />
          <ProgressiveBlur class="context-menu-edge context-menu-edge--bottom" edge="bottom" :radius="radius" :visible="!hidden" />
        </div>
      </div>
    </section>
    <section>
      <p class="description">卡片居中模糊 · 四周自然归零</p>
      <div class="radial-scene"><ProgressiveBlur class="radial-blur" edge="center" :radius="radius" :visible="!hidden" /></div>
    </section>
  </div>
</main>`
const script = `
import { computed, createApp, ref, watch } from 'vue';
import ProgressiveBlur from '/src/components/ProgressiveBlur.vue';
import { settings } from 'blur-preview-settings';
import '/src/styles/variables.scss';
import '/src/styles/popover.scss';
import '/__blur-preview.css';
createApp({ components: { ProgressiveBlur }, template: ${JSON.stringify(template)}, setup() {
  const strength = ref(20), hidden = ref(false);
  const radius = computed(() => strength.value + 'px');
  function theme(mode) {
    document.documentElement.classList.toggle('dark', mode !== 'light');
    document.documentElement.classList.toggle('oled-dark', mode === 'oled');
  }
  watch(() => settings.value.disableFrostedGlass, value => document.documentElement.classList.toggle('disable-frosted-glass', value));
  theme('dark');
  return { settings, strength, radius, hidden, theme, cases: [
    ['fixed', '修复结构 · 渐变自然归零'],
    ['broken', '错误对照 · 外层平滑圆角裁切'],
    ['transparent', '透明遮罩对照 · 应完全清晰']
  ] };
} }).mount('#app');`
const html = '<!doctype html><html><head><meta charset="utf-8"><title>渐变模糊验证</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><script type="module" src="/__blur-preview.js"></script></body></html>'

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: [{ find: 'vue', replacement: resolve('node_modules/vue/dist/vue.esm-bundler.js') }, { find: '~/logic', replacement: 'blur-preview-settings' }, { find: '~', replacement: resolve('src') }] },
  plugins: [vue(), AutoImport({ imports: ['vue'], dts: false }), {
    name: 'progressive-blur-preview',
    resolveId(id) {
      if (['/__blur-preview.js', '/__blur-preview.css', 'blur-preview-settings'].includes(id))
        return id
    },
    load(id) {
      if (id === '/__blur-preview.js')
        return script
      if (id === '/__blur-preview.css')
        return css
      if (id === 'blur-preview-settings')
        return `import { ref } from 'vue'; export const settings = ref({ disableFrostedGlass: false });`
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/')
          return next()
        res.setHeader('Content-Type', 'text/html')
        res.end(html)
      })
    },
  }],
  server: { host: '127.0.0.1', port: 4349, strictPort: true },
})
await server.listen()
server.printUrls()
