import { resolveNativeSendState } from './nativeSendState'

export interface WidescreenDanmakuControlLabels {
  send: string
  unavailable?: string
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

  const snapshots = ['role', 'tabindex', 'aria-label', 'aria-haspopup', 'title', 'data-bew-send-idle', 'data-bew-send-state'].map(name => ({
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
    if (element.dataset.bewSendState === 'blocked' || element.dataset.bewSendState === 'pending')
      return
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
    const send = dock.querySelector<HTMLElement>('.bpx-player-dm-btn-send')
    if (send) {
      const input = dock.querySelector<HTMLInputElement | HTMLTextAreaElement>('.bpx-player-dm-input')
      const state = resolveNativeSendState({
        hasContent: Boolean(input?.value?.trim()),
        inputDisabled: Boolean(input?.disabled || input?.readOnly || input?.getAttribute('aria-disabled') === 'true'),
        buttonDisabled: send.matches(':disabled, .bui-disabled, [aria-disabled="true"]'),
        busy: send.getAttribute('aria-busy') === 'true',
        buttonText: send.textContent ?? '',
        restrictionText: input?.placeholder,
      })
      const idle = String(state === 'idle')
      if (send.getAttribute('data-bew-send-idle') !== idle)
        send.setAttribute('data-bew-send-idle', idle)
      if (send.dataset.bewSendState !== state)
        send.dataset.bewSendState = state
      const label = state === 'blocked' ? (labels.unavailable ?? labels.send) : labels.send
      if (send.getAttribute('aria-label') !== label)
        send.setAttribute('aria-label', label)
      if (send.title !== label)
        send.title = label
    }
  }

  const observer = new MutationObserver(refresh)
  observer.observe(dock, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled', 'readonly', 'placeholder', 'aria-disabled', 'aria-busy'] })
  dock.addEventListener('input', refresh)
  refresh()

  return () => {
    observer.disconnect()
    dock.removeEventListener('input', refresh)
    enhancedControls.forEach(cleanup => cleanup())
    enhancedControls.clear()
  }
}
