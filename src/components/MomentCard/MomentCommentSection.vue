<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { buildMomentCommentPermalink } from '~/utils/commentPermalink'
import type { CommentTreeLayoutNode } from '~/utils/commentTree'
import { buildCommentTree } from '~/utils/commentTree'
import { normalizeIntlLocale } from '~/utils/locale'
import { getCSRF, getUserID, openLinkToNewTab } from '~/utils/main'
import { MOMENT_COMMENT_SESSIONS } from '~/utils/momentCommentSession'
import type { MomentCommentTarget } from '~/utils/momentCommentTarget'
import { readMomentCommentTarget, resolveMomentCommentTarget } from '~/utils/momentCommentTarget'

import type { MomentCommentItem } from './commentUtils'
import { flattenMomentCommentReplies, mergeMomentComments, normalizeMomentCommentPage } from './commentUtils'
import MomentCommentMedia from './MomentCommentMedia.vue'
import MomentCommentRichText from './MomentCommentRichText.vue'
import MomentCommentTreeGuides from './MomentCommentTreeGuides.vue'
import type { DisplayMoment } from './types'
import { useMomentCommentThread } from './useMomentCommentThread'
import { getAvatarThumbnailUrl } from './utils'

const props = defineProps<{
  moment: DisplayMoment
}>()

const emit = defineEmits<{
  openImagePreview: [images: string[], index: number, trigger: HTMLElement]
  interactiveResize: []
}>()

interface MomentCommentTreeViewNode {
  comment: MomentCommentItem
  layout: CommentTreeLayoutNode
}

