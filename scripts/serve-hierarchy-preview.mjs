import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { createServer } from 'vite'
import { compileStyleAsync, parse } from 'vue/compiler-sfc'

// Account-free fixture: real shared SFCs, production tokens and the unchanged
// Settings/Dialog style blocks. It does not load storage or extension APIs.
let surfaceStyles = ''
for (const file of ['src/components/Settings/Settings.vue', 'src/components/Dialog.vue']) {
  const filename = resolve(file)
  const { descriptor } = parse(await readFile(filename, 'utf8'), { filename })
  for (const block of descriptor.styles) {
    const result = await compileStyleAsync({ source: block.content, filename, id: 'hierarchy-fixture', scoped: false, preprocessLang: block.lang })
    if (result.errors.length)
      throw result.errors[0]
    surfaceStyles += result.code
  }
}

const html = `<!doctype html><html lang="zh-CN" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>已实施 · 文字与表面验证</title></head><body><div id="app"></div><script type="module" src="/__hierarchy.js"></script></body></html>`
const script = `
import {createApp,h,ref,provide} from 'vue';
import Group from '/src/components/Settings/components/SettingsItemGroup.vue';
import Item from '/src/components/Settings/components/SettingsItem.vue';
import Subgroup from '/src/components/Settings/components/SettingsItemSubgroup.vue';
import Section from '/src/components/Settings/components/SettingsSectionHeading.vue';
import Input from '/src/components/Input.vue';
import Select from '/src/components/Select.vue';
import CountBadge from '/src/components/CountBadge.vue';
import '/src/styles/reset.css';
import '/src/styles/variables.scss';
import '/src/styles/fonts.scss';
import '/src/styles/main.scss';
import 'virtual:uno.css';
document.body.classList.add('bewly-wrapper');
const style=document.createElement('style');style.textContent=${JSON.stringify(surfaceStyles)};document.head.append(style);
const layout=document.createElement('style');layout.textContent=
'body{margin:0;background:var(--bew-bg);color:var(--bew-text-1)}.fixture{max-width:1200px;margin:auto;padding:32px}.fixture-tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:28px}.fixture-tools button{padding:8px 12px;background:var(--bew-content-solid);border:1px solid var(--bew-separator-color);border-radius:8px}.fixture-intro{margin-bottom:24px}.fixture-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,1fr);gap:24px}.fixture-settings{background:var(--bew-elevated-alt);backdrop-filter:blur(20px);border:1px solid var(--bew-separator-color);border-radius:var(--bew-modal-radius);padding:32px}.fixture-heading{margin-bottom:24px}.fixture-description{margin:12px 0 24px}.fixture-dialog{background:var(--bew-elevated-alt-solid);border:1px solid var(--bew-separator-color);border-radius:var(--bew-modal-radius);padding:24px;box-shadow:var(--bew-shadow-2);align-self:start}.fixture-body{margin:20px 0}.fixture-label{margin:24px 0 12px}.fixture-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:24px}.fixture-actions button{padding:8px 16px;border-radius:8px;background:var(--bew-input-bg)}.fixture-actions .primary{background:#eab308;color:#000}.fixture-settings .right-content{min-width:160px}.fixture-card{margin-top:24px;padding:24px;background:var(--bew-content-solid);border:1px solid var(--bew-separator-color);border-radius:var(--bew-surface-radius)}.fixture-solid .fixture-settings{background:var(--bew-elevated-alt-solid);backdrop-filter:none} @media(max-width:760px){.fixture{padding:16px}.fixture-grid{grid-template-columns:1fr}.fixture-settings{padding:24px}.fixture-settings .right-content{min-width:0}}';document.head.append(layout);
createApp({setup(){
 const mode=ref('dark'),solid=ref(false),language=ref('zh'),query=ref(''),name=ref('草稿名称');
 const root=document.documentElement;root.style.setProperty('--bew-dark-base-color','#2b2b2b');
 provide('BEWLY_APP',{mainAppRef:ref(document.body)});
 const setMode=value=>{mode.value=value;root.classList.toggle('dark',value!=='light');root.classList.toggle('oled-dark',value==='oled');};
 const item=(title,desc,child)=>h(Item,{title,desc,rightWidth:'auto'},()=>child);
 return()=>h('main',{class:['fixture bewly-wrapper',solid.value?'fixture-solid':'']},[
 h('div',{class:'fixture-intro'},[h('h1',{class:'bew-page-heading'},'文字层级与表面 · 生产组件验证'),h('p',{class:'bew-help'},'真实组件与样式；此验证页不含原应用外壳，不修改账号或扩展设置。')]),
 h('nav',{class:'fixture-tools'},[...['light','dark','oled'].map((v,i)=>h('button',{'aria-pressed':mode.value===v,onClick:()=>setMode(v)},['浅色','深色','OLED'][i])),h('button',{'aria-pressed':solid.value,onClick:()=>{solid.value=!solid.value;root.classList.toggle('disable-frosted-glass',solid.value)}},'切换实色 / 玻璃')]),
 h('section',{class:'fixture-tools',style:'padding:20px;border-radius:12px;background:repeating-linear-gradient(105deg,#d6c7ab 0 6px,#466e7c 6px 12px,#242935 12px 18px)'},[h('span',{style:'color:#fff;background:#111;padding:4px 8px;border-radius:6px'},'未读胶囊 · 实际 CountBadge'),...[1,28,120,0].map(count=>h(CountBadge,{count}))]),
 h('div',{class:'fixture-grid'},[
 h('section',{class:'fixture-settings'},[
 h('nav',{class:'settings-breadcrumb fixture-heading','aria-label':'设置路径'},[h('span','设置'),h('span','›'),h('strong','通用')]),
 h('p',{class:'bew-help fixture-description'},'语言、交互与内容显示偏好'),
 h(Group,{title:'语言'},()=>item('界面语言','选择界面显示语言',h(Select,{options:[{value:'zh',label:'简体中文'},{value:'en',label:'English'}],modelValue:language.value,'onUpdate:modelValue':v=>language.value=v}))),
 h(Group,{title:'交互与布局',desc:'保持现有操作、尺寸与页面布局。'},()=>[
 item('历史记录搜索','内嵌输入区低于内容面，焦点仍有清楚的细线反馈。',h(Input,{modelValue:query.value,'onUpdate:modelValue':v=>query.value=v,placeholder:'输入关键词'})),
 h(Subgroup,{title:'默认显示',desc:'子分组与行标题使用同一阅读层级。'},()=>item('名称','说明按帮助文字角色排版。',h(Input,{modelValue:name.value,'onUpdate:modelValue':v=>name.value=v})))])]),
 h('aside',[
 h('section',{class:'fixture-dialog'},[h('p',{class:'dialog__title bew-subheading'},'确认更改'),h('p',{class:'dialog__description bew-help'},'普通弹窗标题与设置区块共用标题角色。'),h('p',{class:'fixture-body'},'正文保持 15/24。浮层需要从内容中分离，内部控件不会继续逐级变亮。'),h('div',{class:'fixture-actions'},[h('button','取消'),h('button',{class:'primary'},'确认')])]),
 h('section',{class:'fixture-card'},[h(Section,{title:'区块标题',desc:'来自实际 SettingsSectionHeading 组件。'}),h('p','内容面保持安静，弱化标签与正文层级清楚。')])])])]);
}}).mount('#app');
`

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: { '~': resolve('src') } },
  plugins: [vue(), AutoImport({ imports: ['vue'], dts: false }), UnoCSS(), {
    name: 'hierarchy-fixture',
    resolveId(id) {
      if (id === '/__hierarchy.js')
        return id
    },
    load(id) {
      if (id === '/__hierarchy.js')
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
  }],
  server: { host: '127.0.0.1', port: 4344, strictPort: true },
})
await server.listen()
server.printUrls()
