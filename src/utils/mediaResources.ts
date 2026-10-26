/** Detach decoded image resources when a card leaves its virtual window. */
export function releaseElementImages(root: Element | null) {
  root?.querySelectorAll('source').forEach(source => source.removeAttribute('srcset'))
  root?.querySelectorAll('img').forEach((image) => {
    image.removeAttribute('srcset')
    image.removeAttribute('src')
  })
}

/** Release a media element owned by a preview. */
export function releaseMediaElement(media: HTMLMediaElement) {
  media.pause()
  media.srcObject = null
  media.removeAttribute('src')
  media.removeAttribute('srcset')
  media.querySelectorAll('source').forEach((source) => {
    source.removeAttribute('src')
    source.removeAttribute('srcset')
  })
  media.load()
}

/** Vue owns the iframe node; clear its browsing context before Vue detaches it. */
export function releaseIframeMedia(iframe: HTMLIFrameElement | null) {
  if (!iframe)
    return
  // The document owns its native player (and any MSE adapter). Mutating its
  // sources first can start a recovery request while the frame is being closed.
  iframe.src = 'about:blank'
}
