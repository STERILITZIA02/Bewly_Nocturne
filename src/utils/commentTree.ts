export interface CommentTreeNodeInput {
  id: string
  rootId: string
  parentId: string
  createdAt: number
  originalOrder: number
}

export interface CommentTreeLayoutNode {
  id: string
  parentId: string | null
  originalParentId: string | null
  depth: number
  visualOrder: number
  directParentVisible: boolean
  hasChildren: boolean
  isLastSibling: boolean
  ancestorContinuationDepths: number[]
}

interface ResolvedCommentTreeNode {
  input: CommentTreeNodeInput
  parentId: string | null
  originalParentId: string | null
  directParentVisible: boolean
  children: ResolvedCommentTreeNode[]
}

function normalizeRelationId(value: string): string | null {
  const id = value.trim()
  return id && id !== '0' ? id : null
}

function compareTreeNodes(a: ResolvedCommentTreeNode, b: ResolvedCommentTreeNode): number {
  const aCreatedAt = Number.isFinite(a.input.createdAt) && a.input.createdAt > 0 ? a.input.createdAt : null
  const bCreatedAt = Number.isFinite(b.input.createdAt) && b.input.createdAt > 0 ? b.input.createdAt : null
  if (aCreatedAt !== null && bCreatedAt !== null && aCreatedAt !== bCreatedAt)
    return aCreatedAt - bCreatedAt
  if (aCreatedAt !== null && bCreatedAt === null)
    return -1
  if (aCreatedAt === null && bCreatedAt !== null)
    return 1
  if (a.input.originalOrder !== b.input.originalOrder)
    return a.input.originalOrder - b.input.originalOrder
  return a.input.id.localeCompare(b.input.id)
}

function wouldCreateCycle(
  nodeId: string,
  parentId: string,
  candidateParentById: Map<string, string | null>,
  acyclic: Set<string>,
): boolean {
  if (acyclic.has(parentId))
    return false
  const visited = new Set<string>()
  let currentId: string | null = parentId
  while (currentId) {
    if (currentId === nodeId)
      return true
    if (acyclic.has(currentId))
      break
    // An ancestor's own edge will break its cycle. Keep valid descendants
    // attached instead of promoting every reply below that cycle to a root.
    if (visited.has(currentId))
      return false
    visited.add(currentId)
    currentId = candidateParentById.get(currentId) ?? null
  }
  for (const id of visited)
    acyclic.add(id)
  return false
}

export function buildCommentTree(inputs: CommentTreeNodeInput[], maxDepth = Number.POSITIVE_INFINITY): CommentTreeLayoutNode[] {
  const uniqueInputs: CommentTreeNodeInput[] = []
  const seenIds = new Set<string>()
  inputs.forEach((input) => {
    const id = input.id.trim()
    if (!id || seenIds.has(id))
      return
    seenIds.add(id)
    uniqueInputs.push({ ...input, id })
  })

  const inputById = new Map(uniqueInputs.map(input => [input.id, input]))
  const candidateParentById = new Map<string, string | null>()
  uniqueInputs.forEach((input) => {
    const parentId = normalizeRelationId(input.parentId)
    const rootId = normalizeRelationId(input.rootId)
    if (!parentId || parentId === input.id || rootId === input.id)
      candidateParentById.set(input.id, null)
    else if (inputById.has(parentId))
      candidateParentById.set(input.id, parentId)
    else if (rootId && rootId !== input.id && inputById.has(rootId))
      candidateParentById.set(input.id, rootId)
    else
      candidateParentById.set(input.id, null)
  })

  const resolvedById = new Map<string, ResolvedCommentTreeNode>()
  const acyclic = new Set<string>()
  uniqueInputs.forEach((input) => {
    const originalParentId = normalizeRelationId(input.parentId)
    const rootId = normalizeRelationId(input.rootId)
    let parentId = candidateParentById.get(input.id) ?? null
    let directParentVisible = !originalParentId || originalParentId === input.id || inputById.has(originalParentId)

    if (parentId && wouldCreateCycle(input.id, parentId, candidateParentById, acyclic)) {
      const fallbackRootId = rootId && rootId !== input.id && inputById.has(rootId) ? rootId : null
      parentId = fallbackRootId && !wouldCreateCycle(input.id, fallbackRootId, candidateParentById, acyclic)
        ? fallbackRootId
        : null
      directParentVisible = false
    }
    if (originalParentId && originalParentId !== input.id && !inputById.has(originalParentId))
      directParentVisible = false
    candidateParentById.set(input.id, parentId)
    if (!parentId || acyclic.has(parentId))
      acyclic.add(input.id)

    resolvedById.set(input.id, {
      input,
      parentId,
      originalParentId,
      directParentVisible,
      children: [],
    })
  })

  // Flatten only the visual parent beyond the depth limit. Capping CSS offsets
  // alone leaves parent and child avatars in the same column and breaks rails.
  const depthById = new Map<string, number>()
  const resolveDepth = (node: ResolvedCommentTreeNode) => {
    const path: ResolvedCommentTreeNode[] = []
    let current: ResolvedCommentTreeNode | undefined = node
    while (current && !depthById.has(current.input.id)) {
      path.push(current)
      current = current.parentId ? resolvedById.get(current.parentId) : undefined
    }
    for (let index = path.length - 1; index >= 0; index--) {
      const entry = path[index]
      const parent = entry.parentId ? resolvedById.get(entry.parentId) : undefined
      const parentDepth = parent ? depthById.get(parent.input.id)! : -1
      const depth = Math.min(parentDepth + 1, Math.max(1, maxDepth))
      if (parent && depth <= parentDepth)
        entry.parentId = parent.parentId
      depthById.set(entry.input.id, depth)
    }
  }
  if (Number.isFinite(maxDepth))
    resolvedById.forEach(resolveDepth)

  const roots: ResolvedCommentTreeNode[] = []
  resolvedById.forEach((node) => {
    const parent = node.parentId ? resolvedById.get(node.parentId) : undefined
    if (parent)
      parent.children.push(node)
    else
      roots.push(node)
  })
  roots.sort(compareTreeNodes)
  resolvedById.forEach(node => node.children.sort(compareTreeNodes))

  const layout: CommentTreeLayoutNode[] = []
  const stack = roots.map((node, index) => ({ node, depth: 0, isLastSibling: index === roots.length - 1, ancestorContinuationDepths: [] as number[] })).reverse()
  while (stack.length) {
    const { node, depth, isLastSibling, ancestorContinuationDepths } = stack.pop()!
    layout.push({
      id: node.input.id,
      parentId: node.parentId,
      originalParentId: node.originalParentId,
      depth,
      visualOrder: layout.length,
      directParentVisible: node.directParentVisible,
      hasChildren: node.children.length > 0,
      isLastSibling,
      ancestorContinuationDepths,
    })
    const childContinuationDepths = isLastSibling
      ? ancestorContinuationDepths
      : [...ancestorContinuationDepths, depth]
    for (let index = node.children.length - 1; index >= 0; index--)
      stack.push({ node: node.children[index], depth: depth + 1, isLastSibling: index === node.children.length - 1, ancestorContinuationDepths: childContinuationDepths })
  }

  return layout
}
