import { readonly, shallowReactive } from 'vue'

export interface RouteState {
  href: string
  pathname: string
  search: string
  hash: string
  navigationId: number
}

type RouteChangeListener = (state: Readonly<RouteState>) => void

const initialUrl = typeof window === 'undefined' ? null : new URL(window.location.href)
const routeState = shallowReactive<RouteState>({
  href: initialUrl?.href ?? '',
  pathname: initialUrl?.pathname ?? '',
  search: initialUrl?.search ?? '',
  hash: initialUrl?.hash ?? '',
  navigationId: 0,
})
const listeners = new Set<RouteChangeListener>()
let routeObserverStarted = false

function syncRouteState() {
  if (typeof window === 'undefined' || routeState.href === window.location.href)
    return

  const url = new URL(window.location.href)
  routeState.href = url.href
  routeState.pathname = url.pathname
  routeState.search = url.search
  routeState.hash = url.hash
  routeState.navigationId++
  listeners.forEach(listener => listener(routeState))
}

function scheduleRouteSync() {
  // The MAIN-world history bridge dispatches before the native method returns.
  // Read location in a microtask so pushState/replaceState has already committed.
  queueMicrotask(syncRouteState)
}

function startRouteObserver() {
  if (routeObserverStarted || typeof window === 'undefined')
    return

  routeObserverStarted = true
  window.addEventListener('pushstate', scheduleRouteSync)
  window.addEventListener('replacestate', scheduleRouteSync)
  window.addEventListener('popstate', scheduleRouteSync)
  window.addEventListener('hashchange', scheduleRouteSync)

  // Bilibili occasionally changes location without emitting the custom history
  // events. One low-frequency fallback covers that path for every consumer.
  window.setInterval(syncRouteState, 4000)
}

export function useRouteState() {
  startRouteObserver()
  return readonly(routeState)
}

export function onRouteChange(listener: RouteChangeListener, immediate = false) {
  startRouteObserver()
  listeners.add(listener)
  if (immediate)
    listener(routeState)

  return () => listeners.delete(listener)
}
