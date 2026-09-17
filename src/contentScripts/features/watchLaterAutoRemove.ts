import { watch } from 'vue'

import { onRouteChange } from '~/composables/useRouteState'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { createAccountLifetime } from '~/utils/accountLifetime'
import api from '~/utils/api'
import { i18n } from '~/utils/i18n'
import { getCSRF, getUserID } from '~/utils/main'
import { parsePlaybackTabUrl } from '~/utils/playbackTab'
import { isWatchLaterVideo, showState } from '~/utils/player'
import { getPlayerModeContainer, getVideoElement } from '~/utils/playerMedia'
import { updateOwnedWatchLater } from '~/utils/watchLater'
import { createWatchLaterCompletion } from '~/utils/watchLaterCompletion'

import { hasPlayerMediaMutation, observePlayerDom } from '../playerDomLifecycle'

export function setupWatchLaterAutoRemove() {
  const store = useTopBarStore()
  const accountId = () => store.isLogin && getUserID() === String(store.userInfo.mid) ? Number(store.userInfo.mid) : null
  const lifetime = createAccountLifetime(accountId)
  const eligible = () => settings.value.autoRemoveWatchLaterOnEnd && isWatchLaterVideo()
  const completion = createWatchLaterCompletion({
    getVideo: getVideoElement,
    getHref: () => location.href,
    capture() {
      const owner = lifetime.capture()
      const csrf = getCSRF()
      return { accountId: owner.accountId, isCurrent: () => owner.isCurrent() && !!csrf && csrf === getCSRF() }
    },
    isEligible: eligible,
    isAdvertisement() {
      const root = getPlayerModeContainer()
      return !!root && (root.classList.contains('bpx-state-ad') || root.getAttribute('data-ad') === 'true'
        || Array.from(root.querySelectorAll('.bpx-player-ads,.bilibili-player-ads,.bpx-player-ad-wrap,.bpx-player-adwrap,.bpx-player-pic-ad,.bpx-player-ads-wrap,.bpx-player-ads-skip,.bpx-player-btn-skip'))
          .some(node => Array.from(node.getClientRects()).some(rect => rect.width > 0 && rect.height > 0) && getComputedStyle(node).visibility !== 'hidden'))
    },
    readInfo(href) {
      const target = parsePlaybackTabUrl(href)
      if (!target || (!('aid' in target) && !('bvid' in target)))
        return Promise.reject(new Error('Unknown playback identity'))
      void store.ensureWatchLaterState().catch(() => {})
      return api.video.getVideoInfo('aid' in target ? { aid: String(target.aid) } : target)
    },
    async remove(aid, isCurrent) {
      const owner = lifetime.capture()
      const result = await updateOwnedWatchLater({ aid }, 'removeIfPresent', {
        accountId: owner.accountId,
        isCurrent: () => owner.isCurrent() && isCurrent(),
      }, store)
      if (result.status === 'failed' || result.status === 'unavailable')
        throw new Error('Watch Later removal failed')
    },
    onFailure: () => showState(String(i18n.global.t('watch_later.auto_remove_failed'))),
  })
  let detach: (() => void) | undefined
  const ready = (event: Event) => {
    if (event.target === getVideoElement())
      completion.ready(event.target as HTMLVideoElement)
  }
  const ended = (event: Event) => {
    if (event.target === getVideoElement())
      void completion.ended(event.target as HTMLVideoElement)
  }
  function sync() {
    detach?.()
    detach = undefined
    if (!eligible())
      return
    const stopObserver = observePlayerDom((records) => {
      if (hasPlayerMediaMutation(records)) {
        const video = getVideoElement()
        if (video)
          completion.ready(video)
      }
    })
    for (const name of ['loadedmetadata', 'playing'])
      window.addEventListener(name, ready, true)
    window.addEventListener('ended', ended, true)
    detach = () => {
      stopObserver()
      for (const name of ['loadedmetadata', 'playing'])
        window.removeEventListener(name, ready, true)
      window.removeEventListener('ended', ended, true)
    }
  }
  const stopRoute = onRouteChange(() => {
    lifetime.invalidate()
    completion.invalidate()
    sync()
  })
  const stopSettings = watch([() => settings.value.autoRemoveWatchLaterOnEnd, accountId], () => {
    lifetime.invalidate()
    completion.invalidate(false)
    sync()
  }, { immediate: true, flush: 'sync' })
  return () => {
    stopRoute()
    stopSettings()
    detach?.()
    lifetime.dispose()
    completion.invalidate()
  }
}
