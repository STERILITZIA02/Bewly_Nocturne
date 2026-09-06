import type { HomeTabState } from '~/composables/useHomeTabState'
import { noCookieForYouRecommendationState, settings } from '~/logic'
import type { Item as VideoItem } from '~/models/video/forYou'

/** Owns Web cursor/exposure metadata; anonymous persisted state remains in its existing storage field. */
export function useWebRecommendationCursor(tabState: HomeTabState) {
  const refreshIdx = tabState.ref<number>('refreshIdx', 1)

  const NO_COOKIE_RECOMMEND_STATE_MAX_SHOWLIST_GROUPS = 3

  const webFetchRow = tabState.ref<number>('webFetchRow', 1)

  const webShowlistGroups = tabState.ref<string[]>('webShowlistGroups', [])

  function getWebShowlistEntry(item: VideoItem): string | undefined {
    const goto = `${item.goto || ''}`.trim()
    if (!goto)
      return undefined

    const id = item.id || 'undefined'
    if (goto === 'av')
      return `av_n_${id}`
    if (goto === 'live')
      return `live_n_${id}`
    if (goto === 'ad')
      return `ad_${id}`

    return `${goto}_${id}`
  }

  function buildLastShowlistGroup(items: VideoItem[]): string {
    const parts: string[] = []
    const seen = new Set<string>()

    items.forEach((item) => {
      const entry = getWebShowlistEntry(item)
      if (!entry || seen.has(entry))
        return

      seen.add(entry)
      parts.push(entry)
    })

    return parts.join(',')
  }

  function getLastShowlistFromGroups(): string {
    return webShowlistGroups.value.filter(Boolean).join(';')
  }

  function getNoCookieStoredLastShowlist(): string {
    if (!settings.value.rememberNoCookieRecommendationState)
      return ''

    return noCookieForYouRecommendationState.value.showlistGroups
      .filter(Boolean)
      .slice(-NO_COOKIE_RECOMMEND_STATE_MAX_SHOWLIST_GROUPS)
      .join(';')
  }

  function getNoCookieNextFreshIdx(): number {
    if (!settings.value.rememberNoCookieRecommendationState)
      return refreshIdx.value

    const nextFreshIdx = noCookieForYouRecommendationState.value.nextFreshIdx
    return Number.isFinite(nextFreshIdx) && nextFreshIdx > 0 ? Math.floor(nextFreshIdx) : 1
  }

  function saveNoCookieRecommendationState(group: string, recommendationMode: string, nextFreshIdx?: number) {
    if (recommendationMode !== 'webNoCookie' || !settings.value.rememberNoCookieRecommendationState)
      return
    if (!group && nextFreshIdx === undefined)
      return

    const groups = noCookieForYouRecommendationState.value.showlistGroups
      .filter(storedGroup => storedGroup && storedGroup !== group)

    if (group)
      groups.push(group)

    noCookieForYouRecommendationState.value = {
      showlistGroups: groups.slice(-NO_COOKIE_RECOMMEND_STATE_MAX_SHOWLIST_GROUPS),
      nextFreshIdx: nextFreshIdx ?? noCookieForYouRecommendationState.value.nextFreshIdx,
    }
  }

  function resetWebRecommendState() {
    refreshIdx.value = 1
    webFetchRow.value = 1
    webShowlistGroups.value = []
  }
  return { refreshIdx, webFetchRow, webShowlistGroups, buildLastShowlistGroup, getLastShowlistFromGroups, getNoCookieStoredLastShowlist, getNoCookieNextFreshIdx, saveNoCookieRecommendationState, resetWebRecommendState }
}
