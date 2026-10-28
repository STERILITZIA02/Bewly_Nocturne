import { onMounted, watch } from 'vue'

import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { syncRouteState } from '~/composables/useRouteState'
import type { AppPage } from '~/enums/appEnums'
import { PAGE_SEARCH_PARAM } from '~/utils/pageSearch'

/**
 * Apply a keyword the search bar handed over in the route (`?page=…&q=…`) as
 * this page's own search, then drop it from the URL. Registered after the
 * page's own mount hook, so restored view state does not overwrite it.
 */
export function usePageSearchIntent(page: AppPage, apply: (keyword: string) => void) {
  const href = useCurrentLocationHref()
  onMounted(() => {
    watch(href, (value) => {
      const url = new URL(value)
      const keyword = url.searchParams.get(PAGE_SEARCH_PARAM)?.trim()
      if (url.searchParams.get('page') !== page || !keyword)
        return
      url.searchParams.delete(PAGE_SEARCH_PARAM)
      window.history.replaceState(window.history.state, '', url.href)
      syncRouteState()
      apply(keyword)
    }, { immediate: true })
  })
}
