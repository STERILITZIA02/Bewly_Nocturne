import { resolve } from 'node:path'
import process from 'node:process'

import { createServer } from 'vite'

const js = `
import {patchNativeUserProfile} from '/src/inject/nativeUserProfile.ts';
import profileStyle from '/src/styles/adaptedStyles/shadowDom/userProfile.scss?inline';
import '/src/styles/variables.scss';import '/src/styles/fonts.scss';
document.documentElement.className='dark';

class Profile extends HTMLElement {
constructor(){super();this.uid='123456789';this.attachShadow({mode:'open'}).innerHTML='<style>:host{display:none;position:absolute;width:366px;left:50%;top:260px;margin-left:-183px;z-index:2}#wrap{position:relative}#bg{height:85px;background:#515457}#body{padding:16px}#avatar{position:relative;display:grid;place-items:center;width:64px;height:64px;margin:-38px 16px 0;border-radius:50%;background:#afb2b3;color:#272a2a;font:24px system-ui}#title{display:flex;align-items:center;gap:8px;font-size:15px}#stats{display:flex;gap:20px;margin:16px 0;color:var(--bew-text-2)}#sign{font-size:13px;color:var(--bew-text-3);line-height:20px}#action{display:flex;margin-top:16px}button{cursor:pointer}</style><div id="wrap"><div id="view"><div id="bg"></div><div id="avatar">样</div><div id="body"><div id="title"><span id="name">示例用户</span></div><div id="stats"><span>关注 128</span><span>粉丝 4.2万</span></div><div id="sign">这里是示例简介。资料、关注状态和导航均为本地模拟。</div><div id="action"><button id="follow" class="active">已关注</button><button id="chat">发消息</button></div></div></div></div>';const style=document.createElement('style');style.textContent=profileStyle;this.shadowRoot.append(style);this.shadowRoot.querySelector('#chat').onclick=()=>this.handleJumpMsg();this.shadowRoot.querySelector('#follow').onclick=e=>{e.currentTarget.classList.toggle('active');e.currentTarget.textContent=e.currentTarget.classList.contains('active')?'已关注':'关注';};}
visible(value){this.style.display=value?'block':'';}
handleJumpMsg(){}
disconnectedCallback(){}
}
patchNativeUserProfile(Profile);customElements.define('bili-user-profile',Profile);
const profile=document.querySelector('bili-user-profile'),trigger=document.querySelector('#avatar-trigger');let hideTimer;
const show=()=>{clearTimeout(hideTimer);profile.lastShowEl=trigger;profile.visible(true);};
const hide=()=>{clearTimeout(hideTimer);hideTimer=setTimeout(()=>profile.visible(false),150);};
trigger.addEventListener('mouseenter',show);trigger.addEventListener('mouseleave',hide);trigger.addEventListener('focus',show);trigger.addEventListener('click',show);profile.addEventListener('mouseenter',()=>clearTimeout(hideTimer));profile.addEventListener('mouseleave',hide);profile.addEventListener('keydown',event=>{if(event.key==='Escape'){profile.visible(false);trigger.focus();}});
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{const mode=button.dataset.mode;document.documentElement.classList.toggle('dark',mode!=='light');});
window.open=(url,target,features)=>{document.querySelector('#result').textContent=JSON.stringify({url,target,features},null,2);return null;};
show();`
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>头像资料卡 · 本地验证</title><style>body{margin:0;background:var(--bew-bg);color:var(--bew-text-1);font:15px/24px system-ui}main{max-width:800px;margin:auto;padding:32px;position:relative;min-height:760px}h1{font-size:20px;font-weight:400}p{color:var(--bew-text-3)}nav{display:flex;gap:8px}button{font:inherit;color:inherit;background:transparent;border:1px solid var(--bew-separator-color);border-radius:8px;padding:8px 12px}#avatar-trigger{display:block;width:56px;height:56px;padding:0;margin:32px auto;border-radius:50%;background:var(--bew-content-alt-solid)}pre{margin-top:370px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;color:var(--bew-text-2)}</style></head><body><main><h1>头像资料卡</h1><p>原生结构模拟，使用真实样式与动画补丁。点击“发消息”仅显示目标链接。</p><nav><button data-mode="light">浅色</button><button data-mode="dark">深色</button></nav><button id="avatar-trigger" aria-label="显示示例用户资料">样</button><bili-user-profile></bili-user-profile><pre id="result">尚未点击发消息</pre></main><script type="module" src="/__profile.js"></script></body></html>`
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: [{ find: '~', replacement: resolve('src') }] },
  plugins: [{
    name: 'user-profile-preview',
    resolveId(id) {
      if (id === '/__profile.js')
        return id
    },
    load(id) {
      if (id === '/__profile.js')
        return js
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
  server: { host: '127.0.0.1', port: 4347, strictPort: true },
})
await server.listen()
server.printUrls()
