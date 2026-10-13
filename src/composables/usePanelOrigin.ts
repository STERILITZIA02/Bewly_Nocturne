import type { InjectionKey } from 'vue'
import { inject, onScopeDispose, provide } from 'vue'

import { getDeepActiveElement } from '~/utils/dialogFocus'

export interface PanelOrigin {
  x: number
  y: number
  size: number
}

const panelOriginKey: InjectionKey<() => PanelOrigin | undefined> = Symbol('panel-origin')
const panelTriggerKey: InjectionKey<() => HTMLElement | null> = Symbol('panel-trigger')

export function readPanelOrigin(element: Element | null): PanelOrigin | undefined {
  if (!element?.isConnected)
    return
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0)
    return
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: Math.max(rect.width, rect.height) }
}

function focusedOrigin() {
  const active = getDeepActiveElement(document)
  return active?.matches('button, a[href], [role="button"], [role^="menuitem"]') ? readPanelOrigin(active) : undefined
}

/** One app-scoped capture path, including teleported menus and Shadow DOM controls. */
export function providePanelOrigin() {
  let origin: PanelOrigin | undefined
  let trigger: HTMLElement | null = null
  let expiry: ReturnType<typeof setTimeout> | undefined
  const clear = () => {
    clearTimeout(expiry)
    expiry = undefined
    origin = undefined
    trigger = null
  }
  provide(panelOriginKey, () => origin ?? focusedOrigin())
  provide(panelTriggerKey, () => trigger?.isConnected ? trigger : null)
  onScopeDispose(clear)
  return (event: Event) => {
    if (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key))
      return
    clear()
    const path = event.composedPath().filter((node): node is Element => node instanceof Element)
    const target = path.find(node => node.matches('button, a[href], [role="button"], [role^="menuitem"]')) ?? path[0]
    origin = readPanelOrigin(target)
    trigger = target instanceof HTMLElement ? target : null
    // Vue mounts the dialog in this event's microtask. Do not reuse an unrelated
    // old click for a later notification, timer, or background-driven dialog.
    expiry = setTimeout(clear, 0)
  }
}

export function usePanelOrigin() {
  return inject(panelOriginKey, focusedOrigin)
}

export function usePanelTrigger() {
  return inject(panelTriggerKey, () => null)
}

/** Measure only at transition boundaries; no per-frame layout reads. */
export function panelOriginTransform(panel: HTMLElement, origin?: PanelOrigin) {
  const rect = panel.getBoundingClientRect()
  if (!origin || ![origin.x, origin.y, origin.size].every(Number.isFinite) || origin.size <= 0 || !rect.width || !rect.height)
    return 'scale(0.94)'
  const scale = Math.min(1, origin.size / Math.max(rect.width, rect.height))
  return `translate3d(${origin.x - rect.left - rect.width / 2}px, ${origin.y - rect.top - rect.height / 2}px, 0) scale(${scale})`
}
