import { isMissingCommentParentMutationNode } from './commentMissingParents'

interface OwnChange {
  added: Node[]
  removed: Node[]
  previous: Node | null
  next: Node | null
}

const isBoundary = (node: Node | null) => node?.nodeType === Node.COMMENT_NODE && (node as Comment).data === ''
const sameNodes = (actual: NodeList, expected: Node[]) => actual.length === expected.length && expected.every((node, index) => actual[index] === node)

/** Move complete Lit item parts; unknown/shared boundaries leave the native list intact. */
export function moveCommentReplyParts(container: HTMLElement, replies: HTMLElement[], order: HTMLElement[], observer?: MutationObserver) {
  const native = new Set(replies)
  const used = new Set<Node>()
  const groups: Node[][] = []
  for (const renderer of order) {
    if (renderer.parentNode !== container)
      return { reordered: false, external: [] as MutationRecord[] }
    const start = renderer.previousSibling
    const end = renderer.nextSibling
    const group = native.has(renderer)
      ? isBoundary(start) && isBoundary(end) ? [start!, renderer, end!] : undefined
      : isMissingCommentParentMutationNode(renderer) ? [renderer] : undefined
    if (!group || group.some(node => used.has(node)))
      return { reordered: false, external: [] as MutationRecord[] }
    group.forEach(node => used.add(node))
    groups.push(group)
  }
  if (replies.some(renderer => !used.has(renderer)))
    return { reordered: false, external: [] as MutationRecord[] }
  const children = Array.from(container.childNodes)
  const indices = children.flatMap((node, index) => used.has(node) ? [index] : [])
  if (!indices.length)
    return { reordered: false, external: [] as MutationRecord[] }
  const region = children.slice(indices[0], indices.at(-1)! + 1)
  if (region.some(node => !used.has(node) && !(node.nodeType === Node.TEXT_NODE && !node.textContent?.trim())))
    return { reordered: false, external: [] as MutationRecord[] }

  const external = observer?.takeRecords() ?? []
  const expected: OwnChange[] = []
  let reference: Node | null = children[indices.at(-1)! + 1] ?? null
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index]
    if (group.at(-1)!.nextSibling !== reference) {
      const fragment = container.ownerDocument.createDocumentFragment()
      for (const node of group) {
        expected.push({ added: [], removed: [node], previous: node.previousSibling, next: node.nextSibling })
        fragment.append(node)
      }
      expected.push({ added: group, removed: [], previous: reference ? reference.previousSibling : container.lastChild, next: reference })
      container.insertBefore(fragment, reference)
    }
    reference = group[0]
  }
  for (const record of observer?.takeRecords() ?? []) {
    const own = record.type === 'childList' && record.target === container
      ? expected.findIndex(change => record.previousSibling === change.previous && record.nextSibling === change.next
        && sameNodes(record.addedNodes, change.added) && sameNodes(record.removedNodes, change.removed))
      : -1
    if (own < 0)
      external.push(record)
    else expected.splice(own, 1)
  }
  return { reordered: true, external }
}
