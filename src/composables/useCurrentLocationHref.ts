import { readonly, ref } from 'vue'

const currentLocationHref = ref(typeof window === 'undefined' ? '' : window.location.href)
let routeWatcherStarted = false

function updateCurrentLocationHref() {
  if (currentLocationHref.value !== window.location.href)
    currentLocationHref.value = window.location.href
}

export function useCurrentLocationHref() {
  if (!routeWatcherStarted && typeof window !== 'undefined') {
    routeWatcherStarted = true
    window.addEventListener('pushstate', updateCurrentLocationHref)
    window.addEventListener('popstate', updateCurrentLocationHref)
    window.addEventListener('hashchange', updateCurrentLocationHref)
    window.setInterval(updateCurrentLocationHref, 1000)
  }

  return readonly(currentLocationHref)
}
