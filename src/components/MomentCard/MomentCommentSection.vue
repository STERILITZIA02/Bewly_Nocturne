<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import LoadingRing from '~/components/LoadingRing.vue'
import { confirmDialogKey } from '~/composables/useConfirmDialog'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { buildMomentCommentPermalink } from '~/utils/commentPermalink'
import { captureCommentReadingAnchor } from '~/utils/commentReadingAnchor'
import type { CommentTreeLayoutNode } from '~/utils/commentTree'
import { normalizeIntlLocale } from '~/utils/locale'
import { getCSRF, getUserID } from '~/utils/main'
import { createMomentCommentSessionCache, DEFAULT_MOMENT_COMMENT_SORT, MOMENT_COMMENT_SESSIONS } from '~/utils/momentCommentSession'
import type { MomentCommentTarget } from '~/utils/momentCommentTarget'
import { readMomentCommentTarget, resolveMomentCommentTarget } from '~/utils/momentCommentTarget'

import type { MomentCommentViewNode } from './commentThreadLayout'
import { buildMomentCommentThread } from './commentThreadLayout'
import type { MomentCommentItem } from './commentUtils'
import { flattenMomentCommentReplies, mergeMomentComments, normalizeMomentComment, normalizeMomentCommentPage, normalizeMomentCommentRepliesPage } from './commentUtils'
import MomentCommentMedia from './MomentCommentMedia.vue'
import MomentCommentRichText from './MomentCommentRichText.vue'
import MomentCommentSkeleton from './MomentCommentSkeleton.vue'
import MomentCommentTreeGuides from './MomentCommentTreeGuides.vue'
import MomentReplyComposer from './MomentReplyComposer.vue'
import type { DisplayMoment } from './types'
import { useMomentCommentThread } from './useMomentCommentThread'
import { getAvatarThumbnailUrl } from './utils'

const props = withDefaults(defineProps<{
  moment: DisplayMoment
  active?: boolean
}>(), { active: true })

const emit = defineEmits<{
  openImagePreview: [images: string[], index: number, trigger: HTMLElement]
  interactiveResize: []
  writingChange: [pending: boolean]
  posted: []
  removed: [count: number]
}>()

interface MomentCommentThreadView {
  root: MomentCommentItem
  revision: number
  nodes: MomentCommentViewNode[]
  hasMoreReplies: boolean
  repliesLoading: boolean
  repliesError?: string
  repliesLoaded: boolean
}

