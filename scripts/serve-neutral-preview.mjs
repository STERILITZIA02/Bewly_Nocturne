import { resolve } from 'node:path'
import process from 'node:process'

import { createServer } from 'vite'

// Uses production CSS in both document and Shadow DOM. No account/network data.
const html = `<!doctype html><html><head><meta charset="utf-8"><title>中性色派生验证</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><main><h1>中性色统一派生</h1><p>真实主题样式 · 文本 / 表面 / 边线 / 控件状态</p>
<nav><button data-mode="light">浅色</button><button data-mode="dark">深色</button><button data-mode="oled">OLED</button><button data-mode="tint">可选色调</button><button id="verify">验证全部主题</button></nav>
<div class="samples"><section><h2>内容表面</h2><p class="secondary">次级文字 · foreground 76%</p><p class="muted">辅助文字 · foreground 67%</p><div class="hover">悬停反馈 · foreground 7%</div><div class="selected">选中状态</div><input placeholder="输入与焦点"><div class="line"></div><span class="disabled">禁用状态</span></section><section class="raised"><h2>浮起表面</h2><p class="muted">所有层级来自同一对基色</p><div class="fills"><i></i><i></i><i></i><i></i></div><div class="skeleton"></div><button class="accent">亮色主操作</button></section></div><div id="shadow"></div><pre id="report">等待验证</pre></main><script type="module" src="/__neutral.js"></script></body></html>`
const moduleSource = `import css from '/src/styles/variables.scss?inline';
import {relativeContrast,getThemeColorTokens,readThemeContrastSurfaces,syncNativeNeutralRgb} from '/src/utils/themeColor.ts';
import {resolveDarkModeBaseColor} from '/src/utils/darkModeTint.ts';
const style=document.createElement('style');style.textContent=css;document.head.append(style);
const layout=document.createElement('style');layout.textContent='body{margin:0;background:var(--bew-bg);color:var(--bew-text-1);font:15px/1.6 system-ui}main{max-width:1000px;margin:auto;padding:32px}h1{font-size:24px}h2{font-size:20px}nav,.fills{display:flex;gap:8px;flex-wrap:wrap}.samples{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-block:24px}section{padding:24px;border:1px solid var(--bew-surface-border-color);border-radius:12px;background:var(--bew-content-solid)}.raised{background:var(--bew-elevated-solid)}.secondary{color:var(--bew-text-2)}.muted{color:var(--bew-text-3)}.disabled{color:var(--bew-text-4)}button,input{font:inherit;color:inherit;border:1px solid var(--bew-input-border-color);border-radius:6px;padding:8px 12px;background:var(--bew-input-bg)}button:hover,.hover{background:var(--bew-hover-bg)}button:focus-visible,input:focus-visible{outline:var(--bew-focus-ring)}.selected{background:var(--bew-selected-bg);box-shadow:var(--bew-selected-ring)}.hover,.selected{padding:8px;margin-block:12px;border-radius:8px}.line{height:1px;background:var(--bew-border-color);margin-block:16px}.fills i{width:48px;height:32px;background:var(--bew-fill-1)}.fills i:nth-child(2){background:var(--bew-fill-2)}.fills i:nth-child(3){background:var(--bew-fill-3)}.fills i:nth-child(4){background:var(--bew-fill-4)}.skeleton{height:16px;margin-block:16px;background:var(--bew-skeleton);border-radius:4px}.accent{background:#eab308;color:#000}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 monospace}@media(max-width:600px){main{padding:16px}.samples{grid-template-columns:1fr}}';document.head.append(layout);
const host=document.querySelector('#shadow'), shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<style>'+css+'</style><p style="color:var(--bew-text-3);background:var(--bew-content-solid);padding:16px">Shadow DOM 使用相同的派生颜色</p>';
const root=document.documentElement;let current='dark';
function setMode(mode,tint='#2d2a2f',solid=false){for(const el of [root,host]){el.classList.toggle('dark',mode!=='light');el.classList.toggle('oled-dark',mode==='oled');el.classList.toggle('disable-frosted-glass',solid);el.style.setProperty('--bew-dark-base-color',resolveDarkModeBaseColor({enableDarkModeTint:mode==='tint',darkModeBaseColor:tint}));}root.classList.add('bewly-design');syncNativeNeutralRgb(root);}
function rgba(value){const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=value;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data];}
function read(el,key){const raw=getComputedStyle(el).getPropertyValue(key).trim();if(!raw||!CSS.supports('color',raw))throw Error('Invalid '+key+': '+raw);return rgba(raw);}
function blend(f,b){return f.slice(0,3).map((v,i)=>Math.round(v*f[3]/255+b[i]*(1-f[3]/255)));}
function hex(v){return '#'+v.slice(0,3).map(x=>Math.round(x).toString(16).padStart(2,'0')).join('');}
function verify(){const reports=[],failures=[];const assert=(ok,message)=>{if(!ok)failures.push(message)};
for(const mode of ['light','dark','oled','tint'])for(const solid of [false,true])for(const tint of (mode==='tint'?['#2d2a2f','#2a2f2d','#ff0000','#0000ff']:['#2d2a2f'])){setMode(mode,tint,solid);const label=mode+'/'+solid+'/'+tint;
const tokens=['--bew-neutral-bg','--bew-neutral-fg','--bew-bg','--bew-content-solid','--bew-elevated-solid','--bew-content-alt-solid-hover','--bew-elevated-alt-solid-hover','--bew-sidebar-background-solid','--bew-selected-bg','--bew-text-1','--bew-text-2','--bew-text-3','--bew-hover-bg','--bew-fill-1','--bew-fill-2','--bew-fill-3','--bew-fill-4','--bew-border-color','--bew-surface-border-color','--bew-skeleton'];const values=Object.fromEntries(tokens.map(k=>[k,read(root,k)]));
for(const key of tokens){assert(JSON.stringify(values[key])===JSON.stringify(read(host,key)),label+' shadow '+key);if(mode!=='tint')assert(Math.max(...values[key].slice(0,3))-Math.min(...values[key].slice(0,3))<=1,label+' neutral '+key);}
assert(Math.abs(values['--bew-text-3'][3]/255-.67)<.005,label+' muted alpha');assert(Math.abs(values['--bew-hover-bg'][3]/255-.07)<.005,label+' hover alpha');
let minimum=100;for(const key of ['--bew-bg','--bew-content-solid','--bew-elevated-solid','--bew-content-alt-solid-hover','--bew-elevated-alt-solid-hover','--bew-sidebar-background-solid','--bew-selected-bg']){const bg=values[key];for(const text of ['--bew-text-1','--bew-text-2','--bew-text-3']){const c=relativeContrast(hex(blend(values[text],bg)),hex(bg));minimum=Math.min(minimum,c);assert(c>=4.5,label+' '+text+' on '+key+' '+c.toFixed(2));}}
for(const name of ['Ga0','Ga1','Ga2','Ga7','Ga10','Ga11','Wh0','bg1','graph_bg_thin'])assert(getComputedStyle(root).getPropertyValue('--'+name+'_rgb').trim()===read(root,'--'+name).slice(0,3).join(', '),label+' native '+name);
const surfaces=readThemeContrastSurfaces(root);for(const chosen of ['#eab308','#fb923c','#a3e635','#fda4af','#3b82f6']){const t=getThemeColorTokens(chosen,mode!=='light',surfaces);assert(t.theme===chosen,label+' accent unchanged');assert(relativeContrast(t.onTheme,chosen)>=4.5,label+' accent contrast');for(const bg of surfaces)assert(relativeContrast(t.foreground,bg)>=4.5,label+' link contrast');}
assert(read(root,'--bew-content')[3]===(solid?255:173),label+' glass alpha');if(mode==='oled')assert(hex(values['--bew-bg'])==='#000000',label+' OLED black');
reports.push({mode,solid,tint:mode==='tint'?tint:null,canvas:hex(values['--bew-bg']),surface:hex(values['--bew-content-solid']),raised:hex(values['--bew-elevated-solid']),muted:hex(blend(values['--bew-text-3'],values['--bew-content-solid'])),minimumTextContrast:+minimum.toFixed(2)});}
setMode(current);document.querySelector('#report').textContent=JSON.stringify({passed:failures.length===0,scenarios:reports.length,failures,reports},null,2);}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{current=b.dataset.mode;setMode(current)});document.querySelector('#verify').onclick=verify;setMode(current);verify();`
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: { '~': resolve('src') } },
  plugins: [{
    name: 'neutral-preview',
    resolveId(id) {
      if (id === '/__neutral.js')
        return id
    },
    load(id) {
      if (id === '/__neutral.js')
        return moduleSource
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
  server: { host: '127.0.0.1', port: 4338, strictPort: true },
})
await server.listen()
server.printUrls()
