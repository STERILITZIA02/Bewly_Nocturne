import { onScopeDispose, reactive, readonly } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import type { DisplayMoment, WatchLaterTarget } from '~/components/MomentCard/types'
import { getWatchLaterStateKey } from '~/components/MomentCard/utils'
import { useTopBarStore } from '~/stores/topBarStore'
import { createAccountLifetime } from '~/utils/accountLifetime'
import type { AccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { getCSRF } from '~/utils/main'
import { reportRuntimeFailure } from '~/utils/messaging'
import { getDirectWatchLaterAid, resolveWatchLaterAid, updateOwnedWatchLater } from '~/utils/watchLater'

export function useMomentActions(getAccountId: () => AccountId, commit: (id: string, patch: Partial<DisplayMoment>) => void) {
  const lifetime = createAccountLifetime(getAccountId)
  const topBarStore = useTopBarStore()
  const toast = useToast()
  const { t } = useI18n()
  const likingMomentRequests = reactive(new Map<string, { requestId: symbol, isLiked: boolean, likeCount: number }>())
  const reservationRequests = reactive(new Map<string, symbol>())
  const watchLaterRequests = reactive(new Map<string, symbol>())
  const watchLaterAidByTarget = reactive(new Map<string, number>())
  const watchLaterAidRequests = new Map<string, Promise<number | undefined>>()
  async function toggleMomentLike(moment: DisplayMoment) {
    if (likingMomentRequests.has(moment.id) || moment.isLikeDisabled)
      return

    const owner = lifetime.capture()
    const previousLiked = moment.isLiked
    const previousCount = moment.likeCount
    const csrf = getCSRF()
    if (!csrf) {
      toast.warning(t('moments.login_to_like'))
      return
    }
    if (!owner.isCurrent())
      return

    const isLiked = !previousLiked
    const likeCount = Math.max(0, previousCount + (isLiked ? 1 : -1))
    const requestId = Symbol(moment.id)
    likingMomentRequests.set(moment.id, { requestId, isLiked, likeCount })

    try {
      const response = await api.moment.setMomentLike({
        dyn_id_str: moment.id,
        up: isLiked ? 1 : 2,
        spmid: '333.1369.0.0',
        from_spmid: '333.999.0.0',
        csrf,
      })
      if (!owner.isCurrent())
        return
      if (response.code !== 0)
        throw new Error(response.message || t('moments.like_failed'))
      commit(moment.id, { isLiked, likeCount })
    }
    catch (error) {
      if (!owner.isCurrent())
        return
      toast.error(error instanceof Error ? error.message : t('moments.like_failed_retry'))
    }
    finally {
      if (likingMomentRequests.get(moment.id)?.requestId === requestId) {
        likingMomentRequests.delete(moment.id)
      }
    }
  }

  async function toggleMomentReservation(moment: DisplayMoment) {
    const additional = moment.additional
    const reservationId = additional?.reservationId
    if (!additional || !reservationId || reservationRequests.has(moment.id))
      return

    const csrf = getCSRF()
    if (!csrf) {
      toast.warning(t('moment_card.reservation_login_required'))
      return
    }

    const owner = lifetime.capture()
    if (!owner.isCurrent())
      return
    const wasReserved = Boolean(additional.isReserved)
    const requestId = Symbol(moment.id)
    reservationRequests.set(moment.id, requestId)

    try {
      const response = wasReserved
        ? await api.moment.cancelMomentReservation({ sid: reservationId, csrf })
        : await api.moment.reserveMoment({ sid: reservationId, csrf })
      if (!owner.isCurrent())
        return
      if (response.code !== 0)
        throw new Error(response.message || t('moment_card.reservation_failed'))

      commit(moment.id, { additional: {
        ...additional,
        isReserved: !wasReserved,
        reservationTotal: Math.max(0, (additional.reservationTotal || 0) + (wasReserved ? -1 : 1)),
      } })
      toast.success(t(!wasReserved
        ? 'moment_card.reservation_succeeded'
        : 'moment_card.reservation_cancelled'))
    }
    catch (error) {
      if (!owner.isCurrent())
        return
      toast.error(error instanceof Error ? error.message : t('moment_card.reservation_failed'))
    }
    finally {
      if (reservationRequests.get(moment.id) === requestId) {
        reservationRequests.delete(moment.id)
      }
    }
  }

  function isWatchLaterAdded(target: WatchLaterTarget) {
    const stateKey = getWatchLaterStateKey(target)
    if (!stateKey)
      return false

    const aid = getDirectWatchLaterAid(target) ?? watchLaterAidByTarget.get(stateKey)
    if (!aid) {
      void resolveMomentWatchLaterAid(target)
      return false
    }
    return topBarStore.isInWatchLater(aid)
  }

  function isWatchLaterLoading(target: WatchLaterTarget) {
    const stateKey = getWatchLaterStateKey(target)
    return Boolean(stateKey && watchLaterRequests.has(stateKey))
  }

  async function resolveMomentWatchLaterAid(target: WatchLaterTarget): Promise<number | undefined> {
    const directAid = getDirectWatchLaterAid(target)
    if (directAid)
      return directAid

    const stateKey = getWatchLaterStateKey(target)
    if (!stateKey)
      return undefined
    const cachedAid = watchLaterAidByTarget.get(stateKey)
    if (cachedAid)
      return cachedAid
    const pendingRequest = watchLaterAidRequests.get(stateKey)
    if (pendingRequest)
      return pendingRequest

    const owner = lifetime.capture()
    const request = resolveWatchLaterAid(target)
      .then((aid) => {
        if (aid && owner.isCurrent())
          watchLaterAidByTarget.set(stateKey, aid)
        return aid
      })
      .catch(() => undefined)
      .finally(() => {
        if (watchLaterAidRequests.get(stateKey) === request)
          watchLaterAidRequests.delete(stateKey)
      })
    watchLaterAidRequests.set(stateKey, request)
    return request
  }

  async function toggleMomentWatchLater(target: WatchLaterTarget, isViewCurrent: () => boolean = () => true) {
    const stateKey = getWatchLaterStateKey(target)
    if (!stateKey || watchLaterRequests.has(stateKey))
      return

    const csrf = getCSRF()
    if (!csrf) {
      toast.warning(t('moments.login_to_watch_later'))
      return
    }

    const owner = lifetime.capture()
    if (!owner.isCurrent())
      return
    const requestId = Symbol(stateKey)
    watchLaterRequests.set(stateKey, requestId)
    try {
      const result = await updateOwnedWatchLater(target, 'toggle', {
        accountId: owner.accountId,
        isCurrent: () => owner.isCurrent() && isViewCurrent(),
      }, topBarStore, resolveMomentWatchLaterAid)
      if (!owner.isCurrent() || !isViewCurrent())
        return
      if (result.status === 'unavailable')
        toast.error(t('moments.watch_later_unavailable'))
      else if (result.status === 'failed')
        toast.error(result.message || t('moments.watch_later_failed_retry'))
    }
    catch (error) {
      if (owner.isCurrent() && isViewCurrent()) {
        reportRuntimeFailure('Watch Later mutation failed', error)
        toast.error(error instanceof Error ? error.message : t('moments.watch_later_failed_retry'))
      }
    }
    finally {
      if (watchLaterRequests.get(stateKey) === requestId) {
        watchLaterRequests.delete(stateKey)
      }
    }
  }
  function reset() {
    lifetime.invalidate()
    likingMomentRequests.clear()
    reservationRequests.clear()
    watchLaterRequests.clear()
    watchLaterAidByTarget.clear()
    watchLaterAidRequests.clear()
  }
  onScopeDispose(() => {
    reset()
    lifetime.dispose()
  })
  return {
    getDisplayMoment(moment: DisplayMoment): DisplayMoment {
      const pending = likingMomentRequests.get(moment.id)
      return pending ? { ...moment, isLiked: pending.isLiked, likeCount: pending.likeCount } : moment
    },
    likingMomentIds: readonly(likingMomentRequests),
    reservationLoadingMomentIds: readonly(reservationRequests),
    watchLaterLoadingMomentIds: readonly(watchLaterRequests),
    toggleMomentLike,
    toggleMomentReservation,
    isWatchLaterAdded,
    isWatchLaterLoading,
    toggleMomentWatchLater,
    reset,
  }
}
