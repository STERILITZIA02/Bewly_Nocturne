const BOOT_OVERLAY_ID = 'bewly-boot-overlay'
const BOOT_OVERLAY_STYLE_ID = 'bewly-boot-overlay-style'
const BOOT_OVERLAY_FADE_MS = 220
const BOOT_OVERLAY_FAILSAFE_MS = 10_000

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
    @keyframes bewly-boot-spinner-rotate {
      to { transform: rotate(360deg); }
    }
    #${BOOT_OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      box-sizing: border-box;
      background:
        radial-gradient(circle at 50% 46%, color-mix(in srgb, var(--bew-theme-color, #00aeec) 14%, transparent) 0, transparent 34%),
        #050607;
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
      display: grid;
      justify-items: center;
      gap: 16px;
      transform: translateY(-2vh);
    }
    #${BOOT_OVERLAY_ID} .bewly-boot-overlay__spinner {
      width: 32px;
      height: 32px;
      box-sizing: border-box;
      border: 3px solid rgba(255, 255, 255, 0.16);
      border-top-color: var(--bew-theme-color, #00aeec);
      border-radius: 50%;
      box-shadow: 0 0 24px color-mix(in srgb, var(--bew-theme-color, #00aeec) 32%, transparent);
      animation: bewly-boot-spinner-rotate 760ms linear infinite;
    }
    #${BOOT_OVERLAY_ID} .bewly-boot-overlay__label {
      color: rgba(255, 255, 255, 0.72);
      font: 600 12px/16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    @media (prefers-reduced-motion: reduce) {
      #${BOOT_OVERLAY_ID},
      #${BOOT_OVERLAY_ID} .bewly-boot-overlay__spinner {
        transition: none;
        animation: none;
      }
      #${BOOT_OVERLAY_ID} .bewly-boot-overlay__spinner {
        border-color: var(--bew-theme-color, #00aeec);
      }
    }
  `

  const overlay = doc.createElement('div')
  overlay.id = BOOT_OVERLAY_ID
  overlay.setAttribute('role', 'status')
  overlay.setAttribute('aria-label', 'Bewly Nocturne 正在加载')

  const content = doc.createElement('div')
  content.className = 'bewly-boot-overlay__content'
  const spinner = doc.createElement('div')
  spinner.className = 'bewly-boot-overlay__spinner'
  spinner.setAttribute('aria-hidden', 'true')
  const label = doc.createElement('div')
  label.className = 'bewly-boot-overlay__label'
  label.textContent = 'Bewly Nocturne'
  content.append(spinner, label)
  overlay.appendChild(content)
  doc.documentElement.append(style, overlay)

  let removed = false
  let removalTimer: ReturnType<typeof setTimeout> | undefined
  const failsafeTimer = setTimeout(() => remove(), BOOT_OVERLAY_FAILSAFE_MS)

  function clearTimers() {
    clearTimeout(failsafeTimer)
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
