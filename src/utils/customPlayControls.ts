import type { RandomPlayOrder } from '~/logic/storage'

export const PLAYLIST_ROOT_SELECTOR = '.video-pod,.multi-page,.video-sections-content-list,.base-video-sections-v1,.video-sections-v1,.video-sections'
export const PLAYLIST_RECOMMENDATION_SELECTOR = '[class*="recommend_wrap"],.recommend-list-v1,.recommend-list,.rec-list,.next-play'
let style: HTMLStyleElement | null = null

export function getNativePlaylistRoots() {
  return Array.from(document.querySelectorAll<HTMLElement>(PLAYLIST_ROOT_SELECTOR))
    .filter(root => !root.closest(PLAYLIST_RECOMMENDATION_SELECTOR))
}

export function findCustomPlayControlsHost(episodes: HTMLElement[]) {
  if (!episodes.length)
    return null
  const ownsEpisodes = (root: Element | null) => root && !root.closest(PLAYLIST_RECOMMENDATION_SELECTOR)
    && episodes.some(episode => root.contains(episode))
  const nativeSwitch = Array.from(document.querySelectorAll<HTMLElement>('.auto-play,.continuous-btn'))
    .find(element => !element.closest(PLAYLIST_RECOMMENDATION_SELECTOR) && ownsEpisodes(element.closest(PLAYLIST_ROOT_SELECTOR)))
  if (nativeSwitch?.parentElement)
    return nativeSwitch.parentElement
  return Array.from(document.querySelectorAll<HTMLElement>('.video-pod > .video-pod__header'))
    .find(header => ownsEpisodes(header.parentElement)) ?? null
}

export function mountCustomPlayControls(controls: HTMLElement, host: HTMLElement) {
  controls.classList.toggle('random-play--header', host.matches('.video-pod__header'))
  if (controls.parentElement !== host)
    host.appendChild(controls)
}

function ensureStyle() {
  if (style?.isConnected)
    return
  style = document.createElement('style')
  style.textContent = `
    .random-play { display:flex; align-items:center; flex-wrap:wrap; gap:var(--bew-space-1); margin-left:var(--bew-space-3); }
    .random-play.random-play--header { justify-content:flex-end; margin:0; }
    .random-play .random-play-btn { display:flex; align-items:center; gap:var(--bew-space-2); font-size:var(--bew-font-size-control); line-height:var(--bew-line-height-control); color:var(--bew-text-2); user-select:none; }
    .random-play .random-play-order-select { width:auto; min-width:0; flex-shrink:0; height:var(--bew-control-height-sm); padding:0 var(--bew-space-1); cursor:pointer; color:var(--bew-text-2); background:var(--bew-content-solid); border:var(--bew-control-border-width) solid var(--bew-surface-border-color); border-radius:var(--bew-radius-half); corner-shape:var(--bew-corner-shape); font:inherit; }
    .random-play .switch-btn { position:relative; flex:none; width:var(--bew-control-height); height:var(--bew-icon-button-size-sm); padding:0; background:var(--bew-switch-bg); border:0; border-radius:var(--bew-radius-full); corner-shape:round; overflow:hidden; cursor:pointer; transition:background-color var(--bew-duration-normal); }
    .random-play .switch-block { position:absolute; top:var(--bew-space-1); left:var(--bew-space-1); width:var(--bew-icon-size-sm); height:var(--bew-icon-size-sm); background:var(--bew-elevated-solid); border-radius:50%; corner-shape:round; transition:transform var(--bew-duration-normal); }
    .random-play .switch-btn[aria-checked=true] { background:var(--bew-theme-color); }
    .random-play .switch-btn[aria-checked=true] .switch-block { background:var(--bew-on-theme-color); transform:translateX(calc(var(--bew-control-height) - var(--bew-space-1) * 2 - var(--bew-icon-size-sm))); }
    .random-play .random-play-edit-btn { display:flex; align-items:center; justify-content:center; flex:none; width:var(--bew-control-height-sm); height:var(--bew-control-height-sm); padding:0; cursor:pointer; color:var(--bew-text-2); background:transparent; border:0; border-radius:var(--bew-radius-half); corner-shape:var(--bew-corner-shape); }
    .random-play .random-play-edit-btn:hover { background:var(--bew-fill-2); }
    .random-play :is(button,select):focus-visible { outline:2px solid var(--bew-theme-focus-ring); outline-offset:var(--bew-space-0-5); }
    @media (prefers-reduced-motion:reduce) { .random-play .switch-btn,.random-play .switch-block { transition:none; } }
  `
  ;(document.head || document.documentElement).appendChild(style)
}

