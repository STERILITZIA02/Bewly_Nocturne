import { computed, readonly, ref, shallowRef } from 'vue'

import { IFRAME_PLAYER_CONTEXT } from '~/constants/globalEvents'
import type { DefaultVideoPlayerMode } from '~/logic/storage'
import { getParentMessageData, postMessageToParent } from '~/utils/iframeMessage'

const iframePageActive = ref(false)
export type IframePlaybackContext = 'momentsDialog'
const playerBinding = shallowRef<{ context?: IframePlaybackContext, sessionId: string, generation: number, documentId: string, requestId: number, href: string }>()
const playbackContext = computed(() => playerBinding.value?.context)

export function useIframePlaybackContext() {
  return playbackContext
}

export function reportIframePlayerMode(mode: DefaultVideoPlayerMode) {
  const binding = playerBinding.value
  if (binding?.href === location.href)
    postMessageToParent({ type: IFRAME_PLAYER_CONTEXT, phase: 'mode', ...binding, mode })
}

/**
 * Uses the existing guarded iframe channel. A document nonce plus a navigation
 * request and parent session reject old frames, reloads and late SPA replies.
 */
export function setupIframePlaybackContext(onChanged: (contextChanged: boolean) => void) {
  const documentId = crypto.randomUUID()
  let requestId = 0
  let disposed = false
  let parentSessionId: string | undefined
  let parentGeneration = -1
  function request() {
    if (!disposed && window.parent !== window)
      postMessageToParent({ type: IFRAME_PLAYER_CONTEXT, phase: 'ready', documentId, requestId: ++requestId, href: location.href, sessionId: parentSessionId, generation: parentGeneration })
  }
  function receive(event: MessageEvent) {
    const message = getParentMessageData(event, [IFRAME_PLAYER_CONTEXT])
    if (!message || disposed)
      return
    if (message.phase === 'request') {
      if (typeof message.sessionId !== 'string' || !Number.isSafeInteger(message.generation) || Number(message.generation) < parentGeneration)
        return
      parentSessionId = message.sessionId
      parentGeneration = Number(message.generation)
      request()
      return
    }
    if (message.phase !== 'context' || message.documentId !== documentId || message.requestId !== requestId
      || message.href !== location.href || typeof message.sessionId !== 'string'
      || message.sessionId !== parentSessionId || message.generation !== parentGeneration
      || (message.context !== undefined && message.context !== 'momentsDialog')) {
      return
    }
    const contextChanged = playerBinding.value?.context !== message.context
    playerBinding.value = { context: message.context as IframePlaybackContext | undefined, sessionId: message.sessionId, generation: parentGeneration, documentId, requestId, href: location.href }
    onChanged(contextChanged)
  }
  if (window.parent !== window) {
    window.addEventListener('message', receive)
    request()
  }
  return {
    request,
    dispose() {
      disposed = true
      window.removeEventListener('message', receive)
      playerBinding.value = undefined
    },
  }
}

export function setIframePageActive(active: boolean) {
  iframePageActive.value = active
}

export function useIframePageActive() {
  return readonly(iframePageActive)
}
