import { getIframeMessageData, getParentMessageData, postMessageToIframe, postMessageToParent, setIframeDocumentBinding, setParentDocumentBinding } from './iframeMessage'

export const IFRAME_DOCUMENT_CONTEXT = 'BEWLY_IFRAME_DOCUMENT_CONTEXT'

export interface IframeDocumentBinding {
  documentId: string
  sessionId: string
  revision: number
  href: string
}

/** A load rotates the host challenge; WindowProxy and src alone are not identity. */
export function createIframeDocumentHost(getFrame: () => HTMLIFrameElement | null | undefined) {
  let sessionId: string = crypto.randomUUID()
  let binding: IframeDocumentBinding | undefined
  let boundFrame: HTMLIFrameElement | null | undefined
  const challenges = new Map<string, string>()
  function request() {
    sessionId = crypto.randomUUID()
    binding = undefined
    challenges.clear()
    setIframeDocumentBinding(boundFrame)
    boundFrame = undefined
    postMessageToIframe(getFrame(), { type: IFRAME_DOCUMENT_CONTEXT, phase: 'request' })
  }
  function receive(event: MessageEvent): IframeDocumentBinding | undefined {
    const data = getIframeMessageData(event, getFrame())
    if (data?.type !== IFRAME_DOCUMENT_CONTEXT || typeof data.documentId !== 'string' || !data.documentId
      || typeof data.href !== 'string' || !Number.isSafeInteger(data.revision) || Number(data.revision) < 1) {
      return
    }
    try {
      const url = new URL(data.href)
      if (url.origin !== event.origin)
        return
      // When readable, verify the live address as well as the guarded source.
      let actual: string | undefined
      try {
        actual = getFrame()?.contentWindow?.location.href
      }
      catch {}
      if (actual && actual !== data.href)
        return
    }
    catch { return }
    if (data.phase === 'hello') {
      const challenge = crypto.randomUUID()
      challenges.set(data.documentId, challenge)
      postMessageToIframe(getFrame(), { type: IFRAME_DOCUMENT_CONTEXT, phase: 'challenge', documentId: data.documentId, sessionId: challenge })
      return
    }
    if (data.phase !== 'ready' || typeof data.sessionId !== 'string')
      return
    const currentSession = binding?.documentId === data.documentId && data.sessionId === sessionId
    if ((!currentSession && challenges.get(data.documentId) !== data.sessionId)
      || (currentSession && Number(data.revision) <= binding!.revision)) {
      return
    }
    sessionId = data.sessionId
    challenges.clear()
    binding = { documentId: data.documentId, sessionId, revision: Number(data.revision), href: data.href }
    boundFrame = getFrame()
    setIframeDocumentBinding(boundFrame, binding)
    return binding
  }
  return {
    request,
    receive,
    matches(data: Record<string, unknown>) {
      return Boolean(binding && data.documentId === binding.documentId && data.sessionId === binding.sessionId
        && data.revision === binding.revision && data.href === binding.href)
    },
    send(message: Record<string, unknown>) {
      return Boolean(binding && postMessageToIframe(getFrame(), { ...message, ...binding }))
    },
    clear() {
      challenges.clear()
      setIframeDocumentBinding(boundFrame)
      boundFrame = undefined
      sessionId = crypto.randomUUID()
      binding = undefined
    },
  }
}

/** One temporary binding per child document, never persisted into preferences. */
export function createIframeDocumentClient() {
  const documentId = crypto.randomUUID()
  const bindingListeners = new Set<(binding?: IframeDocumentBinding) => void>()
  let revision = 0
  let sessionId: string | undefined
  function currentBinding(): IframeDocumentBinding | undefined {
    return sessionId ? { documentId, sessionId, revision, href: location.href } : undefined
  }
  function report() {
    if (window.parent === window)
      return
    revision++
    const binding = currentBinding()
    setParentDocumentBinding(binding)
    postMessageToParent({ type: IFRAME_DOCUMENT_CONTEXT, phase: sessionId ? 'ready' : 'hello', documentId, revision, sessionId, href: location.href })
    bindingListeners.forEach(listener => listener(binding))
  }
  return {
    report,
    reconnect() {
      sessionId = undefined
      report()
    },
    subscribe(listener: (binding?: IframeDocumentBinding) => void) {
      bindingListeners.add(listener)
      listener(currentBinding())
      return () => bindingListeners.delete(listener)
    },
    receive(event: MessageEvent) {
      const data = getParentMessageData(event, [IFRAME_DOCUMENT_CONTEXT])
      if (data?.phase === 'request') {
        sessionId = undefined
        report()
      }
      else if (data?.phase === 'challenge' && data.documentId === documentId && typeof data.sessionId === 'string') {
        sessionId = data.sessionId
        report()
      }
    },
    matches(data: Record<string, unknown>) {
      return Boolean(sessionId && data.documentId === documentId && data.sessionId === sessionId
        && data.revision === revision && data.href === location.href)
    },
    send(message: Record<string, unknown>) {
      return Boolean(sessionId && postMessageToParent({ ...message, documentId, sessionId, revision, href: location.href }))
    },
    dispose() {
      sessionId = undefined
      bindingListeners.clear()
      setParentDocumentBinding()
    },
  }
}
