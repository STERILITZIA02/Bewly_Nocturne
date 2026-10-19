const listeners = new Set<() => void>()

function dispatch() {
  for (const listener of [...listeners]) {
    if (listeners.has(listener))
      listener()
  }
}

export function getFullscreenElement() {
  const doc = document as Document & { webkitFullscreenElement?: Element | null }
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

/**
 * One pair of document listeners for every preview that currently holds a
 * media element. Static cards subscribe nothing; the last owner detaches.
 */
export function subscribeFullscreenChange(listener: () => void) {
  if (!listeners.size) {
    document.addEventListener('fullscreenchange', dispatch)
    document.addEventListener('webkitfullscreenchange', dispatch)
  }
  listeners.add(listener)
  let subscribed = true
  return () => {
    if (!subscribed)
      return
    subscribed = false
    listeners.delete(listener)
    if (!listeners.size) {
      document.removeEventListener('fullscreenchange', dispatch)
      document.removeEventListener('webkitfullscreenchange', dispatch)
    }
  }
}