export function disposeCustomPlayControlsStyle() {
  style?.remove()
  style = null
}

export function createCustomPlayControls(handlers: {
  onOrderChange: (order: RandomPlayOrder) => void
  onToggle: () => void
  onEdit: (button: HTMLButtonElement) => void
}) {
  ensureStyle()
  const root = document.createElement('div')
  root.className = 'random-play'
  const group = root.appendChild(document.createElement('div'))
  group.className = 'random-play-btn'
  const select = group.appendChild(document.createElement('select'))
  select.className = 'random-play-order-select'
  for (const value of ['sequential', 'reverse', 'random']) {
    const option = document.createElement('option')
    option.value = value
    select.appendChild(option)
  }
  const toggle = group.appendChild(document.createElement('button'))
  toggle.className = 'switch-btn'
  toggle.type = 'button'
  toggle.setAttribute('role', 'switch')
  toggle.appendChild(document.createElement('div')).className = 'switch-block'
  const edit = root.appendChild(document.createElement('button'))
  edit.className = 'random-play-edit-btn'
  edit.type = 'button'
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('width', '16')
  icon.setAttribute('height', '16')
  icon.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(icon.namespaceURI, 'path')
  path.setAttribute('fill', 'currentColor')
  path.setAttribute('d', 'M4 16.5V20h3.5L17.8 9.7l-3.5-3.5L4 16.5Zm16.7-9.6a1 1 0 0 0 0-1.4l-2.2-2.2a1 1 0 0 0-1.4 0l-1.7 1.7 3.5 3.5 1.8-1.6Z')
  icon.appendChild(path)
  edit.appendChild(icon)
  select.addEventListener('change', () => {
    if (select.value === 'sequential' || select.value === 'reverse' || select.value === 'random')
      handlers.onOrderChange(select.value)
  })
  toggle.addEventListener('click', handlers.onToggle)
  edit.addEventListener('click', () => handlers.onEdit(edit))
  root.addEventListener('click', event => event.stopPropagation())
  root.addEventListener('keydown', event => event.stopPropagation())
  return root
}

export function updateCustomPlayControls(root: HTMLElement, order: RandomPlayOrder, enabled: boolean, t: (key: string) => string) {
  const select = root.querySelector<HTMLSelectElement>('select')!
  const toggle = root.querySelector<HTMLButtonElement>('[role=switch]')!
  const edit = root.querySelector<HTMLButtonElement>('.random-play-edit-btn')!
  if (select.value !== order)
    select.value = order
  for (const option of Array.from(select.options)) {
    const label = t(`settings.random_play_order_${option.value}`)
    if (option.textContent !== label)
      option.textContent = label
  }
  for (const [element, label] of [[select, t('settings.random_play')], [edit, t('settings.random_play_edit_playlist')], [toggle, t(enabled ? 'settings.random_play_enabled' : 'settings.random_play_disabled')]] as const) {
    if (element.title !== label)
      element.title = label
    if (element.getAttribute('aria-label') !== label)
      element.setAttribute('aria-label', label)
  }
  if (toggle.getAttribute('aria-checked') !== String(enabled))
    toggle.setAttribute('aria-checked', String(enabled))
}