const { locale, t } = useI18n()
const toast = useToast()
const topBarStore = useTopBarStore()
const accountId = computed(() => topBarStore.userInfo.mid ? String(topBarStore.userInfo.mid) : '')
const getAccountIdentity = () => `${accountId.value || 'guest'}:${getUserID() ?? 'guest'}`
const getSourceIdentity = () => `${getAccountIdentity()}:${props.moment.id}:${props.moment.commentType || 0}:${props.moment.commentId || ''}`
const target = ref<MomentCommentTarget | null>(null)
const commentId = computed(() => target.value?.oid || '')
const commentType = computed(() => target.value?.type || 0)
const sort = ref<0 | 1>(DEFAULT_MOMENT_COMMENT_SORT)
const getCommentIdentity = () => `${getSourceIdentity()}:${commentType.value}:${commentId.value}:${sort.value}`
const sharedSessions = inject(MOMENT_COMMENT_SESSIONS, null)
const sessions = sharedSessions ?? createMomentCommentSessionCache(getAccountIdentity())
const sessionLease = shallowRef<ReturnType<typeof sessions.open>>(null)
let sessionSource = ''
let hasLoaded = false
const listRef = ref<HTMLElement | null>(null)
let restoredScrollTop = 0
const resolvingTarget = ref(false)
const comments = ref<MomentCommentItem[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref('')
const hasMore = ref(false)
const nextPage = ref(1)
const likedIds = reactive(new Set<string>())
const likeCounts = reactive<Record<string, number>>({})
const collapsedIds = reactive(new Set<string>())
const replyComposer = ref<InstanceType<typeof MomentReplyComposer> | null>(null)
const replyTarget = shallowRef<MomentCommentItem | null>(null)
const composerSlot = ref<HTMLElement | null>(null)
const { height: composerHeight } = useElementSize(composerSlot, { width: 0, height: 0 }, { box: 'border-box' })
// Reserve the measured editor height only at the end of the scroll content.
// Inline on the reserving element: an inherited variable on the viewport
// would restyle every comment each time the editor grows.
const composerReserveStyle = computed(() => {
  if (!target.value || !props.active)
    return undefined
  const height = `${composerHeight.value}px`
  return {
    paddingBottom: `calc(${height} + var(--bew-space-4))`,
    minHeight: `min(60dvh, calc(${height} + var(--bew-comment-state-min-height)))`,
    scrollPaddingBottom: `calc(${height} + var(--bew-space-4))`,
  }
})
const replyInteracting = ref(false)
watch(composerHeight, () => {
  const list = listRef.value
  if (!list || list.scrollHeight - list.scrollTop - list.clientHeight > 1)
    return
  // Keep the last comment visible when the reply label or draft grows the editor.
  void nextTick(() => {
    if (list === listRef.value && props.active)
      list.scrollTop = list.scrollHeight
  })
})
const replyPending = ref(false)
const postedCount = ref(0)
const removedCount = ref(0)
const confirmService = inject(confirmDialogKey, null)
let mutationOwner = new AbortController()
watch(() => props.moment.commentCount, () => {
  postedCount.value = 0
  removedCount.value = 0
})
watch(() => replyInteracting.value || replyPending.value || sessions.hasPendingLikes(sessionLease.value), pending => emit('writingChange', pending), { flush: 'sync' })
let requestGeneration = 0
let disposed = false
let readOwner = new AbortController()

const {
  getThreadState,
  loadMoreReplies,
  resetThreads,
  cancelReads: cancelReplyReads,
  revision: threadRevision,
  seedThread,
  snapshotThreads,
  restoreThreads,
} = useMomentCommentThread(toRef(() => commentId.value), toRef(() => commentType.value), sort)

function cancelReads() {
  readOwner.abort()
  readOwner = new AbortController()
  requestGeneration += 1
  loading.value = false
  loadingMore.value = false
  resolvingTarget.value = false
  cancelReplyReads()
}

function saveSession() {
  if (!sessionLease.value || !hasLoaded || sessionSource !== getSourceIdentity())
    return
  sessions.save(sessionLease.value, {
    comments: comments.value,
    nextPage: nextPage.value,
    hasMore: hasMore.value,
    threads: snapshotThreads(),
    likedIds: [...likedIds],
    likeCounts: { ...likeCounts },
    scrollTop: listRef.value?.scrollTop ?? restoredScrollTop,
    collapsedIds: [...collapsedIds],
  })
}

async function restoreScroll() {
  const identity = getCommentIdentity()
  await nextTick()
  if (identity === getCommentIdentity() && listRef.value)
    listRef.value.scrollTop = restoredScrollTop
}

async function initializeComments(nextSort?: 0 | 1) {
  if (sessionSource !== getSourceIdentity()) {
    replyTarget.value = null
    replyPending.value = false
  }
  cancelReads()
  const generation = ++requestGeneration
  const signal = readOwner.signal
  sessionSource = getSourceIdentity()
  const source = sessionSource
  const isCurrent = () => !disposed && generation === requestGeneration && source === getSourceIdentity()
  if (!sharedSessions)
    sessions.setAccount(getAccountIdentity())
  if (sessionLease.value)
    sessions.release(sessionLease.value)
  sessionLease.value = null
  target.value = null
  hasLoaded = false
  restoredScrollTop = 0
  comments.value = []
  loading.value = false
  loadingMore.value = false
  hasMore.value = false
  nextPage.value = 1
  loadError.value = ''
  likedIds.clear()
  collapsedIds.clear()
  Object.keys(likeCounts).forEach(key => delete likeCounts[key])
  resetThreads()
  if (props.active === false || document.hidden) {
    resolvingTarget.value = false
    return
  }
  resolvingTarget.value = true
  try {
    const resolved = readMomentCommentTarget(props.moment.commentId, props.moment.commentType)
      || sessions?.getTarget(getAccountIdentity(), props.moment.id)
      || await resolveMomentCommentTarget(props.moment, id => api.moment.getMomentDetail({ id }, { signal }), isCurrent)
    if (!isCurrent())
      return
    if (!resolved)
      throw new Error('Comment target unavailable')
    target.value = resolved
    sessionLease.value = sessions.open(getAccountIdentity(), props.moment.id, resolved, nextSort)
    sort.value = sessionLease.value?.sort ?? nextSort ?? DEFAULT_MOMENT_COMMENT_SORT
    const snapshot = sessionLease.value && sessions.restore(sessionLease.value)
    resolvingTarget.value = false
    if (snapshot) {
      comments.value = snapshot.comments
      nextPage.value = snapshot.nextPage
      hasMore.value = snapshot.hasMore
      snapshot.likedIds.forEach(id => likedIds.add(id))
      Object.assign(likeCounts, snapshot.likeCounts)
      restoreThreads(snapshot.threads)
      restoredScrollTop = snapshot.scrollTop
      snapshot.collapsedIds?.forEach(id => collapsedIds.add(id))
      hasLoaded = true
      void restoreScroll()
    }
    else {
      void loadComments(true)
    }
  }
  catch {
    if (isCurrent())
      loadError.value = t('moment_card.comments_unavailable')
  }
  finally {
    if (isCurrent())
      resolvingTarget.value = false
  }
}

function refreshComments() {
  if (target.value)
    void loadComments(true)
  else
    void initializeComments()
}

function changeSort(value: 0 | 1) {
  if (sort.value === value)
    return
  sort.value = value
  void initializeComments(value)
}

function commentLikeState(comment: MomentCommentItem) {
  return sessions.getLike(sessionLease.value, comment.id) ?? {
    liked: likedIds.has(comment.id),
    count: likeCounts[comment.id] ?? comment.likeCount,
    pending: false,
  }
}

const displayedCommentCount = computed(() => Math.max(0, props.moment.commentCount + postedCount.value - removedCount.value))
const commentCountLabel = computed(() => displayedCommentCount.value > 0 ? ` ${displayedCommentCount.value}` : '')
const threadViews = computed<MomentCommentThreadView[]>(() => comments.value.map((root) => {
  const state = getThreadState(root)
  const replies = flattenMomentCommentReplies(state?.items ?? root.replies)
  const hidden = new Set<string>()
  const nodes = buildMomentCommentThread(root, replies, root.replies).filter((node) => {
    const parent = node.layout.parentId
    if (parent && (collapsedIds.has(parent) || hidden.has(parent))) {
      hidden.add(node.layout.id)
      return false
    }
    return true
  })

  return {
    root,
    revision: threadRevision.value,
    nodes,
    hasMoreReplies: state?.hasMore ?? root.replyCount > replies.length,
    repliesLoading: state?.loading ?? false,
    repliesError: state?.error,
    repliesLoaded: state?.loaded ?? false,
  }
}))

function formatCommentTime(timestamp: number) {
  if (!timestamp)
    return ''
  const date = new Date(timestamp * 1000)
  if (Number.isNaN(date.getTime()))
    return ''
  return new Intl.DateTimeFormat(normalizeIntlLocale(locale.value), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getApiCode(value: unknown): number {
  if (!value || typeof value !== 'object')
    return Number.NaN
  return Number((value as Record<string, unknown>).code)
}

function getApiMessage(value: unknown): string {
  if (!value || typeof value !== 'object')
    return ''
  const message = (value as Record<string, unknown>).message
  return typeof message === 'string' ? message : ''
}

function seedCommentThreads(items: MomentCommentItem[]) {
  items.forEach(seedThread)
}

function seedCommentLikeState(items: MomentCommentItem[], readVersion: number) {
  const ids: string[] = []
  const visit = (comment: MomentCommentItem) => {
    ids.push(comment.id)
    likeCounts[comment.id] = comment.likeCount
    if (comment.isLiked)
      likedIds.add(comment.id)
    else
      likedIds.delete(comment.id)
    comment.replies.forEach(visit)
  }
  items.forEach(visit)
  sessions.reconcileLikeReads(sessionLease.value, ids, readVersion)
}

async function loadComments(reset = false) {
  if (disposed || props.active === false || document.hidden || !commentId.value || !commentType.value || loading.value || loadingMore.value)
    return
  if (!reset && !hasMore.value)
    return

  const generation = reset ? ++requestGeneration : requestGeneration
  const requestIdentity = getCommentIdentity()
  const likeReadVersion = sessions.getLikeReadVersion(sessionLease.value)
  const pageNumber = reset ? 1 : nextPage.value
  const signal = readOwner.signal
  if (reset) {
    hasLoaded = false
    restoredScrollTop = 0
    loading.value = true
    loadError.value = ''
    comments.value = []
    hasMore.value = false
    nextPage.value = 1
    likedIds.clear()
    Object.keys(likeCounts).forEach(key => delete likeCounts[key])
    resetThreads()
  }
  else {
    loadingMore.value = true
    loadError.value = ''
  }

  try {
    const response = await api.moment.getMomentComments({
      oid: commentId.value,
      type: commentType.value,
      pn: pageNumber,
      ps: 8,
      sort: sort.value,
      nohot: 0,
    }, { signal })
    const page = normalizeMomentCommentPage(response, pageNumber, 8)
    if (signal.aborted || generation !== requestGeneration
      || requestIdentity !== getCommentIdentity()) {
      return
    }
    page.items = sessions.pruneComments(sessionLease.value, page.items)
    const mergedItems = reset ? page.items : mergeMomentComments(comments.value, page.items)
    const pageAdvanced = page.nextPage > pageNumber
    comments.value = mergedItems
    hasLoaded = true
    hasMore.value = page.hasMore
    // Hot comments may repeat on ordinary pages. An advancing successful page
    // is not a request failure merely because every row was already displayed.
    const stalled = page.hasMore && !pageAdvanced
    nextPage.value = !stalled && pageAdvanced ? page.nextPage : pageNumber
    if (stalled)
      loadError.value = t('moment_card.comments_load_failed')
    seedCommentLikeState(page.items, likeReadVersion)
    seedCommentThreads(page.items)
  }
  catch (error) {
    if (generation === requestGeneration && requestIdentity === getCommentIdentity())
      loadError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    if (generation === requestGeneration && requestIdentity === getCommentIdentity()) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

async function toggleCommentLike(comment: MomentCommentItem) {
  if (props.active === false || disposed)
    return
  const userId = getUserID()
  if (!userId) {
    toast.error(t('moment_card.comment_login_required'))
    return
  }
  if (disposed || userId !== accountId.value || sessionLease.value?.accountId !== getAccountIdentity())
    return
  const rpid = comment.rpid || comment.id
  const mutationIdentity = getSourceIdentity()
  const previous = commentLikeState(comment)
  const operation = sessions.startLike(sessionLease.value, comment.id, previous.liked, previous.count)
  if (!operation)
    return
  let succeeded = false

  try {
    const response = await api.moment.setMomentCommentLike({
      oid: commentId.value,
      type: commentType.value,
      rpid,
      action: operation.state.liked ? 1 : 0,
      csrf: getCSRF() || '',
    })
    if (getApiCode(response) !== 0)
      throw new Error(getApiMessage(response) || 'Comment like request failed')
    succeeded = true
  }
  catch (error) {
    if (!disposed && mutationIdentity === getSourceIdentity())
      toast.error(error instanceof Error ? error.message : t('moment_card.comment_like_failed'))
  }
  finally {
    sessions.finishLike(operation, succeeded)
  }
}

function getTreeNodeStyle(node: CommentTreeLayoutNode) {
  return {
    '--moment-comment-depth': String(node.depth),
  }
}

function toggleCommentBranch(id: string) {
  if (collapsedIds.has(id))
    collapsedIds.delete(id)
  else
    collapsedIds.add(id)
  emit('interactiveResize')
}

function openReply(comment: MomentCommentItem) {
  if (replyPending.value || !target.value || props.active === false)
    return
  if (!topBarStore.isLogin || !accountId.value || accountId.value !== String(getUserID() ?? '')) {
    toast.error(t('moment_card.forward_account_unavailable'))
    return
  }
  if (replyComposer.value?.focus() === false)
    return
  replyTarget.value = comment
}

function replyPosted(raw: unknown) {
  const reply = normalizeMomentComment(raw)
  if (reply) {
    if (reply.rootRpid && reply.rootRpid !== reply.rpid) {
      const root = comments.value.find(comment => comment.rpid === reply.rootRpid)
      if (root) {
        root.replyCount += 1
        root.replies = mergeMomentComments(root.replies, [reply])
        collapsedIds.delete(root.id)
        seedThread(root)
      }
    }
    else { comments.value = mergeMomentComments([reply], comments.value) }
    saveSession()
  }
  postedCount.value += 1
  emit('posted')
  toast.success(t('moment_card.reply_success'))
}

const COMMENT_ID_PATTERN = /^[1-9]\d*$/
const DELETED_THREAD_CODES = new Set([12022, 12009])
const DELETE_VERIFY_PAGES = 3

function isRootComment(comment: MomentCommentItem) {
  return !comment.rootRpid || comment.rootRpid === comment.rpid
}

function canDeleteComment(comment: MomentCommentItem) {
  return Boolean(confirmService && target.value && props.active !== false && topBarStore.isLogin && accountId.value
    && accountId.value === String(getUserID() ?? '') && comment.author.id === accountId.value && COMMENT_ID_PATTERN.test(comment.rpid))
}

async function verifyCommentDeletion(oid: string, type: number, comment: MomentCommentItem): Promise<'deleted' | 'present' | 'uncertain'> {
  const root = isRootComment(comment) ? comment.rpid : comment.rootRpid
  try {
    for (let pageNumber = 1; pageNumber <= DELETE_VERIFY_PAGES; pageNumber++) {
      const response = await api.moment.getMomentCommentReplies({ oid, type, root, pn: pageNumber, ps: isRootComment(comment) ? 1 : 20 })
      const code = getApiCode(response)
      if (DELETED_THREAD_CODES.has(code))
        return 'deleted'
      if (code !== 0)
        return 'uncertain'
      if (isRootComment(comment))
        return 'present'
      const page = normalizeMomentCommentRepliesPage(response, pageNumber, 20)
      if (page.items.some(item => item.rpid === comment.rpid))
        return 'present'
      if (!page.hasMore || page.nextPage <= pageNumber)
        return 'deleted'
    }
  }
  catch {}
  return 'uncertain'
}

function applyCommentDeletion(comment: MomentCommentItem) {
  const anchor = listRef.value ? captureCommentReadingAnchor(listRef.value, listRef.value, readOwner.signal) : undefined
  const generation = requestGeneration
  const identity = getCommentIdentity()
  if (isRootComment(comment)) {
    comments.value = comments.value.filter(item => item.rpid !== comment.rpid)
  }
  else {
    const root = comments.value.find(item => item.rpid === comment.rootRpid)
    if (root) {
      root.replyCount = Math.max(0, root.replyCount - 1)
      root.replies = sessions.pruneComments(sessionLease.value, root.replies)
      const state = getThreadState(root)
      if (state)
        state.items = sessions.pruneComments(sessionLease.value, state.items)
    }
    comments.value = [...comments.value]
  }
  collapsedIds.delete(comment.id)
  if (replyTarget.value && sessions.isCommentRemoved(sessionLease.value, replyTarget.value))
    replyTarget.value = null
  saveSession()
  void nextTick(() => anchor?.restore(() => generation === requestGeneration && identity === getCommentIdentity()))
}

async function deleteComment(comment: MomentCommentItem) {
  if (disposed || !canDeleteComment(comment))
    return
  const lease = sessionLease.value
  const userId = accountId.value
  const source = getSourceIdentity()
  if (!lease || lease.accountId !== getAccountIdentity() || sessions.isDeletePending(lease, comment.rpid))
    return
  const owner = mutationOwner
  const isCurrent = () => !disposed && !owner.signal.aborted && source === getSourceIdentity() && sessionLease.value === lease
    && String(getUserID() ?? '') === userId && accountId.value === userId
  const confirmed = await confirmService!.confirm(t('moment_card.comment_delete_confirm'), owner.signal)
  const csrf = getCSRF() || ''
  if (!confirmed || !isCurrent() || !csrf)
    return
  const oid = commentId.value
  const type = commentType.value
  const operation = sessions.startDelete(lease, {
    id: comment.id,
    rpid: comment.rpid,
    rootRpid: isRootComment(comment) ? comment.rpid : comment.rootRpid,
    parentRpid: comment.parentRpid,
    removedCount: isRootComment(comment) ? 1 + comment.replyCount : 1,
  })
  if (!operation)
    return
  let outcome: 'deleted' | 'failed' | 'uncertain' = 'failed'
  let message = ''
  try {
    const response = await api.moment.deleteMomentReply({ accountId: userId, csrf, oid, type, rpid: comment.rpid })
    if (getApiCode(response) === 0) {
      outcome = 'deleted'
    }
    else if ((response as { bewlyReplyUncertain?: boolean } | undefined)?.bewlyReplyUncertain) {
      outcome = 'uncertain'
    }
    else {
      message = getApiMessage(response)
    }
  }
  catch {
    outcome = 'uncertain'
  }
  if (outcome === 'uncertain') {
    const verified = await verifyCommentDeletion(oid, type, comment)
    outcome = verified === 'deleted' ? 'deleted' : verified === 'present' ? 'failed' : 'uncertain'
  }
  const applied = sessions.finishDelete(operation, outcome === 'deleted')
  if (!isCurrent())
    return
  if (applied) {
    applyCommentDeletion(comment)
    removedCount.value += operation.state.target.removedCount
    emit('removed', operation.state.target.removedCount)
    toast.success(t('moment_card.comment_delete_success'))
  }
  else if (outcome === 'uncertain') {
    toast.warning(t('moment_card.comment_delete_uncertain'))
  }
  else {
    toast.error(message || t('moment_card.comment_delete_failed'))
  }
}

function openCommentImage(images: string[], index: number, trigger: HTMLElement) {
  emit('openImagePreview', images, index, trigger)
}

async function loadThreadReplies(root: MomentCommentItem) {
  if (disposed || props.active === false || document.hidden)
    return
  const before = getThreadState(root)
  if (before?.loading)
    return
  const previousItems = new Set(before?.items ?? [])
  const likeReadVersion = sessions.getLikeReadVersion(sessionLease.value)
  const generation = requestGeneration
  const identity = getCommentIdentity()
  const anchor = listRef.value ? captureCommentReadingAnchor(listRef.value, listRef.value, readOwner.signal) : undefined
  await loadMoreReplies(root)
  if (generation !== requestGeneration || identity !== getCommentIdentity()) {
    anchor?.cancel()
    return
  }
  const state = getThreadState(root)
  if (state) {
    state.items = sessions.pruneComments(sessionLease.value, state.items)
    seedCommentLikeState(state.items.filter(item => !previousItems.has(item)), likeReadVersion)
  }
  await nextTick()
  void anchor?.restore(() => generation === requestGeneration && identity === getCommentIdentity())
}

function loadMoreIfNearEnd() {
  const list = listRef.value
  if (props.active === false || disposed || document.hidden || loadError.value || !hasMore.value || !list?.clientHeight)
    return
  if (list.scrollHeight - list.scrollTop - list.clientHeight <= list.clientHeight / 4)
    void loadComments(false)
}
watch([loading, loadingMore, listRef, () => props.active], () => {
  void nextTick(loadMoreIfNearEnd)
}, { flush: 'post' })
watch(() => props.active, (active) => {
  if (!active) {
    replyTarget.value = null
    cancelReads()
  }
  else if (!hasLoaded && !resolvingTarget.value && !loading.value) {
    void initializeComments()
  }
})
watch(getSourceIdentity, () => {
  postedCount.value = 0
  removedCount.value = 0
  mutationOwner.abort()
  mutationOwner = new AbortController()
  void initializeComments()
}, { immediate: true, flush: 'sync' })
watch(() => [comments.value, loading.value, loadingMore.value, resolvingTarget.value, loadError.value, threadRevision.value, composerHeight.value], () => emit('interactiveResize'), { flush: 'post' })
function onVisibilityChange() {
  if (document.hidden)
    cancelReads()
  else if (props.active && !hasLoaded)
    void initializeComments()
}
onMounted(() => {
  void restoreScroll()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  mutationOwner.abort()
  saveSession()
  cancelReads()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (sessionLease.value)
    sessions.release(sessionLease.value)
  disposed = true
  requestGeneration += 1
  if (!sharedSessions)
    sessions.clear()
})
</script>

<template>
  <section class="moment-comments" :aria-label="t('moment_card.comments')">
    <header class="moment-comments__header">
      <span class="moment-comments__title">
        {{ t('moment_card.comments') }}{{ commentCountLabel }}
      </span>
      <div class="bew-segment-control bew-segment-control--static moment-comments__sort" :aria-label="t('moment_card.comments_sort')" role="group">
        <button
          v-for="value in ([0, 1] as const)" :key="value" type="button" class="bew-segment-control__item" :data-active="sort === value"
          :aria-pressed="sort === value" @click="changeSort(value)"
        >
          {{ t(value === 0 ? 'moment_card.comments_sort_latest' : 'moment_card.comments_sort_hot') }}
        </button>
      </div>
      <button
        type="button"
        class="moment-comments__refresh"
        :disabled="loading || resolvingTarget"
        @click="refreshComments"
      >
        <LoadingRing :loading="loading">
          <span i-tabler-refresh aria-hidden="true" />
        </LoadingRing>
        {{ t('moment_card.comments_refresh') }}
      </button>
    </header>

    <div class="moment-comments__viewport" :class="{ 'has-composer': target && active }">
      <div v-if="resolvingTarget || (loading && !comments.length)" class="moment-comments__skeleton" :style="composerReserveStyle" role="status" :aria-label="t('moment_card.comments_loading')">
        <MomentCommentSkeleton />
      </div>

      <div v-else-if="loadError && !comments.length" class="moment-comments__state moment-comments__state--error" :style="composerReserveStyle" role="alert">
        <span>{{ loadError }}</span>
        <button type="button" @click="refreshComments">
          {{ t('moment_card.comments_retry') }}
        </button>
      </div>

      <div v-else-if="!comments.length" class="moment-comments__state" :style="composerReserveStyle" role="status">
        <span i-tabler-message-circle aria-hidden="true" />
        <span>{{ t('moment_card.comments_empty') }}</span>
      </div>

      <div
        v-else ref="listRef" class="moment-comments__list" :style="composerReserveStyle" tabindex="0"
        :aria-label="t('moment_card.comments')"
        @scroll.passive="loadMoreIfNearEnd"
      >
        <section
          v-for="thread in threadViews"
          :key="thread.root.id"
          class="moment-comments__thread"
        >
          <MomentCommentTreeGuides :nodes="thread.nodes.map(node => node.layout)" />
          <article
            v-for="node in thread.nodes"
            :key="node.layout.id"
            class="moment-comments__item"
            :data-comment-id="node.layout.id"
            :style="getTreeNodeStyle(node.layout)"
          >
            <IconButton
              v-if="node.layout.hasChildren" class="moment-comments__branch-toggle" shape="circle"
              :label="t(collapsedIds.has(node.layout.id) ? 'moment_card.comments_expand_thread' : 'moment_card.comments_collapse_thread')"
              :aria-expanded="!collapsedIds.has(node.layout.id)" @click="toggleCommentBranch(node.layout.id)"
            >
              <span :class="collapsedIds.has(node.layout.id) ? 'i-tabler-plus' : 'i-tabler-minus'" aria-hidden="true" />
            </IconButton>
            <template v-if="node.missing">
              <span class="moment-comments__avatar moment-comments__missing-avatar" aria-hidden="true">?</span>
              <div class="moment-comments__body moment-comments__missing-parent">
                <span v-if="node.missing.authorName">{{ node.missing.authorName }} · </span>{{ t('moment_card.comments_missing_parent') }}
                <p v-if="node.missing.messageText">
                  {{ node.missing.messageText }}
                </p>
              </div>
            </template>
            <template v-else-if="node.comment">
              <img
                class="moment-comments__avatar"
                :src="getAvatarThumbnailUrl(node.comment.author.avatar)"
                alt=""
                loading="lazy"
              >
              <div class="moment-comments__body">
                <div class="moment-comments__meta">
                  <span class="moment-comments__author">{{ node.comment.author.name }}</span>
                  <span v-if="formatCommentTime(node.comment.createdAt)" class="moment-comments__time">
                    {{ formatCommentTime(node.comment.createdAt) }}
                  </span>
                </div>
                <MomentCommentRichText
                  v-if="node.comment.segments.length"
                  :segments="node.comment.segments"
                />
                <MomentCommentMedia
                  v-if="node.comment.pictures.length"
                  :pictures="node.comment.pictures"
                  @open-image-preview="openCommentImage"
                />
                <p v-if="!node.layout.directParentVisible" class="moment-comments__missing-parent">
                  {{ t('moment_card.comments_missing_parent') }}
                </p>
                <div class="moment-comments__actions">
                  <button
                    type="button"
                    class="moment-comments__action"
                    :class="{ 'is-active': commentLikeState(node.comment).liked }"
                    :aria-label="commentLikeState(node.comment).liked ? t('moment_card.comment_unlike') : t('moment_card.comment_like')"
                    :aria-pressed="commentLikeState(node.comment).liked"
                    :disabled="commentLikeState(node.comment).pending"
                    @click="toggleCommentLike(node.comment)"
                  >
                    <span i-tabler-thumb-up aria-hidden="true" />
                    <span>{{ commentLikeState(node.comment).count }}</span>
                  </button>
                  <button
                    type="button"
                    class="moment-comments__action moment-comments__action--permalink"
                    @click="openReply(node.comment)"
                  >
                    <span i-tabler-message-circle aria-hidden="true" />
                    {{ t('moment_card.reply_action') }}
                  </button>
                  <button
                    v-if="canDeleteComment(node.comment)"
                    type="button"
                    class="moment-comments__action"
                    :disabled="sessions.isDeletePending(sessionLease, node.comment.rpid)"
                    @click="deleteComment(node.comment)"
                  >
                    <span i-tabler-trash aria-hidden="true" />
                    {{ t('moment_card.comment_delete') }}
                  </button>
                </div>
              </div>
            </template>
          </article>

          <div
            v-if="thread.hasMoreReplies || thread.repliesError"
            class="moment-comments__thread-more"
          >
            <span v-if="thread.repliesError" class="moment-comments__thread-error" role="alert">
              {{ t('moment_card.comments_replies_failed') }}
            </span>
            <button
              type="button"
              :disabled="thread.repliesLoading"
              @click="loadThreadReplies(thread.root)"
            >
              <LoadingRing :loading="thread.repliesLoading" />
              {{ thread.repliesLoaded ? t('moment_card.comments_load_more_replies') : t('moment_card.comments_expand_replies') }}
            </button>
          </div>
        </section>
        <div v-if="loadingMore" class="moment-comments__loading-more" role="status" :aria-label="t('moment_card.comments_loading')">
          <MomentCommentSkeleton :count="1" />
        </div>
        <div v-if="loadError && comments.length" class="moment-comments__pagination-error" role="alert">
          <span>{{ loadError }}</span>
          <button type="button" @click="loadComments(false)">
            {{ t('moment_card.comments_retry') }}
          </button>
        </div>
      </div>
      <div v-if="target && active" ref="composerSlot" class="moment-comments__composer">
        <MomentReplyComposer
          :key="`${accountId}:${commentId}:${commentType}`"
          ref="replyComposer"
          :oid="commentId"
          :type="commentType"
          :reply="replyTarget"
          :account-id="accountId"
          :source-url="buildMomentCommentPermalink({ ...moment, commentId, commentType }, replyTarget || { id: '', rpid: '', rootRpid: '' })"
          @close="replyTarget = null"
          @pending="replyPending = $event"
          @interaction="replyInteracting = $event"
          @posted="replyPosted"
        />
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../styles/scrollEdgeFade";

.moment-comments__skeleton {
  display: grid;
}
.moment-comments__missing-avatar {
  display: grid;
  place-items: center;
  background: var(--bew-content-solid);
  color: var(--bew-text-2);
}
.moment-comments {
  padding: 0 var(--bew-space-4) var(--bew-space-4);
  border-top: 1px solid var(--bew-border-color);
  color: var(--bew-text-1);
  background: transparent;
}
.moment-comments__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-3);
  min-height: calc(var(--bew-control-height) + var(--bew-space-2));
}
.moment-comments__sort {
  margin-inline-start: auto;
}
.moment-comments__title {
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}
.moment-comments__refresh,
.moment-comments__thread-more button,
.moment-comments__state button {
  display: inline-flex;
  min-height: var(--bew-control-height-sm);
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  padding: 0 var(--bew-space-2);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-2);
  background: transparent;
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  cursor: pointer;
}
.moment-comments__refresh:hover,
.moment-comments__thread-more button:hover,
.moment-comments__state button:hover {
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
}
.moment-comments__refresh:focus-visible,
.moment-comments__thread-more button:focus-visible,
.moment-comments__state button:focus-visible,
.moment-comments__action:focus-visible {
  outline: var(--bew-focus-ring, 1px solid CanvasText);
  outline-offset: 2px;
}
.moment-comments__refresh:disabled,
.moment-comments__thread-more button:disabled,
.moment-comments__action:disabled {
  cursor: default;
  opacity: 0.55;
}
.moment-comments__state {
  display: flex;
  min-height: var(--bew-comment-state-min-height);
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-align: center;
}
.moment-comments__state--error {
  flex-direction: column;
  color: var(--bew-error-color);
}
.moment-comments__list {
  @include scrollEdgeFade.vertical;
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  max-height: min(60dvh, var(--bew-moment-comments-max-height));
  overflow-y: auto;
  overscroll-behavior: contain;
}
.moment-comments__viewport {
  position: relative;
}
.moment-comments__viewport.has-composer
  > :is(.moment-comments__list, .moment-comments__state, .moment-comments__skeleton) {
  box-sizing: border-box;
  // The reserved editor height is inline (composerReserveStyle).
  // The pinned composer already closes this edge; no bottom fade under it.
  --bew-scroll-edge-bottom-off: 1;
}
.moment-comments__composer {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  z-index: 2;
}
.moment-comments__thread {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
}
.moment-comments__thread + .moment-comments__thread {
  padding-top: var(--bew-space-3);
  border-top: 1px solid var(--bew-border-color);
}
.moment-comments__item {
  position: relative;
  display: grid;
  grid-template-columns: var(--bew-comment-avatar-size) minmax(0, 1fr);
  gap: var(--bew-space-2);
  min-width: 0;
  margin-inline-start: calc(var(--moment-comment-depth) * var(--bew-space-8));
}
.moment-comments__avatar {
  width: var(--bew-comment-avatar-size);
  height: var(--bew-comment-avatar-size);
  border-radius: 50%;
  object-fit: cover;
  corner-shape: var(--bew-corner-shape-round);
}
.moment-comments__branch-toggle {
  position: absolute;
  top: calc(var(--bew-comment-avatar-size) - var(--bew-space-3));
  left: calc((var(--bew-comment-avatar-size) - var(--bew-space-6)) / 2);
  width: var(--bew-space-6);
  height: var(--bew-space-6);
  background: var(--bew-elevated-solid);
  z-index: 1;
}
.moment-comments__body {
  min-width: 0;
}
.moment-comments__meta {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: var(--bew-space-2);
}
.moment-comments__author {
  overflow: hidden;
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.moment-comments__time {
  flex: 0 0 auto;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.moment-comments__missing-parent {
  margin: var(--bew-space-1) 0 0;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.moment-comments__actions {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  margin-top: var(--bew-space-1);
}
.moment-comments__action {
  display: inline-flex;
  min-height: var(--bew-space-6);
  align-items: center;
  gap: var(--bew-space-1);
  padding: 0;
  border: 0;
  color: var(--bew-text-3);
  background: transparent;
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  cursor: pointer;
}
.moment-comments__action:hover,
.moment-comments__action.is-active {
  color: var(--bew-text-1);
}
.moment-comments__action--permalink {
  font-weight: var(--bew-font-weight-regular);
}
.moment-comments__thread-more {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  margin-inline-start: var(--bew-space-10);
}
.moment-comments__pagination-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-3);
  color: var(--bew-error-color);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.moment-comments__pagination-error button {
  min-height: var(--bew-control-height-sm);
  padding: 0 var(--bew-space-2);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  cursor: pointer;
}
.moment-comments__thread-error {
  color: var(--bew-error-color);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
// Appended rows continue the thread separators of the loaded list.
.moment-comments__loading-more {
  flex: none;
  padding-top: var(--bew-space-3);
  border-top: 1px solid var(--bew-border-color);
}
</style>
