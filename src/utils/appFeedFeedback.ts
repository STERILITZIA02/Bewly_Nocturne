import type { Video } from '~/components/VideoCard/types'
import type { AppClientEndpoint } from '~/constants/appClient'
import { APP_CLIENT_FEEDBACK_PARAMS } from '~/constants/appClient'
import type { DislikeReason, Type as ThreePointV2Type } from '~/models/video/appForYou'

import { isUncertainAppClientFailure } from './appClient'
import type { AppAuthSnapshot } from './authProvider'
import { isAppAccessTokenInvalidResponse, isAppAuthCurrent, refreshInvalidAppAccessToken, requestAppClient } from './authProvider'

export type AppFeedFeedbackType = ThreePointV2Type.Dislike | ThreePointV2Type.Feedback

export interface AppFeedFeedbackSelection extends Pick<DislikeReason, 'mid' | 'rid' | 'tag_id'> {
  reasonId?: number
  feedbackId?: number
}

export function getAppFeedFeedbackReasonKey(type: AppFeedFeedbackType, reason: DislikeReason): string {
  return JSON.stringify([type, reason.id, reason.mid ?? null, reason.rid ?? null, reason.tag_id ?? null])
}

export interface AppFeedFeedbackTarget {
  goto: string
  id: string
}

export type AppFeedFeedbackOutcome = 'succeeded' | 'failed' | 'uncertain' | 'expired' | 'stale'

export function getAppFeedFeedbackTarget(video: Pick<Video, 'goto' | 'param' | 'id' | 'aid'> | undefined): AppFeedFeedbackTarget | null {
  const goto = `${video?.goto ?? ''}`.trim()
  const id = `${video?.param || (goto === 'av' ? video?.aid || video?.id : '') || ''}`.trim()
  return goto && /^[1-9]\d*$/.test(id) ? { goto, id } : null
}

export function isSameAppFeedFeedbackTarget(left: AppFeedFeedbackTarget | null, right: AppFeedFeedbackTarget | null) {
  return !!left && !!right && left.goto === right.goto && left.id === right.id
}

export async function submitAppFeedFeedback(
  endpoint: Extract<AppClientEndpoint, 'feedDislike' | 'feedDislikeCancel'>,
  auth: AppAuthSnapshot,
  target: AppFeedFeedbackTarget,
  selection?: AppFeedFeedbackSelection,
): Promise<{ outcome: AppFeedFeedbackOutcome, message?: string }> {
  const params = Object.freeze({
    access_key: auth.accessToken,
    goto: target.goto,
    id: target.id,
    ...(endpoint === 'feedDislike' && selection?.reasonId !== undefined ? { reason_id: selection.reasonId } : {}),
    ...(endpoint === 'feedDislike' && selection?.feedbackId !== undefined ? { feedback_id: selection.feedbackId } : {}),
    ...(endpoint === 'feedDislike' && selection?.mid !== undefined ? { mid: selection.mid } : {}),
    ...(endpoint === 'feedDislike' && selection?.rid !== undefined ? { rid: selection.rid } : {}),
    ...(endpoint === 'feedDislike' && selection?.tag_id !== undefined ? { tag_id: selection.tag_id } : {}),
    ...APP_CLIENT_FEEDBACK_PARAMS,
  })
  try {
    const response = await requestAppClient<{ code?: number, message?: string }>(endpoint, params, { mid: auth.mid })
    if (!isAppAuthCurrent(auth))
      return { outcome: 'stale' }
    if (response?.code === 0)
      return { outcome: 'succeeded' }
    if (isAppAccessTokenInvalidResponse(response)) {
      void refreshInvalidAppAccessToken()
      return { outcome: 'expired' }
    }
    return { outcome: 'failed', message: response?.message }
  }
  catch (error) {
    if (!isAppAuthCurrent(auth))
      return { outcome: 'stale' }
    return { outcome: isUncertainAppClientFailure(error) ? 'uncertain' : 'failed' }
  }
}
