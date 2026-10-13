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
  let sessionId = crypto.randomUUID()
  let binding: IframeDocumentBinding | undefined
  let boundFrame: HTMLIFrameElement | null | undefined
  function request() {
    sessionId = crypto.randomUUID()
    binding = undefined
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
      postMessageToIframe(getFrame(), { type: IFRAME_DOCUMENT_CONTEXT, phase: 'challenge', documentId: data.documentId, sessionId })
      return
    }
    if (data.phase !== 'ready' || data.sessionId !== sessionId
      || (binding?.documentId === data.documentId && Number(data.revision) <= binding.revision)) {
      return
    }
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
  let revision = 0
  let sessionId: string | undefined
  function report() {
    if (window.parent === window)
      return
    revision++
    setParentDocumentBinding(sessionId ? { documentId, sessionId, revision } : undefined)
    postMessageToParent({ type: IFRAME_DOCUMENT_CONTEXT, phase: sessionId ? 'ready' : 'hello', documentId, revision, sessionId, href: location.href })
  }
  return {
    report,
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
      setParentDocumentBinding()
    },
  }
}
