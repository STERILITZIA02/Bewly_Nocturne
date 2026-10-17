import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

import { createServer } from 'vite'
import { compileStyleAsync, parse } from 'vue/compiler-sfc'

// Compile the actual component styles and copy their actual media class lists.
// This fixture isolates decoration from data fetching and account state.
const samples = [
  ['视频封面', 'src/components/VideoCard/components/VideoCardCover.vue', 'video-card-cover'],
  ['番剧封面', 'src/components/BangumiCard/BangumiCard.vue', 'bangumi-card__cover'],
  ['专栏封面', 'src/components/ArticleCard/ArticleCard.vue', 'article-cover'],
  ['评论图片', 'src/components/MomentCard/MomentCommentMedia.vue', 'moment-comment-media__item'],
  ['聊天图片', 'src/contentScripts/views/Notifications/whisper/PrivateMessageContent.vue', 'private-message-content__media-button'],
  ['作者头像', 'src/components/VideoCard/VideoCardAuthor/components/VideoCardAuthorAvatar.vue', 'video-card-author-avatar'],
]
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#334955"/><circle cx="235" cy="55" r="25" fill="#e7c887"/><path d="M0 165L100 62L180 140L240 92L320 175V180H0Z" fill="#79917f"/></svg>')}`
let styles = ''
let cards = ''
for (const [label, file, primaryClass] of samples) {
  const filename = resolve(file)
  const source = await readFile(filename, 'utf8')
  const descriptor = parse(source, { filename }).descriptor
  for (const block of descriptor.styles) {
    const result = await compileStyleAsync({ source: block.content, filename, id: 'data-v-border-fixture', scoped: false, preprocessLang: block.lang, preprocessOptions: { loadPaths: [dirname(filename)] } })
    if (result.errors.length)
      throw result.errors[0]
    styles += result.code
  }
  const classes = [...descriptor.template.content.matchAll(/\bclass="([^"]+)"/g)].find(match => match[1].split(/\s+/).includes(primaryClass))?.[1]
  if (!classes)
    throw new Error(`Missing real media class: ${primaryClass}`)
  const tag = primaryClass.includes('button') || primaryClass.includes('__item') ? 'button' : 'a'
  cards += `<section><h2>${label}</h2><${tag} ${tag === 'a' ? 'href="#results"' : 'type="button"'} class="${classes} test-media" data-media="${primaryClass}" aria-label="${label}"><img src="${image}" alt="山景测试图"></${tag}></section>`
}
const main = await readFile(resolve('src/styles/main.scss'), 'utf8')
styles += main.match(/\.bew-surface-border\s*\{[^}]+\}/)?.[0] || ''
styles += main.match(/:where\([^{}]*\):focus-visible\s*\{[^}]+\}/)?.[0] || ''
const html = `<!doctype html><html><head><meta charset="utf-8"><title>边框与封面验证</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main><h1>透明发丝线 · 图片无框</h1><nav><button data-mode="light">浅色</button><button data-mode="dark">深色</button><button data-mode="oled">OLED</button><button id="verify">验证全部主题</button></nav><div class="grid">${cards}</div><section class="panel"><h2>面板边框与阴影</h2><p>保留浮起阴影，移除装饰内发光。</p><input aria-label="键盘焦点示例" placeholder="按 Tab 检查焦点"></section><pre id="results"></pre></main><script type="module" src="/__border.js"></script></body></html>`
const script = `import css from '/src/styles/variables.scss?inline';const style=document.createElement('style');style.textContent=css+${JSON.stringify(styles)};document.head.append(style);
const layout=document.createElement('style');layout.textContent='body{margin:0;background:var(--bew-bg);color:var(--bew-text-1);font:15px/1.5 system-ui}main{max-width:1050px;margin:auto;padding:24px}h1{font-size:24px}h2{font-size:15px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-block:24px}nav{display:flex;gap:8px}nav button,input{font:inherit;color:inherit;background:var(--bew-input-bg);border:1px solid var(--bew-input-border-color);border-radius:6px;padding:8px}.test-media{display:block;position:relative;width:100%;height:150px;overflow:hidden;border-radius:12px;box-sizing:border-box}.test-media img{display:block;width:100%;height:100%;object-fit:cover}.panel{padding:20px;background:var(--bew-elevated);border:1px solid var(--bew-surface-border-color);border-radius:12px;box-shadow:var(--bew-shadow-3),var(--bew-shadow-edge-glow-1),var(--bew-shadow-edge-glow-2)}pre{white-space:pre-wrap;font-size:12px}@media(max-width:600px){.grid{grid-template-columns:1fr 1fr}}';document.head.append(layout);
const root=document.documentElement;let current='dark';function mode(value,solid=false){root.classList.toggle('dark',value!=='light');root.classList.toggle('oled-dark',value==='oled');root.classList.toggle('disable-frosted-glass',solid);root.style.setProperty('--bew-dark-base-color','#2b2b2b');}
function alpha(value){const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=value;x.fillRect(0,0,1,1);return x.getImageData(0,0,1,1).data[3]/255;}
function verify(){const failures=[],reports=[];for(const m of ['light','dark','oled'])for(const solid of [false,true]){mode(m,solid);const s=getComputedStyle(root),borderTokens=['--bew-border-color','--bew-surface-border-color','--bew-input-border-color','--bew-input-border-color-hover','--bew-message-card-border'];const borders=Object.fromEntries(borderTokens.map(k=>[k,+alpha(s.getPropertyValue(k)).toFixed(3)]));for(const [key,a]of Object.entries(borders))if(a<.115||a>.205)failures.push(m+' '+key+' '+a);
for(const key of ['--bew-shadow-edge-glow-1','--bew-shadow-edge-glow-2'])if(s.getPropertyValue(key).trim()!=='0 0 0 transparent')failures.push(m+' glow '+key);
const media=[...document.querySelectorAll('[data-media]')].map(el=>{const c=getComputedStyle(el);const border=['Top','Right','Bottom','Left'].map(side=>parseFloat(c['border'+side+'Width']));if(border.some(n=>n!==0))failures.push(m+' media border '+el.dataset.media);if(c.boxShadow!=='none')failures.push(m+' media shadow '+el.dataset.media);return {name:el.dataset.media,border,shadow:c.boxShadow};});reports.push({mode:m,solid,borders,media});}mode(current);document.querySelector('#results').textContent=JSON.stringify({passed:failures.length===0,scenarios:reports.length,failures,reports},null,2);}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{current=b.dataset.mode;mode(current)});document.querySelector('#verify').onclick=verify;verify();`
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [{
  name: 'border-preview',
  resolveId(id) {
    if (id === '/__border.js')
      return id
  },
  load(id) {
    if (id === '/__border.js')
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
}], server: { host: '127.0.0.1', port: 4339, strictPort: true } })
await server.listen()
server.printUrls()