interface MomentCommentThreadView {
  root: MomentCommentItem
  revision: number
  nodes: MomentCommentTreeViewNode[]
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
const getCommentIdentity = () => `${getSourceIdentity()}:${commentType.value}:${commentId.value}`
const sessions = inject(MOMENT_COMMENT_SESSIONS, null)
let sessionLease: ReturnType<NonNullable<typeof sessions>['open']> = null
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
const pendingLikeIds = reactive(new Set<string>())
const likeRequestTokens = new Map<string, symbol>()
const pendingLikeSnapshots = new Map<string, { liked: boolean, count: number }>()
let requestGeneration = 0

const {
  getThreadState,
  loadMoreReplies,
  resetThreads,
  revision: threadRevision,
  seedThread,
  snapshotThreads,
  restoreThreads,
} = useMomentCommentThread(toRef(() => commentId.value), toRef(() => commentType.value))

function saveSession() {
  if (!sessions || !sessionLease || !hasLoaded || sessionSource !== getSourceIdentity())
    return
  const savedLikedIds = new Set(likedIds)
  const savedLikeCounts = { ...likeCounts }
  for (const [id, previous] of pendingLikeSnapshots) {
    if (previous.liked)
      savedLikedIds.add(id)
    else
      savedLikedIds.delete(id)
    savedLikeCounts[id] = previous.count
  }
  sessions.save(sessionLease, {
    comments: comments.value,
    nextPage: nextPage.value,
    hasMore: hasMore.value,
    threads: snapshotThreads(),
    likedIds: [...savedLikedIds],
    likeCounts: savedLikeCounts,
    scrollTop: listRef.value?.scrollTop ?? restoredScrollTop,
  })
}

async function restoreScroll() {
  const identity = getCommentIdentity()
  await nextTick()
  if (identity === getCommentIdentity() && listRef.value)
    listRef.value.scrollTop = restoredScrollTop
}

async function initializeComments() {
  const generation = ++requestGeneration
  sessionSource = getSourceIdentity()
  const source = sessionSource
  const isCurrent = () => generation === requestGeneration && source === getSourceIdentity()
  sessionLease = null
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
  Object.keys(likeCounts).forEach(key => delete likeCounts[key])
  pendingLikeIds.clear()
  pendingLikeSnapshots.clear()
  likeRequestTokens.clear()
  resetThreads()
  resolvingTarget.value = true
  try {
    const resolved = readMomentCommentTarget(props.moment.commentId, props.moment.commentType)
      || sessions?.getTarget(getAccountIdentity(), props.moment.id)
      || await resolveMomentCommentTarget(props.moment, id => api.moment.getMomentDetail({ id }), isCurrent)
    if (!isCurrent())
      return
    if (!resolved)
      throw new Error('Comment target unavailable')
    target.value = resolved
    sessionLease = sessions?.open(getAccountIdentity(), props.moment.id, resolved) ?? null
    const snapshot = sessionLease && sessions?.restore(sessionLease)
    resolvingTarget.value = false
    if (snapshot) {
      comments.value = snapshot.comments
      nextPage.value = snapshot.nextPage
      hasMore.value = snapshot.hasMore
      snapshot.likedIds.forEach(id => likedIds.add(id))
      Object.assign(likeCounts, snapshot.likeCounts)
      restoreThreads(snapshot.threads)
      restoredScrollTop = snapshot.scrollTop
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

const commentCountLabel = computed(() => props.moment.commentCount > 0 ? ` ${props.moment.commentCount}` : '')
const threadViews = computed<MomentCommentThreadView[]>(() => comments.value.map((root) => {
  const state = getThreadState(root)
  const replies = flattenMomentCommentReplies(state?.items ?? root.replies)
  const allItems = mergeMomentComments([], [root, ...replies])
  const itemById = new Map(allItems.map(item => [item.id, item]))
  const rootId = root.rpid || root.id
  const layout = buildCommentTree(allItems.map((comment, originalOrder) => ({
    id: comment.id,
    rootId,
    parentId: comment.id === root.id
      ? ''
      : comment.parentRpid && comment.parentRpid !== comment.id
        ? comment.parentRpid
        : rootId,
    createdAt: comment.createdAt,
    originalOrder,
  })), 6)

  return {
    root,
    revision: threadRevision.value,
    nodes: layout.flatMap((node) => {
      const comment = itemById.get(node.id)
      return comment ? [{ comment, layout: node }] : []
    }),
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

function seedCommentLikeState(items: MomentCommentItem[]) {
  const visit = (comment: MomentCommentItem) => {
    if (!(comment.id in likeCounts))
      likeCounts[comment.id] = comment.likeCount
    if (comment.isLiked)
      likedIds.add(comment.id)
    comment.replies.forEach(visit)
  }
  items.forEach(visit)
}

async function loadComments(reset = false) {
  if (!commentId.value || !commentType.value || loading.value || loadingMore.value)
    return

  const generation = reset ? ++requestGeneration : requestGeneration
  const requestIdentity = getCommentIdentity()
  const pageNumber = reset ? 1 : nextPage.value
  if (reset) {
    hasLoaded = false
    restoredScrollTop = 0
    loading.value = true
    loadError.value = ''
    comments.value = []
    hasMore.value = false
    nextPage.value = 1
    likedIds.clear()
    pendingLikeIds.clear()
    likeRequestTokens.clear()
    pendingLikeSnapshots.clear()
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
      sort: 0,
      nohot: 0,
    })
    const page = normalizeMomentCommentPage(response, pageNumber, 8)
    if (generation !== requestGeneration
      || requestIdentity !== getCommentIdentity()) {
      return
    }
    const previousItemCount = comments.value.length
    const mergedItems = reset ? page.items : mergeMomentComments(comments.value, page.items)
    const madeProgress = reset || mergedItems.length > previousItemCount
    const pageAdvanced = page.nextPage > pageNumber
    comments.value = mergedItems
    hasLoaded = true
    hasMore.value = page.hasMore && madeProgress && pageAdvanced
    nextPage.value = pageAdvanced ? page.nextPage : pageNumber
    seedCommentLikeState(page.items)
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
  const userId = getUserID()
  if (!userId) {
    toast.error(t('moment_card.comment_login_required'))
    return
  }
  if (pendingLikeIds.has(comment.id))
    return

  const rpid = comment.rpid || comment.id
  const mutationGeneration = requestGeneration
  const mutationIdentity = getCommentIdentity()
  const requestToken = Symbol(comment.id)
  const previousLiked = likedIds.has(comment.id)
  const previousCount = likeCounts[comment.id] ?? comment.likeCount
  const nextLiked = !previousLiked
  pendingLikeIds.add(comment.id)
  likeRequestTokens.set(comment.id, requestToken)
  pendingLikeSnapshots.set(comment.id, { liked: previousLiked, count: previousCount })
  if (nextLiked)
    likedIds.add(comment.id)
  else
    likedIds.delete(comment.id)
  likeCounts[comment.id] = Math.max(0, previousCount + (nextLiked ? 1 : -1))

  try {
    const response = await api.moment.setMomentCommentLike({
      oid: commentId.value,
      type: commentType.value,
      rpid,
      action: nextLiked ? 1 : 0,
      csrf: getCSRF() || '',
    })
    if (getApiCode(response) !== 0)
      throw new Error(getApiMessage(response) || 'Comment like request failed')
  }
  catch (error) {
    const requestIsCurrent = likeRequestTokens.get(comment.id) === requestToken
      && mutationGeneration === requestGeneration
      && mutationIdentity === getCommentIdentity()
    if (requestIsCurrent) {
      if (previousLiked)
        likedIds.add(comment.id)
      else
        likedIds.delete(comment.id)
      likeCounts[comment.id] = previousCount
      toast.error(error instanceof Error ? error.message : t('moment_card.comment_like_failed'))
    }
  }
  finally {
    if (likeRequestTokens.get(comment.id) === requestToken) {
      likeRequestTokens.delete(comment.id)
      pendingLikeIds.delete(comment.id)
      pendingLikeSnapshots.delete(comment.id)
    }
  }
}

function getTreeNodeStyle(node: CommentTreeLayoutNode) {
  return {
    '--moment-comment-depth': String(node.depth),
  }
}

function openCommentInNewTab(comment: MomentCommentItem) {
  openLinkToNewTab(buildMomentCommentPermalink({
    ...props.moment,
    commentId: commentId.value,
    commentType: commentType.value,
  }, comment))
}

function openCommentImage(images: string[], index: number, trigger: HTMLElement) {
  emit('openImagePreview', images, index, trigger)
}

async function loadThreadReplies(root: MomentCommentItem) {
  const generation = requestGeneration
  const identity = getCommentIdentity()
  await loadMoreReplies(root)
  if (generation !== requestGeneration || identity !== getCommentIdentity())
    return
  const state = getThreadState(root)
  if (state)
    seedCommentLikeState(state.items)
}

watch(getSourceIdentity, () => void initializeComments(), { immediate: true, flush: 'sync' })
watch(() => [comments.value, loading.value, loadingMore.value, resolvingTarget.value, loadError.value, threadRevision.value], () => emit('interactiveResize'), { flush: 'sync' })
onMounted(() => void restoreScroll())

onBeforeUnmount(() => {
  saveSession()
  requestGeneration += 1
  pendingLikeIds.clear()
  likeRequestTokens.clear()
  pendingLikeSnapshots.clear()
})
</script>

<template>
  <section class="moment-comments" :aria-label="t('moment_card.comments')">
    <header class="moment-comments__header">
      <span class="moment-comments__title">
        {{ t('moment_card.comments') }}{{ commentCountLabel }}
      </span>
      <button
        type="button"
        class="moment-comments__refresh"
        :disabled="loading || resolvingTarget"
        @click="refreshComments"
      >
        <span i-tabler-refresh :class="{ 'bew-spinner': loading }" aria-hidden="true" />
        {{ t('moment_card.comments_refresh') }}
      </button>
    </header>

    <div v-if="resolvingTarget || (loading && !comments.length)" class="moment-comments__state" role="status">
      <span i-tabler-loader-2 class="bew-spinner" aria-hidden="true" />
      <span>{{ t('moment_card.comments_loading') }}</span>
    </div>

    <div v-else-if="loadError && !comments.length" class="moment-comments__state moment-comments__state--error" role="alert">
      <span>{{ loadError }}</span>
      <button type="button" @click="refreshComments">
        {{ t('moment_card.comments_retry') }}
      </button>
    </div>

    <div v-else-if="!comments.length" class="moment-comments__state" role="status">
      <span i-tabler-message-circle aria-hidden="true" />
      <span>{{ t('moment_card.comments_empty') }}</span>
    </div>

    <div v-else ref="listRef" class="moment-comments__list" tabindex="0" :aria-label="t('moment_card.comments')">
      <section
        v-for="thread in threadViews"
        :key="thread.root.id"
        class="moment-comments__thread"
      >
        <MomentCommentTreeGuides :nodes="thread.nodes.map(node => node.layout)" />
        <article
          v-for="node in thread.nodes"
          :key="node.comment.id"
          class="moment-comments__item"
          :data-comment-id="node.comment.id"
          :style="getTreeNodeStyle(node.layout)"
        >
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
                :class="{ 'is-active': likedIds.has(node.comment.id) }"
                :aria-label="likedIds.has(node.comment.id) ? t('moment_card.comment_unlike') : t('moment_card.comment_like')"
                :aria-pressed="likedIds.has(node.comment.id)"
                :disabled="pendingLikeIds.has(node.comment.id)"
                @click="toggleCommentLike(node.comment)"
              >
                <span i-tabler-thumb-up aria-hidden="true" />
                <span>{{ likeCounts[node.comment.id] ?? node.comment.likeCount }}</span>
              </button>
              <button
                type="button"
                class="moment-comments__action moment-comments__action--permalink"
                @click="openCommentInNewTab(node.comment)"
              >
                <span i-tabler-external-link aria-hidden="true" />
                {{ t('moment_card.comments_reply_new_tab') }}
              </button>
            </div>
          </div>
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
            <span v-if="thread.repliesLoading" i-tabler-loader-2 class="bew-spinner" aria-hidden="true" />
            {{ thread.repliesLoaded ? t('moment_card.comments_load_more_replies') : t('moment_card.comments_expand_replies') }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="loadError && comments.length" class="moment-comments__pagination-error" role="alert">
      <span>{{ loadError }}</span>
      <button type="button" @click="loadComments(false)">
        {{ t('moment_card.comments_retry') }}
      </button>
    </div>

    <button
      v-if="hasMore"
      type="button"
      class="moment-comments__load-more"
      :disabled="loadingMore"
      @click="loadComments(false)"
    >
      <span v-if="loadingMore" i-tabler-loader-2 class="bew-spinner" aria-hidden="true" />
      {{ t('moment_card.comments_load_more') }}
    </button>
  </section>
</template>

<style scoped lang="scss">
.moment-comments {
  padding: 0 var(--bew-space-4) var(--bew-space-4);
  border-top: 1px solid var(--bew-border-color);
  color: var(--bew-text-1);
  background: transparent;
}
.moment-comments__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-3);
  min-height: calc(var(--bew-control-height) + var(--bew-space-2));
}
.moment-comments__title {
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}
.moment-comments__refresh,
.moment-comments__load-more,
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
.moment-comments__load-more:hover,
.moment-comments__thread-more button:hover,
.moment-comments__state button:hover {
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
}
.moment-comments__refresh:focus-visible,
.moment-comments__load-more:focus-visible,
.moment-comments__thread-more button:focus-visible,
.moment-comments__state button:focus-visible,
.moment-comments__action:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: 2px;
}
.moment-comments__refresh:disabled,
.moment-comments__load-more:disabled,
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
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  max-height: min(60dvh, var(--bew-moment-comments-max-height));
  overflow-y: auto;
  overscroll-behavior: contain;
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
  font-weight: var(--bew-font-weight-semibold);
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
  color: var(--bew-theme-color);
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
.moment-comments__load-more {
  width: 100%;
  margin-top: var(--bew-space-3);
}
</style>
