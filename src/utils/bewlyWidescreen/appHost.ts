import RESET_BEWLY_CSS from '~/styles/reset.css?raw'

const hosts = new Map<HTMLElement, string>()
let themeSource: HTMLElement | null = null
let themeObserver: MutationObserver | undefined
let appObserver: MutationObserver | undefined

function syncTheme() {
  for (const [host, className] of hosts) {
    const classes = [className, ...Array.from(themeSource?.classList ?? [])].join(' ')
    if (host.className !== classes)
      host.className = classes
    const properties = new Set(Array.from(themeSource?.style ?? []).filter(name => name.startsWith('--')))
    for (const name of properties) {
      const value = themeSource!.style.getPropertyValue(name)
      if (host.style.getPropertyValue(name) !== value)
        host.style.setProperty(name, value)
    }
    for (const name of Array.from(host.style)) {
      if (name.startsWith('--') && !properties.has(name))
        host.style.removeProperty(name)
    }
  }
}

function bindTheme() {
  const source = document.getElementById('bewly')
  if (source !== themeSource) {
    themeObserver?.disconnect()
    themeSource = source
    if (source)
      themeObserver?.observe(source, { attributes: true, attributeFilter: ['class', 'style'] })
  }
  syncTheme()
}

/** Native rail slots share the app's isolated stylesheet and one theme observer. */
export function createPlaybackAppHost(className: string) {
  const host = document.createElement('div')
  const shadow = host.attachShadow({ mode: 'open' })
  const reset = document.createElement('style')
  reset.textContent = RESET_BEWLY_CSS
  const style = document.createElement('style')
  style.textContent = (globalThis as typeof globalThis & { __BEWLY_NOCTURNE_BUNDLED_STYLE_TEXT__?: string }).__BEWLY_NOCTURNE_BUNDLED_STYLE_TEXT__ ?? ''
  const mount = document.createElement('div')
  shadow.append(reset, style, mount)
  hosts.set(host, className)
  if (!themeObserver) {
    themeObserver = new MutationObserver(syncTheme)
    appObserver = new MutationObserver(bindTheme)
    appObserver.observe(document.body, { childList: true })
  }
  bindTheme()
  return { host, mount, dispose() {
    hosts.delete(host)
    host.remove()
    if (!hosts.size) {
      themeObserver?.disconnect()
      appObserver?.disconnect()
      themeObserver = appObserver = undefined
      themeSource = null
    }
  } }
}
