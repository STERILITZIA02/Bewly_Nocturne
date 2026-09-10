import type { VideoInfo } from '~/models/video/videoInfo'
import type { createAccountLifetime } from '~/utils/accountLifetime'
import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'
import { resolvePgcEpisodeVideoIds } from '~/utils/pgcEpisode'

export interface WatchLaterIdentity {
  aid?: number | string
  bvid?: string
  epid?: number
  roomid?: number
}

export type WatchLaterMutationOwner = ReturnType<ReturnType<typeof createAccountLifetime>['capture']>

interface WatchLaterMembership {
  isLogin: boolean
  userInfo: { mid?: number }
  ensureWatchLaterState: () => Promise<boolean>
  isInWatchLater: (aid: number) => boolean
  commitWatchLaterMutation: (aid: number, added: boolean, accountId: number) => Promise<unknown>
}

type WatchLaterMutationResult
  = { status: 'cancelled' | 'unavailable' }
    | { status: 'failed', message?: string }
    | { status: 'success', aid: number, added: boolean }

/** One submitted operation; only the store owns membership and successful reconciliation. */
export async function updateOwnedWatchLater(
  target: WatchLaterIdentity,
  action: 'toggle' | 'remove',
  owner: WatchLaterMutationOwner,
  membership: WatchLaterMembership,
  resolveAid: (target: WatchLaterIdentity) => Promise<number | undefined> = resolveWatchLaterAid,
): Promise<WatchLaterMutationResult> {
  const { aid: targetAid, bvid, epid, roomid } = target
  const identity = { aid: targetAid, bvid, epid, roomid }
  const accountId = owner.accountId
  const csrf = getCSRF()
  const isSameAccount = () => accountId !== null && membership.isLogin
    && membership.userInfo.mid === accountId && String(getUserID()) === String(accountId)
    && !!csrf && getCSRF() === csrf
  const canSubmit = () => owner.isCurrent() && isSameAccount()
    && target.aid === targetAid && target.bvid === bvid && target.epid === epid && target.roomid === roomid
  if (!canSubmit())
    return { status: 'cancelled' }
  if (roomid)
    return { status: 'unavailable' }

  const aid = await resolveAid(identity)
  if (!canSubmit())
    return { status: 'cancelled' }
  if (!aid)
    return { status: 'unavailable' }

  if (action === 'toggle') {
    const loaded = await membership.ensureWatchLaterState()
    if (!canSubmit())
      return { status: 'cancelled' }
    if (!loaded)
      return { status: 'failed' }
  }
  const added = action === 'toggle' && !membership.isInWatchLater(aid)
  if (!canSubmit())
    return { status: 'cancelled' }
  const response = added
    ? await api.watchlater.saveToWatchLater({ aid, csrf })
    : await api.watchlater.removeFromWatchLater({ aid, csrf })
  if (response.code !== 0)
    return { status: 'failed', message: response.message }

  // Leaving the initiating view does not undo a sent request. Reconcile its
  // original aid for the same account, without writing any view-local state.
  if (accountId !== null && isSameAccount())
    await membership.commitWatchLaterMutation(aid, added, accountId)
  return { status: 'success', aid, added }
}

export function getDirectWatchLaterAid(target: WatchLaterIdentity): number | undefined {
  if (target.roomid)
    return undefined

  const aid = Number(target.aid || 0)
  return Number.isFinite(aid) && aid > 0 ? aid : undefined
}

export async function resolveWatchLaterAid(target: WatchLaterIdentity): Promise<number | undefined> {
  const directAid = getDirectWatchLaterAid(target)
  if (directAid)
    return directAid
  if (target.epid) {
    const ids = await resolvePgcEpisodeVideoIds(target.epid)
    return getDirectWatchLaterAid(ids || {})
  }
  if (!target.bvid)
    return undefined

  const result: VideoInfo = await api.video.getVideoInfo({ bvid: target.bvid })
  return result.code === 0 ? getDirectWatchLaterAid(result.data) : undefined
}
