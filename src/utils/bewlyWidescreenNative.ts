export interface WidescreenDanmakuControlLabels {
  send: string
  settings: string
  style: string
}

interface AttributeSnapshot {
  name: string
  value: string | null
}

function restoreAttribute(element: HTMLElement, snapshot: AttributeSnapshot) {
  if (snapshot.value === null)
    element.removeAttribute(snapshot.name)
  else
    element.setAttribute(snapshot.name, snapshot.value)
}

function enhanceNativeButton(
  element: HTMLElement | null,
  label: string,
  popup = false,
): (() => void) | undefined {
  if (!element)
    return undefined

  const snapshots = ['role', 'tabindex', 'aria-label', 'aria-haspopup'].map(name => ({
    name,
    value: element.getAttribute(name),
  }))
  element.setAttribute('role', 'button')
  element.tabIndex = 0
  element.setAttribute('aria-label', label)
  if (popup)
    element.setAttribute('aria-haspopup', 'dialog')

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ')
      return
    event.preventDefault()
    event.stopPropagation()
    element.click()
  }
  element.addEventListener('keydown', handleKeydown)

  return () => {
    element.removeEventListener('keydown', handleKeydown)
    snapshots.forEach(snapshot => restoreAttribute(element, snapshot))
  }
}

export function setupWidescreenDanmakuSemantics(
  dock: HTMLElement,
  labels: WidescreenDanmakuControlLabels,
): () => void {
  const enhancedControls = new Map<HTMLElement, () => void>()

  const refresh = () => {
    enhancedControls.forEach((cleanup, element) => {
      if (element.isConnected && dock.contains(element))
        return
      cleanup()
      enhancedControls.delete(element)
    })

    const controls = [
      [dock.querySelector<HTMLElement>('.bpx-player-dm-setting'), labels.settings, true],
      [dock.querySelector<HTMLElement>('.bpx-player-video-btn-dm'), labels.style, true],
      [dock.querySelector<HTMLElement>('.bpx-player-dm-btn-send'), labels.send, false],
    ] as const
    controls.forEach(([element, label, popup]) => {
      if (!element || enhancedControls.has(element))
        return
      const cleanup = enhanceNativeButton(element, label, popup)
      if (cleanup)
        enhancedControls.set(element, cleanup)
    })
  }

  const observer = new MutationObserver(refresh)
  observer.observe(dock, { childList: true, subtree: true })
  refresh()

  return () => {
    observer.disconnect()
    enhancedControls.forEach(cleanup => cleanup())
    enhancedControls.clear()
  }
}
