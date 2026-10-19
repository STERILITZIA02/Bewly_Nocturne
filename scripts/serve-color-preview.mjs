import { resolve } from 'node:path'
import process from 'node:process'

import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { createServer } from 'vite'

// Real color settings and controls, with isolated fixture storage and no account.
const root = process.cwd()
const virtual = {
  '/__color-settings.js': `import {ref} from 'vue';
export const settings=ref({theme:'dark',themeColor:'#eab308',darkModeBaseColor:'#2d2a2f',enableDarkModeTint:false,enableOledDarkMode:false,themeScheduleStart:'06:00',themeScheduleEnd:'18:00',disableFrostedGlass:false,frostedGlassBlurIntensity:20,disableShadow:false,enableSidebarCoverBlur:false,adaptToOtherPageStyles:true,videoPageDarkMode:false,useLinearGradientThemeColorBackground:false,customizeFont:'default',fontFamily:''});
export const FROSTED_GLASS_BLUR_MAX_PX=20, FROSTED_GLASS_BLUR_MIN_PX=1;`,
  '/__color-app.js': `import {ref} from 'vue'; export const useBewlyApp=()=>({mainAppRef:ref(document.body)});`,
  '/__color-preview.vue': `<script setup>
import {ref,watchEffect,nextTick,onMounted} from 'vue';
import Appearance from '/src/components/Settings/Appearance/Appearance.vue';
import Button from '/src/components/Button.vue';
import Radio from '/src/components/Radio.vue';
import Segmented from '/src/components/Settings/components/SettingsSegmentedControl.vue';
import {settings} from '/__color-settings.js';
import {resolveDarkModeBaseColor} from '/src/utils/darkModeTint.ts';
import {getThemeColorTokens,readThemeContrastSurfaces,relativeContrast} from '/src/utils/themeColor.ts';
const selected=ref('first'), checked=ref(true), report=ref('');
const colors=[['黄','#eab308'],['橙','#fb923c'],['浅绿','#a3e635'],['浅粉','#fda4af'],['深蓝','#3b82f6']];
function swatch(color){const t=getThemeColorTokens(color,settings.value.theme==='dark'); return {'--bew-accent-solid':t.theme,'--bew-on-accent-solid':t.onTheme,'--bew-theme-color':t.theme,'--bew-on-theme-color':t.onTheme};}
watchEffect(()=>{const el=document.documentElement;el.classList.toggle('dark',settings.value.theme==='dark');el.classList.toggle('oled-dark',settings.value.enableOledDarkMode&&settings.value.theme==='dark');el.style.setProperty('--bew-dark-base-color',resolveDarkModeBaseColor(settings.value));const t=getThemeColorTokens(settings.value.themeColor,settings.value.theme==='dark',readThemeContrastSurfaces(el));for(const [key,value] of Object.entries({'--bew-theme-color':t.theme,'--bew-on-theme-color':t.onTheme,'--bew-theme-foreground':t.foreground,'--bew-theme-focus-ring':t.focusRing,'--bew-switch-thumb-active':t.switchThumb}))el.style.setProperty(key,value);});
function hex(value){const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const c=canvas.getContext('2d');c.fillStyle=value;c.fillRect(0,0,1,1);return '#'+[...c.getImageData(0,0,1,1).data].slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');}
async function inspect(){await nextTick();const samples=[...document.querySelectorAll('[data-swatch]')].map(el=>{const s=getComputedStyle(el),bg=hex(s.backgroundColor),fg=hex(s.color);return {chosen:el.dataset.swatch,background:bg,foreground:fg,contrast:Number(relativeContrast(fg,bg).toFixed(2)),unchanged:bg===el.dataset.swatch};});const rootStyle=getComputedStyle(document.documentElement);report.value=JSON.stringify({mode:settings.value.theme,oled:settings.value.enableOledDarkMode,tintEnabled:settings.value.enableDarkModeTint,savedTint:settings.value.darkModeBaseColor,effectiveTint:resolveDarkModeBaseColor(settings.value),surfaces:Object.fromEntries(['--bew-bg','--bew-content-solid','--bew-selected-bg'].map(key=>[key,hex(rootStyle.getPropertyValue(key))])),samples},null,2);}
onMounted(inspect);
</script>
<template><main class="preview"><header><h1>配色验证</h1><p>实际外观设置与共享组件 · 本地独立设置 · 不连接 B 站账号</p></header>
<section class="preview-panel"><h2>主操作保留原色</h2><div class="samples"><Button v-for="[name,color] in colors" :key="color" type="primary" :style="swatch(color)" :data-swatch="color">{{name}} · {{color}}</Button></div><div class="examples"><Button type="primary">当前主题主操作</Button><Button type="secondary">次要操作</Button><Radio v-model="checked" accessible-label="示例开关"/><a href="#result" class="link">链接与关键词</a><span class="unread" aria-label="未读圆点"/></div><Segmented v-model="selected" label="中性选中面" :options="[{value:'first',label:'第一个标签'},{value:'second',label:'第二个标签'}]"/></section>
<section class="preview-panel actual-appearance"><Appearance/></section>
<section class="preview-panel" id="result"><Button @click="inspect">读取实际渲染颜色</Button><pre>{{report}}</pre></section></main></template>
<style>body{margin:0;background:var(--bew-bg);color:var(--bew-text-1);font:14px/1.5 var(--bew-fonts-ui)}*{box-sizing:border-box}.preview{max-width:1000px;margin:auto;padding:32px}.preview h1{font-size:24px;font-weight:500}.preview h2{font-size:17px;font-weight:600}.preview p{color:var(--bew-text-2)}.preview-panel{background:var(--bew-content-solid);border:1px solid var(--bew-surface-border-color);border-radius:16px;padding:24px;margin-top:20px}.samples,.examples{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-block:16px}.link{color:var(--bew-theme-foreground)}.unread{width:8px;height:8px;border-radius:50%;background:var(--bew-accent-marker)}pre{white-space:pre-wrap;font-size:12px}.actual-appearance .b-settings-item-group:not([data-settings-title="颜色"]),.actual-appearance .settings-section-heading{display:none}.bew-segment-control{max-width:380px}</style>`,
  '/__color-main.js': `import {createApp} from 'vue';import {createI18n} from 'vue-i18n';import messages from '/src/_locales/cmn-CN.yml';import App from '/__color-preview.vue';import Radio from '/src/components/Radio.vue';import Slider from '/src/components/Slider.vue';import Input from '/src/components/Input.vue';import '/src/styles/variables.scss';import '/src/styles/segmentControl.scss';import '/src/styles/segmentLiquidIndicator.scss';import 'virtual:uno.css';const app=createApp(App);app.use(createI18n({legacy:false,locale:'cmn-CN',messages:{'cmn-CN':messages}}));app.component('Radio',Radio).component('Slider',Slider).component('Input',Input);app.mount('#app');`,
}
const aliases = {
  '~/logic': '/__color-settings.js',
  '~/composables/useAppProvider': '/__color-app.js',
}
const server = await createServer({
  configFile: false,
  root,
  resolve: { alias: [...Object.entries(aliases).map(([find, replacement]) => ({ find, replacement })), { find: '~', replacement: resolve(root, 'src') }], dedupe: ['vue'] },
  plugins: [{
    name: 'color-preview',
    enforce: 'pre',
    resolveId(id) { return aliases[id] || (id in virtual ? id : undefined) },
    load(id) { return virtual[id] },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/')
          return next()
        res.setHeader('Content-Type', 'text/html')
        res.end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bewly 配色验证</title></head><body><div id="app"></div><script type="module" src="/__color-main.js"></script></body></html>')
      })
    },
  }, UnoCSS(), vue(), VueI18nPlugin({ runtimeOnly: true, compositionOnly: true, strictMessage: false, include: [resolve(root, 'src/_locales/**')] }), AutoImport({ imports: ['vue'], dts: false })],
  server: { host: '127.0.0.1', port: 4337, strictPort: true },
})
await server.listen()
server.printUrls()
