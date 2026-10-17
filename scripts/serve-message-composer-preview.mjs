import { resolve } from 'node:path'
import process from 'node:process'

import i18n from '@intlify/unplugin-vue-i18n/vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { createServer } from 'vite'

// Real composer, tools, emote picker and shared surface; no account/API writes.
const modules = {
  '/__message-preview.scss': `@use '/src/styles/composer'; .preview-composer { @include composer.surface; position:absolute;bottom:16px;left:16px;right:16px; }`,
  '/__message-preview.js': `
import {createApp,h,provide,ref} from 'vue';import {createI18n} from 'vue-i18n';
import messages from '/src/_locales/cmn-CN.yml';
import Composer from '/src/contentScripts/views/Notifications/whisper/experimental/MessageComposer.vue';
import IconButton from '/src/components/IconButton.vue';import Tooltip from '/src/components/Tooltip.vue';import Button from '/src/components/Button.vue';import Skeleton from '/src/components/SkeletonBlock.vue';
import '/src/styles/reset.css';import '/src/styles/variables.scss';import '/src/styles/fonts.scss';import '/src/styles/main.scss';import '/__message-preview.scss';import 'virtual:uno.css';
document.documentElement.className='dark';document.documentElement.style.setProperty('--bew-dark-base-color','#2b2b2b');
const packages=[{id:'1',name:'常用表情',type:'default',emotes:[{id:'1',text:'[微笑]',url:'',size:1,type:'default',textOnly:true},{id:'2',text:'(≧∇≦)ﾉ',url:'',size:1,type:'default',textOnly:true}]}];
const app=createApp({setup(){const draft=ref(''),state=ref('ready'),image=ref(null),status=ref('');provide('BEWLY_APP',{mainAppRef:ref(document.querySelector('#root'))});
const remove=()=>{if(image.value?.objectUrl?.startsWith('blob:'))URL.revokeObjectURL(image.value.objectUrl);image.value=null;};
return()=>h('main',{class:'fixture'},[
h('h1',{class:'bew-page-heading'},'消息页 · 常驻输入栏'),h('p',{class:'bew-help'},'真实输入组件与共用磨砂样式，发送仅在本地模拟。'),
h('nav',['浅色','深色','OLED'].map((text,i)=>h('button',{onClick:()=>{document.documentElement.classList.toggle('dark',i!==0);document.documentElement.classList.toggle('oled-dark',i===2)}},text))),
h('nav',[['ready','可发送'],['pending','发送中'],['blocked','只读会话']].map(([value,label])=>h('button',{'aria-pressed':state.value===value,onClick:()=>state.value=value},label))),
h('label',[h('input',{type:'checkbox',onChange:e=>document.documentElement.classList.toggle('disable-frosted-glass',e.target.checked)}),' 关闭磨砂']),
h('section',{class:'conversation-preview'},[h('div',{class:'sample-message'},'这是一条用于查看浮层效果的本地示例消息。输入区域直接使用磨砂背景。'),h('div',{class:'sample-message self'},'多行输入时工具栏保留在底部，发送按钮保持圆形。'),h('footer',{class:'preview-composer'},[h(Composer,{
modelValue:draft.value,'onUpdate:modelValue':v=>draft.value=v,conversationKey:'fixture',sending:state.value==='pending',disabledReason:state.value==='blocked'?'当前会话不允许发送消息':'',imageDraft:image.value,enableImage:true,emotePackages:packages,
onSubmit:()=>{status.value='本地模拟发送成功：'+draft.value;draft.value='';},onSelectImage:file=>{remove();image.value={localId:'fixture',fileName:file.name,size:file.size,status:'ready',objectUrl:URL.createObjectURL(file)};},onRemoveImage:remove,onSubmitImage:()=>{status.value='本地模拟图片发送成功';remove();},onRetryImage:()=>image.value.status='ready'
})])]),h('p',{role:'status'},status.value)]);}});
app.use(createI18n({legacy:false,locale:'cmn-CN',messages:{'cmn-CN':messages}}));app.component('IconButton',IconButton);app.component('Tooltip',Tooltip);app.component('Button',Button);app.component('SkeletonBlock',Skeleton);app.mount('#root');`,
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>消息输入栏 · 本地预览</title><style>body{margin:0;background:var(--bew-bg);color:var(--bew-text-1)}.fixture{max-width:860px;padding:32px;margin:auto}.fixture nav{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.fixture nav button{font:inherit;color:inherit;border:1px solid var(--bew-border-color);border-radius:8px;padding:8px 12px}.fixture nav button[aria-pressed=true]{background:var(--bew-selected-bg)}.conversation-preview{position:relative;min-height:440px;margin-top:24px;background:var(--bew-content-solid);border-radius:var(--bew-card-radius)}.sample-message{position:absolute;left:32px;top:40px;width:65%;padding:16px;background:var(--bew-content-alt-solid);border-radius:16px}.sample-message.self{left:auto;right:32px;top:160px;background:var(--bew-selected-bg)}@media(max-width:600px){.fixture{padding:16px}.sample-message{left:16px}.sample-message.self{right:16px}}</style></head><body><div id="root" class="bewly-wrapper"></div><script type="module" src="/__message-preview.js"></script></body></html>`
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: [{ find: '~', replacement: resolve('src') }] },
  plugins: [vue(), AutoImport({ imports: ['vue'], dts: false }), UnoCSS(), i18n({ include: resolve('src/_locales/**'), strictMessage: false }), {
    name: 'message-composer-preview',
    enforce: 'pre',
    resolveId(id) {
      if (id in modules)
        return id
    },
    load(id) { return modules[id] },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/')
          return next()
        res.setHeader('Content-Type', 'text/html')
        res.end(html)
      })
    },
  }],
  server: { host: '127.0.0.1', port: 4346, strictPort: true },
})
await server.listen()
server.printUrls()
