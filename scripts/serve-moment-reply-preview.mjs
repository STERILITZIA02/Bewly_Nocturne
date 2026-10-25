import { resolve } from 'node:path'
import process from 'node:process'

import i18n from '@intlify/unplugin-vue-i18n/vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { createServer } from 'vite'

// All writes and account data are fixtures. The editor, pickers, positioning,
// translations and production styles are the real components under review.
const modules = {
  '/__reply-api.ts': `export default { moment: {
getMomentComments:async()=>(await new Promise(resolve=>setTimeout(resolve,120)),{code:0,data:{page:{num:1,count:12,size:20},replies:Array.from({length:12},(_,i)=>({rpid_str:String(100+i),root_str:'0',parent_str:'0',rcount:0,member:{mid:'123',uname:i===11?'最后一条评论':'示例用户 '+(i+1)},content:{message:i===11?'滚动到底部后，这条评论和回复按钮应该完整出现在输入框上方。':'这是用于校验滚动的示例评论。输入框固定在卡片内，切换回复对象时保留已经输入的草稿。',pictures:i===1?[{img_src:'http://127.0.0.1:4345/fixture-wide.svg',img_width:640,img_height:360}]:i===2?[{img_src:'http://127.0.0.1:4345/fixture-portrait.svg',img_width:320,img_height:640}]:i===3?[{img_src:'http://127.0.0.1:4345/fixture-small.svg',img_width:64,img_height:64}]:i===4?Array.from({length:3},()=>({img_src:'http://127.0.0.1:4345/fixture-wide.svg',img_width:640,img_height:360})):[]},ctime:1780000000}))}}),
getMomentEmotes:async()=>({code:0,data:{packages:[{id:1,text:'常用表情',type:4,emote:[{id:1,text:'(≧∇≦)ﾉ',type:4},{id:2,text:'[微笑]',type:4}]}]}}),
searchMomentReplyMentions:async()=>({code:0,data:{groups:[{items:[{mid:'123',name:'示例用户'},{mid:'456',name:'测试账号'}]}]}}),
searchMomentMentions:async()=>({code:0,data:{groups:[{items:[{uid:'123',name:'示例用户'},{uid:'456',name:'测试账号'}]}]}}),
searchMomentTopics:async()=>({code:0,data:{topic_items:[{id:'42',name:'示例话题'}]}}),
checkMomentCreate:async()=>({code:0}),
createMoment:async payload=>{document.querySelector('#request').textContent=JSON.stringify({...payload,csrf:'[fixture]'},null,2);return {code:0,data:{dyn_id_str:'999'}}},
uploadMomentReplyImage:async()=>({code:0,data:{image_url:'https://i0.hdslb.com/bfs/fixture.png',image_width:64,image_height:64,img_size:1}}),
submitMomentReply:async payload=>{document.querySelector('#request').textContent=JSON.stringify({...payload,csrf:'[fixture]'},null,2);return {code:0,data:{reply:{rpid_str:'999',root_str:payload.root||'0',parent_str:payload.parent||'0',member:{mid:'1',uname:'本地测试'},content:{message:payload.message},ctime:1}}}}
}};`,
  '/__reply-store.ts': `import {reactive} from 'vue'; const store=reactive({isLogin:true,userInfo:{mid:'1'}}); export const useTopBarStore=()=>store;`,
  '/__reply-main.ts': `export const getUserID=()=> '1'; export const getCSRF=()=> 'fixture'; export const removeHttpFromUrl=url=>url;`,
  '/__reply-image-utils.ts': `export const getMomentThumbnailUrl=url=>url.replace('https://127.0.0.1:4345/','http://127.0.0.1:4345/');export const getAvatarThumbnailUrl=url=>url;`,
  '/__reply-toast.ts': `export const useToast=()=>({error:message=>document.querySelector('#status').textContent=message,success:()=>document.querySelector('#status').textContent='本地模拟成功：未向 B 站发布'});`,
  '/__reply-i18n.ts': `import {createI18n} from 'vue-i18n';import messages from '/src/_locales/cmn-CN.yml';export const i18n=createI18n({legacy:false,locale:'cmn-CN',messages:{'cmn-CN':messages}});`,
  '/__reply.js': `
import {createApp,h,provide,ref,watch,onBeforeUnmount} from 'vue';
import {useMeasuredDisclosure} from '/src/composables/useMeasuredDisclosure.ts';
import {i18n} from '/__reply-i18n.ts';
import Comments from '/src/components/MomentCard/MomentCommentSection.vue';
import Forward from '/src/components/MomentCard/MomentForwardComposer.vue';
import {createMomentForwardTransactions,MOMENT_FORWARD_TRANSACTIONS} from '/src/components/MomentCard/momentForwardTransactions.ts';
import Skeleton from '/src/components/SkeletonBlock.vue';
import '/src/styles/reset.css';import '/src/styles/variables.scss';import '/src/styles/fonts.scss';import '/src/styles/main.scss';import '/src/styles/segmentControl.scss';import '/src/styles/momentDisclosure.scss';import 'virtual:uno.css';
document.documentElement.className='dark';document.documentElement.style.setProperty('--bew-dark-base-color','#2b2b2b');
const app=createApp({setup(){const open=ref(true),shown=ref(true),mode=ref('comments'),outer=ref(null),inner=ref(null),diagnostics=ref('展开或收起后显示本地测量。');provide('BEWLY_APP',{mainAppRef:ref(document.querySelector('#root'))});
const transactions=createMomentForwardTransactions(()=>1,()=>{});provide(MOMENT_FORWARD_TRANSACTIONS,transactions);onBeforeUnmount(transactions.dispose);
const toggle=kind=>{if(mode.value===kind)open.value=!open.value;else{mode.value=kind;open.value=true;shown.value=true;}};
let frame=0;let samples=[];let opening=true;
const sample=time=>{samples.push({time,height:outer.value?.getBoundingClientRect().height||0,direction:open.value});frame=requestAnimationFrame(sample);};
const motion=useMeasuredDisclosure(outer,inner,open,()=>shown.value=false,moving=>{cancelAnimationFrame(frame);if(moving){samples=[];opening=open.value;frame=requestAnimationFrame(sample);}else{const reversed=samples.slice(1).filter((s,i)=>s.direction===samples[i].direction&&(s.direction?s.height<samples[i].height-1:s.height>samples[i].height+1)).length;diagnostics.value=JSON.stringify({opening,frames:samples.length,heightReversals:reversed,finalHeight:outer.value?.getBoundingClientRect().height},null,2);}});
watch(open,value=>{if(value)shown.value=true;});onBeforeUnmount(()=>cancelAnimationFrame(frame));
return()=>h('main',{class:'bewly-wrapper fixture'},[
h('h1',{class:'bew-page-heading'},'动态卡片 · 常驻评论框'),h('p',{class:'bew-help'},'真实评论区与输入组件；所有发布与上传均为本地模拟。'),
h('nav',['浅色','深色','OLED'].map((text,i)=>h('button',{onClick:()=>{document.documentElement.classList.toggle('dark',i!==0);document.documentElement.classList.toggle('oled-dark',i===2)}},text))),
h('details',[h('summary','预览检查选项'),h('label',[h('input',{type:'checkbox',onChange:e=>document.documentElement.classList.toggle('disable-frosted-glass',e.target.checked)}),' 关闭磨砂'])]),
h('article',{class:'card'},[h('div',{class:'card-content'},[h('header','示例作者 · 刚刚'),h('p','评论与转发共用磨砂输入框。表情、@ 和话题面板可以伸出卡片，提交仅在本地模拟。'),h('div',{class:'actions'},['comments','forward'].map(kind=>h('button',{onClick:()=>toggle(kind),'aria-expanded':open.value&&mode.value===kind},(open.value&&mode.value===kind?'收起':'展开')+(kind==='comments'?'评论':'转发'))))]),h('div',{ref:outer,class:['moment-card__disclosure',{'is-open':open.value}],style:{height:motion.height.value===undefined?undefined:motion.height.value+'px'},inert:!open.value,'aria-hidden':!open.value,onTransitionend:motion.onTransitionEnd,onTransitioncancel:motion.onTransitionEnd},[h('div',{ref:inner,class:'moment-card__disclosure-inner'},shown.value?(mode.value==='comments'?h(Comments,{active:open.value,moment:{id:'987654321',commentId:'987654321',commentType:17,commentCount:12}}):h(Forward,{active:open.value,autofocus:false,moment:{id:'987654321',forwardCount:0},onClose:()=>open.value=false})):null)])]),
h('p',{id:'status',role:'status'}),h('details',[h('summary','查看本地模拟提交内容'),h('pre',{id:'request'},'尚未提交')]),h('details',[h('summary','展开动画诊断'),h('pre',{id:'motion-diagnostics'},diagnostics.value)])]);}});
app.use(i18n);app.component('SkeletonBlock',Skeleton);app.mount('#root');`,
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>动态回复 · 本地验证</title><style>body{background:var(--bew-bg);color:var(--bew-text-1);margin:0}#root{font-family:system-ui}.fixture{padding:32px;max-width:900px;margin:auto}.fixture>nav,.actions{display:flex;gap:12px;margin:16px 0}.fixture>nav button,.actions button{font:inherit;color:inherit;padding:8px 12px;background:var(--bew-input-bg);border:1px solid var(--bew-separator-color);border-radius:8px;cursor:pointer}.card{overflow:hidden;background:var(--bew-content-solid);border:1px solid var(--bew-separator-color);border-radius:var(--bew-surface-radius);max-width:560px;margin:24px auto}.card-content{padding:16px}.card-content>p{margin-top:12px}.card-content header{color:var(--bew-text-2)}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:600px){.fixture{padding:16px}}</style></head><body><div id="root" class="bewly-wrapper"></div><script type="module" src="/__reply.js"></script></body></html>`
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: [
    { find: '~/utils/api', replacement: '/__reply-api.ts' },
    { find: '~/stores/topBarStore', replacement: '/__reply-store.ts' },
    { find: '~/utils/main', replacement: '/__reply-main.ts' },
    { find: '~/utils/i18n', replacement: '/__reply-i18n.ts' },
    { find: 'vue-toastification', replacement: '/__reply-toast.ts' },
    { find: '~', replacement: resolve('src') },
  ] },
  plugins: [vue(), AutoImport({ imports: ['vue'], dts: false }), UnoCSS(), i18n({ include: resolve('src/_locales/**'), strictMessage: false }), {
    name: 'moment-reply-preview',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === './utils' && /MomentComment(?:Media|Section)\.vue$/.test(importer ?? ''))
        return '/__reply-image-utils.ts'
      if (id in modules)
        return id
    },
    load(id) { return modules[id] },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const fixtureSizes = { '/fixture-wide.svg': [640, 360], '/fixture-portrait.svg': [320, 640], '/fixture-small.svg': [64, 64] }
        if (req.url in fixtureSizes) {
          const [width, height] = fixtureSizes[req.url]
          res.setHeader('Content-Type', 'image/svg+xml')
          res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#638384"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="#b5c5c0"/></svg>`)
          return
        }
        if (req.url !== '/')
          return next()
        res.setHeader('Content-Type', 'text/html')
        res.end(html)
      })
    },
  }],
  server: { host: '127.0.0.1', port: 4345, strictPort: true },
})
await server.listen()
server.printUrls()
