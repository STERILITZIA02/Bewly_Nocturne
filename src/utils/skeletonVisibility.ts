interface Group { count: number, visible: boolean }
interface Owner { groups: Map<HTMLElement, Group>, observer: IntersectionObserver, stop: () => void }
const owners = new WeakMap<Document, Owner>()

/** Share one visibility observer across all skeleton groups in a document. */
export function observeSkeletonGroup(block: HTMLElement) {
  const doc = block.ownerDocument
  const group = block.closest<HTMLElement>('[data-bew-skeleton-group], article, li, [role="status"]') ?? block.parentElement ?? block
  if (typeof IntersectionObserver === 'undefined')
    return () => {}
  let owner = owners.get(doc)
  if (!owner) {
    const groups = new Map<HTMLElement, Group>()
    const paint = (element: HTMLElement, state: Group) => element.toggleAttribute('data-bew-skeleton-paused', doc.hidden || !state.visible)
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const state = groups.get(entry.target as HTMLElement)
        if (state) {
          state.visible = entry.isIntersecting
          paint(entry.target as HTMLElement, state)
        }
      }
    })
    const visibilityChanged = () => groups.forEach((state, element) => paint(element, state))
    doc.addEventListener('visibilitychange', visibilityChanged)
    owner = { groups, observer, stop: () => {
      observer.disconnect()
      doc.removeEventListener('visibilitychange', visibilityChanged)
      owners.delete(doc)
    } }
    owners.set(doc, owner)
  }
  const state = owner.groups.get(group)
  if (state) {
    state.count++
  }
  else {
    owner.groups.set(group, { count: 1, visible: false })
    group.setAttribute('data-bew-skeleton-paused', '')
    owner.observer.observe(group)
  }
  let active = true
  return () => {
    if (!active)
      return
    active = false
    const current = owner.groups.get(group)
    if (current && --current.count === 0) {
      owner.observer.unobserve(group)
      owner.groups.delete(group)
      group.removeAttribute('data-bew-skeleton-paused')
    }
    if (!owner.groups.size)
      owner.stop()
  }
}
