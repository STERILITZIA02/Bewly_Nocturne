import type { InjectionKey } from 'vue'
import { provide, watch } from 'vue'

import type { AccountId } from '~/utils/accountScope'

import { useMomentPreviews } from '../../Moments/useMomentPreviews'

export const privateMessagePreviewsKey: InjectionKey<ReturnType<typeof useMomentPreviews>> = Symbol('private-message-previews')

/** One preview owner per visible conversation, using the existing stream lifecycle. */
export function usePrivateMessagePreviews(active: () => boolean, account: () => AccountId, talker: () => string) {
  const previews = useMomentPreviews(account, { videoEnabled: active, videoDelayed: () => false })
  provide(privateMessagePreviewsKey, previews)
  watch([active, account, talker], () => previews.reset(), { flush: 'sync' })
  return previews
}
