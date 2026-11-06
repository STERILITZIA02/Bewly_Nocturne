import { computed } from 'vue'

import { useRouteState } from './useRouteState'

export function useCurrentLocationHref() {
  const routeState = useRouteState()
  return computed(() => routeState.applicationHref ?? routeState.href)
}
