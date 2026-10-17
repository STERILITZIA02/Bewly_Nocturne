import { resolve } from 'node:path'
import process from 'node:process'

import i18n from '@intlify/unplugin-vue-i18n/vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { createServer } from 'vite'

// Actual chart components; deterministic fixtures, no real accounts or writes.
const modules = {
  '/__chart-state.js': `import {ref,reactive} from 'vue';
export const mode=ref('dark');
export const settings=ref({themeColor:'#00a1d6'});
export const store=reactive({userInfo:{mid:1},unReadMessage:{reply:38,at:17,like:24,sys_msg:7},unReadDm:{follow_unread:23,unfollow_unread:11}});
export const samples=ref(Array.from({length:60},(_,i)=>({gainDb:-5+3*Math.sin(i/8),loudness:-18,peakReductionDb:0})));`,
  '/__chart-store.js': `import {store} from '/__chart-state.js';export const useTopBarStore=()=>store;`,
  '/__chart-logic.js': `export {settings} from '/__chart-state.js';`,
  '/__chart-dark.js': `import {computed} from 'vue';import {mode} from '/__chart-state.js';export const useDark=()=>({isDark:computed(()=>mode.value!=='light'),isOledDark:computed(()=>mode.value==='oled')});`,
  '/__chart-loudness.js': `import {ref} from 'vue';export {samples as localLoudnessSamples} from '/__chart-state.js';export const localLoudnessPanelOpen=ref(true),localLoudnessState=ref('active');export const notifyLocalLoudnessPanel=()=>{};`,
  '/__chart-main.js': `export const getCSRF=()=>'',getUserID=()=>'';`,
  '/__chart-dialog.js': `import {h} from 'vue';export default {setup:(_,ctx)=>()=>h('section',ctx.slots.default?.())};`,
  '/__chart-preferences.js': `export default {render:()=>null};`,
  '/__chart-api.js': `export default {moment:{getMomentVote:async()=>({code:0,data:{vote_info:{title:'你更常使用哪些功能？',choice_cnt:2,status:4,join_num:120,my_votes:[1],options:[{opt_idx:1,opt_desc:'收藏与稍后再看',cnt:78},{opt_idx:2,opt_desc:'消息与动态',cnt:64},{opt_idx:3,opt_desc:'搜索',cnt:0}]}}}),submitMomentVote:async()=>{throw new Error('Preview never submits votes')}}};`,
  '/__chart-preview.js': `
import {createApp,h,ref} from 'vue';import {createI18n} from 'vue-i18n';
import messages from '/src/_locales/cmn-CN.yml';
import Insights from '/src/contentScripts/views/Notifications/whisper/ConversationInsights.vue';
import Vote from '/src/components/MomentCard/MomentVote.vue';
import Loudness from '/src/components/LocalLoudnessPanel.vue';
import Curve from '/src/components/Settings/components/ShadowCurveEditor.vue';
import Skeleton from '/src/components/SkeletonBlock.vue';
import {store,mode,samples} from '/__chart-state.js';
import '/src/styles/reset.css';import '/src/styles/variables.scss';import '/src/styles/fonts.scss';import '/src/styles/main.scss';import 'virtual:uno.css';
document.documentElement.className='dark';
const day=new Date();day.setHours(12,0,0,0);
const sessions=Array.from({length:28},(_,i)=>({key:'1:'+i,talkerId:String(i+1),name:'示例会话 '+(i+1),timestamp:(day.getTime()-(i%7)*86400000)*1000,followed:i%3!==0,unreadCount:i%4,pinned:i<2,muted:i===4}));
const app=createApp({setup(){const curve=ref([{position:0,opacity:20},{position:40,opacity:65},{position:100,opacity:0}]);const scenario=ref('sample');const change=value=>{scenario.value=value;const counts=value==='zero'?[0,0,0,0]:value==='unknown'?[undefined,undefined,undefined,undefined]:value==='large'?[12345,3,750,0]:[38,17,24,7];Object.assign(store.unReadMessage,{reply:counts[0],at:counts[1],like:counts[2],sys_msg:counts[3]});Object.assign(store.unReadDm,value==='unknown'?{follow_unread:undefined,unfollow_unread:undefined}:value==='zero'?{follow_unread:0,unfollow_unread:0}:{follow_unread:23,unfollow_unread:11});};
return()=>h('main',{class:'fixture'},[
h('h1',{class:'bew-page-heading'},'数据图表 · Mono 灰阶'),h('p',{class:'bew-help'},'真实项目组件，示例数据。主题色只点亮当前读数；所有操作留在本地。'),
h('nav',[['light','浅色'],['dark','深色'],['oled','OLED']].map(([value,label])=>h('button',{onClick:()=>{mode.value=value;document.documentElement.className=value==='light'?'':value==='oled'?'dark oled-dark':'dark'}},label))),
h('nav',[['sample','示例数据'],['zero','全部为零'],['unknown','尚未读取'],['large','悬殊数值']].map(([value,label])=>h('button',{'aria-pressed':scenario.value===value,onClick:()=>change(value)},label))),
h(Insights,{sessions:scenario.value==='zero'||scenario.value==='unknown'?[]:sessions,loaded:scenario.value!=='unknown'}),
h('section',{class:'support-grid'},[
h('article',{class:'support-card'},[h('h2','动态投票 · 独立比例'),h(Vote,{voteId:'1',momentId:'1',fallbackTitle:'示例投票',fallbackEndTime:1})]),
h('article',{class:'support-card'},[h('h2','响度 · 实时增益'),h(Loudness),h('button',{onClick:()=>samples.value=samples.value.length?[]:Array.from({length:60},(_,i)=>({gainDb:-5+3*Math.sin(i/8),loudness:-18,peakReductionDb:0}))},'切换空采样')]),
h('article',{class:'support-card'},[h('h2','阴影 · 控制曲线'),h(Curve,{modelValue:curve.value,'onUpdate:modelValue':v=>curve.value=v})])])]);}});
app.use(createI18n({legacy:false,locale:'cmn-CN',messages:{'cmn-CN':messages}}));app.component('SkeletonBlock',Skeleton);app.mount('#root');`,
}
const aliases = {
  '~/stores/topBarStore': '/__chart-store.js',
  '~/logic': '/__chart-logic.js',
  '~/composables/useDark': '/__chart-dark.js',
  '~/composables/useLocalLoudness': '/__chart-loudness.js',
  '~/utils/main': '/__chart-main.js',
  '~/utils/api': '/__chart-api.js',
  '~/components/Dialog.vue': '/__chart-dialog.js',
  '~/components/LocalLoudnessPreferences.vue': '/__chart-preferences.js',
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>数据图表 · Mono 预览</title><style>body{background:var(--bew-bg);color:var(--bew-text-1)}.fixture{max-width:1080px;margin:auto;padding:24px}.fixture nav{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.fixture nav button,.support-card>section>button{font:inherit;color:inherit;padding:8px 12px;border:1px solid var(--bew-border-color);border-radius:8px}.fixture nav button[aria-pressed=true]{background:var(--bew-selected-bg)}.fixture .conversation-insights{height:auto;padding:8px 0}.support-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 4px}.support-card{min-width:0;padding:16px;border:1px solid var(--bew-message-card-border);border-radius:var(--bew-card-radius)}.support-card h2{font-size:var(--bew-font-size-title);font-weight:400;margin:0 0 16px}.support-card .moment-vote{padding:0}.support-card button{color:inherit}.fixture .shadow-curve-editor{max-width:100%}@media(max-width:720px){.fixture{padding:16px}.support-grid{grid-template-columns:1fr}}</style></head><body><div id="root" class="bewly-wrapper"></div><script type="module" src="/__chart-preview.js"></script></body></html>`
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: [...Object.entries(aliases).map(([find, replacement]) => ({ find, replacement })), { find: '~', replacement: resolve('src') }] },
  plugins: [vue(), UnoCSS(), i18n({ include: resolve('src/_locales/**'), strictMessage: false }), {
    name: 'chart-preview',
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
  server: { host: '127.0.0.1', port: 4348, strictPort: true },
})
await server.listen()
server.printUrls()
