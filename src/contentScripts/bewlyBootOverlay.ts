import GRID_CSS from '~/styles/gridLayout.scss?inline'
import SKELETON_CSS from '~/styles/skeleton.scss?inline'

const BOOT_OVERLAY_ID = 'bewly-boot-overlay'
const BOOT_OVERLAY_STYLE_ID = 'bewly-boot-overlay-style'
const BOOT_OVERLAY_FADE_MS = 220

export interface BewlyBootOverlayController {
  remove: (immediate?: boolean) => void
  reveal: () => void
}

export function mountBewlyBootOverlay(doc: Document): BewlyBootOverlayController {
  doc.getElementById(BOOT_OVERLAY_ID)?.remove()
  doc.getElementById(BOOT_OVERLAY_STYLE_ID)?.remove()

  const style = doc.createElement('style')
  style.id = BOOT_OVERLAY_STYLE_ID
  style.textContent = `
    ${GRID_CSS}
    ${SKELETON_CSS}
    #${BOOT_OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: block;
      overflow: hidden;
      box-sizing: border-box;
      background: var(--bew-bg, #f6f7f8);
      opacity: 1;
      transition: opacity ${BOOT_OVERLAY_FADE_MS}ms cubic-bezier(0.2, 0, 0, 1);
      isolation: isolate;
      cursor: wait;
    }
    #${BOOT_OVERLAY_ID}[data-leaving="true"] {
      opacity: 0;
      pointer-events: none;
    }
    #${BOOT_OVERLAY_ID} .bewly-boot-overlay__content {
      container-type: inline-size;
      max-width: var(--bew-page-max-width, 2280px);
      margin: auto;
      padding: var(--bew-top-bar-height, 64px) var(--bew-space-12, 48px);
    }
    #${BOOT_OVERLAY_ID} .bewly-boot-overlay__heading {
      width: min(100%, 300px);
      height: var(--bew-control-height, 36px);
      margin-bottom: var(--bew-space-6, 24px);
      border-radius: var(--bew-radius-md, 8px);
    }
    #${BOOT_OVERLAY_ID} .bew-grid-adaptive { gap: var(--bew-layout-content-gap, 20px); }
    #${BOOT_OVERLAY_ID} .bewly-boot-overlay__cover { aspect-ratio: 16 / 9; border-radius: var(--bew-media-radius, 12px); }
    #${BOOT_OVERLAY_ID} .bewly-boot-overlay__line { height: var(--bew-line-height-control, 18px); margin-top: var(--bew-space-2, 8px); border-radius: var(--bew-radius-sm, 4px); }
    #${BOOT_OVERLAY_ID} .bewly-boot-overlay__line:last-child { width: 72%; }
    @media (prefers-color-scheme: dark) {
      #${BOOT_OVERLAY_ID} { background: var(--bew-bg, #050607); }
    }
    @media (prefers-reduced-motion: reduce) {
      #${BOOT_OVERLAY_ID} {
        transition: none;
        animation: none;
      }
    }
  `

  const overlay = doc.createElement('div')
  overlay.id = BOOT_OVERLAY_ID
  overlay.setAttribute('role', 'status')
  overlay.setAttribute('aria-label', 'Bewly Nocturne')
  overlay.setAttribute('aria-busy', 'true')

  const content = doc.createElement('div')
  content.className = 'bewly-boot-overlay__content'
  content.setAttribute('aria-hidden', 'true')
  const block = (name: string) => {
    const element = doc.createElement('div')
    element.className = `bewly-boot-overlay__${name}`
    element.setAttribute('data-bew-skeleton', '')
    return element
  }
  content.appendChild(block('heading'))
  const grid = doc.createElement('div')
  grid.className = 'bew-grid-adaptive'
  for (let index = 0; index < 12; index++) {
    const card = doc.createElement('div')
    card.append(block('cover'), block('line'), block('line'))
    grid.appendChild(card)
  }
  content.appendChild(grid)
  overlay.appendChild(content)
  doc.documentElement.append(style, overlay)

  let removed = false
  let removalTimer: ReturnType<typeof setTimeout> | undefined

  function clearTimers() {
    if (removalTimer !== undefined)
      clearTimeout(removalTimer)
    removalTimer = undefined
  }

  function remove(immediate = false) {
    if (removed)
      return
    if (!immediate) {
      if (overlay.dataset.leaving === 'true')
        return
      overlay.dataset.leaving = 'true'
      removalTimer = setTimeout(() => remove(true), BOOT_OVERLAY_FADE_MS)
      return
    }

    removed = true
    clearTimers()
    overlay.remove()
    style.remove()
  }

  return {
    remove,
    reveal: () => remove(false),
  }
}
