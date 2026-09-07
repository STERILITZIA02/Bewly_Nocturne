import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { createServer } from 'vite'

// A desktop browser fixture, not a Bilibili performance score. Both grids use
// the same lightweight leaf card; only the real grid implementation differs.
const root = process.cwd()
const baseline = execFileSync('git', ['show', '118f6d8:src/components/VideoCardGrid.vue'], { encoding: 'utf8' })
const virtual = {
  '/__baseline.vue': baseline,
  '/__settings.js': `import {ref} from 'vue'; export const settings=ref({gridColumns:{base:6,sm:6,md:6,lg:6,xl:6,xxl:6},videoCardLayout:'modern',autoSwitchListLayout:false,videoCardCoverRatioOneColumn:40,videoCardCoverRatioTwoColumns:50}); export const originalSettings=settings.value;`,
  '/__editing.js': `import {ref} from 'vue'; export const isLayoutEditing=ref(false);`,
  '/__shadow.js': `import {ref} from 'vue'; export const useVideoCardShadowStyle=()=>({shadowStyleVars:ref({})});`,
  '/__emitter.js': `export default {on(){},off(){}};`,
  '/__loading.vue': `<template><div /></template>`,
  '/__benchmark.js': `
import {createApp,h,ref,computed,onMounted,onBeforeUnmount,nextTick} from 'vue';
import Current from '/src/components/VideoCardGrid.vue';
import Baseline from '/__baseline.vue';
import '/src/styles/gridLayout.scss';
let mounted=0;
const samples=[];
const tasks=[];
const observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));
observer.observe({type:'longtask',buffered:true});
const mode=ref('none');
const busy=ref(false);
const output=ref('Choose a grid. 5,000 fixed items; identical 180px leaf cards.');
const viewport=ref(null);
const items=Array.from({length:5000},(_,id)=>({id:id+1,title:'Fixture '+(id+1)}));
const card={props:['video','persistentState'],setup(props,{expose}){
onMounted(()=>mounted++);onBeforeUnmount(()=>mounted--);
expose({canRecycle:computed(()=>true)});
return()=>h('article',{class:'fixture-card','data-id':props.video.id},[h('span',props.video.title),h('button','Focus')]);}};
const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
async function measure(name,action){
busy.value=true;const start=performance.now();const taskStart=tasks.length;
await action();await nextTick();await frame();await new Promise(resolve=>setTimeout(resolve,100));
const data={name,mode:mode.value,items:items.length,mounted,slots:document.querySelectorAll('.video-card-slot').length,dom:document.querySelector('#viewport').querySelectorAll('*').length,scrollTop:viewport.value.scrollTop,elapsedMs:Math.round(performance.now()-start),longTasks:tasks.slice(taskStart),viewport:[innerWidth,innerHeight]};
samples.push(data);output.value=JSON.stringify(samples,null,2);busy.value=false;
}
async function select(value){mode.value='none';await nextTick();viewport.value.scrollTop=0;await measure('mount',async()=>{mode.value=value;});}
async function scroll(){await measure('scroll',async()=>{for(let i=0;i<60;i++){viewport.value.scrollTop+=700;await frame();}});}
async function release(){await measure('unmount',async()=>{mode.value='none';});}
const app=createApp({setup:()=>()=>h('main',[
h('h1','Card window browser fixture'),
h('p','Real baseline/current VideoCardGrid; identical synthetic leaf cards. No production FPS or heap claim.'),
h('nav',[h('button',{disabled:busy.value,onClick:()=>select('baseline')},'Baseline 118f6d8'),h('button',{disabled:busy.value,onClick:()=>select('current')},'Current'),h('button',{disabled:busy.value||mode.value==='none',onClick:scroll},'Scroll 60 screens'),h('button',{disabled:busy.value,onClick:release},'Unmount')]),
h('section',{id:'viewport',ref:viewport},mode.value==='none'?[]:[h(mode.value==='baseline'?Baseline:Current,{items,gridLayout:'adaptive',noMoreContent:true,transformItem:i=>i,getItemKey:i=>i.id})]),
h('pre',{id:'results'},output.value)
])});
app.component('VideoCard',card).component('Empty',{render:()=>null}).component('Button',{render:()=>null});
app.config.globalProperties.$t=k=>k;
app.provide('BEWLY_APP',{scrollViewportRef:viewport,isHomeTabSwitching:ref(false)});
app.mount('#app');
`,
}

const aliases = {
  '~/logic': '/__settings.js',
  '~/logic/layoutEdit': '/__editing.js',
  '~/composables/useVideoCardShadowStyle': '/__shadow.js',
  '~/utils/mitt': '/__emitter.js',
  './SmoothLoading.vue': '/__loading.vue',
}
const server = await createServer({
  configFile: false,
  root,
  resolve: {
    alias: [...Object.entries(aliases).map(([id, replacement]) => ({ find: new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), replacement })), { find: '~', replacement: resolve(root, 'src') }],
    dedupe: ['vue'],
  },
  plugins: [{
    name: 'card-window-browser-fixture',
    enforce: 'pre',
    resolveId(id) {
      return aliases[id] || (id in virtual ? id : undefined)
    },
    load(id) { return virtual[id] },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/')
          return next()
        res.setHeader('Content-Type', 'text/html')
        res.end(`<!doctype html><html><head><title>Card window browser fixture</title><style>
body{margin:20px;font:15px system-ui;color:#202124;background:#f5f5f5}nav{display:flex;gap:12px;margin:12px 0}button{font:inherit;padding:8px 12px}#viewport{height:700px;overflow:auto;container-type:inline-size;background:white;--bew-space-2:8px;--bew-space-4:16px} .video-card-grid-container{display:grid;gap:16px}.fixture-card{box-sizing:border-box;height:180px;background:#eee;padding:16px;display:flex;flex-direction:column;gap:16px}pre{white-space:pre-wrap;font:13px monospace}</style></head><body><div id="app"></div><script type="module" src="/__benchmark.js"></script></body></html>`)
      })
    },
  }, vue(), AutoImport({ imports: ['vue'], dts: false })],
  server: { host: '127.0.0.1', port: 4178, strictPort: true },
})
// Read the current entry before starting so a missing workspace fails explicitly.
await readFile(resolve(root, 'src/components/VideoCardGrid.vue'))
await server.listen()
server.printUrls()
