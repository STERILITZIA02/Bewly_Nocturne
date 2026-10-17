import { computed } from 'vue'

import { useRouteState } from './useRouteState'

const routeState = useRouteState()
const currentLocationHref = computed(() => routeState.applicationHref ?? routeState.href)

export function useCurrentLocationHref() {
  return currentLocationHref
}
