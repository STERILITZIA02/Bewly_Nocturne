<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import SkeletonBlock from '~/components/SkeletonBlock.vue'
import api from '~/utils/api'
import { normalizeIntlLocale } from '~/utils/locale'
import { getCSRF, getUserID } from '~/utils/main'

import type { MomentCommentItem } from './commentUtils'
import { mergeMomentComments, normalizeMomentCommentPage } from './commentUtils'
import MomentCommentRichText from './MomentCommentRichText.vue'
import { formatCount, getAvatarThumbnailUrl } from './utils'

interface Props {
  commentId: string
  commentType: number
  commentCount: number
}

const props = defineProps<Props>()

const { locale, t } = useI18n()
const toast = useToast()
const comments = ref<MomentCommentItem[]>([])
const loading = ref(false)
const error = ref('')
const hasMore = ref(true)
const nextPage = ref(1)
const PAGE_SIZE = 8
const likingCommentIds = reactive(new Set<string>())
const pendingCommentLikeRequests = new Map<string, Promise<void>>()
const replyTarget = ref<MomentCommentItem | null>(null)
const replyComposerRootId = ref('')
const replyDraft = ref('')
const replyInputRef = ref<HTMLTextAreaElement | null>(null)
const replySending = ref(false)
const replyComposerId = useId()
let requestGeneration = 0
let interactionGeneration = 0

function formatCommentTime(timestamp: number) {
  if (!timestamp)
    return ''
  return new Intl.DateTimeFormat(normalizeIntlLocale(locale.value), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000))
}

function getProfileUrl(comment: MomentCommentItem) {
  return comment.author.id
    ? `https://space.bilibili.com/${comment.author.id}`
    : undefined
}

function getAuthorName(comment: MomentCommentItem) {
  return comment.author.name || t('moments.bilibili_user')
}

function isSuccessfulMutation(response: unknown): boolean {
  return Boolean(response && typeof response === 'object' && Number((response as { code?: unknown }).code) === 0)
}

function requireCSRF(): string {
  const csrf = getCSRF()
  if (!csrf)
    toast.error(t('moment_card.comment_login_required'))
  return csrf
}

async function toggleCommentLike(comment: MomentCommentItem) {
  if (!comment.rpid || likingCommentIds.has(comment.rpid))
    return

  const csrf = requireCSRF()
  if (!csrf)
    return

  const rpid = comment.rpid
  const generation = interactionGeneration
  const accountId = getUserID()
  const previousLiked = comment.isLiked
  const previousCount = comment.likeCount
  comment.isLiked = !previousLiked
  comment.likeCount = Math.max(0, previousCount + (comment.isLiked ? 1 : -1))
  likingCommentIds.add(rpid)

  const request = Promise.resolve().then(async () => {
    try {
      const response = await api.moment.setMomentCommentLike({
        oid: props.commentId,
        type: props.commentType,
        rpid,
        action: comment.isLiked ? 1 : 0,
        csrf,
      })
      if (generation !== interactionGeneration || accountId !== getUserID())
        return
      if (!isSuccessfulMutation(response))
        throw new Error('Comment like request failed')
    }
    catch {
      if (generation === interactionGeneration && accountId === getUserID()) {
        comment.isLiked = previousLiked
        comment.likeCount = previousCount
        toast.error(t('moment_card.comment_like_failed'))
      }
    }
    finally {
      if (pendingCommentLikeRequests.get(rpid) === request)
        pendingCommentLikeRequests.delete(rpid)
      if (generation === interactionGeneration)
        likingCommentIds.delete(rpid)
    }
  })

  pendingCommentLikeRequests.set(rpid, request)
  await request
}

function setReplyInputRef(element: Element | ComponentPublicInstance | null) {
  replyInputRef.value = element instanceof HTMLTextAreaElement ? element : null
}

function toggleReplyComposer(target: MomentCommentItem, rootCommentId: string) {
  if (!target.rpid)
    return
  if (replyTarget.value?.id === target.id) {
    closeReplyComposer()
    return
  }
  replyTarget.value = target
  replyComposerRootId.value = rootCommentId
  replyDraft.value = ''
  void nextTick(() => replyInputRef.value?.focus())
}

function closeReplyComposer() {
  if (replySending.value)
    return
  replyTarget.value = null
  replyComposerRootId.value = ''
  replyDraft.value = ''
}

async function submitReply() {
  const target = replyTarget.value
  const message = replyDraft.value.trim()
  if (!target?.rpid || !message || replySending.value)
    return

  const csrf = requireCSRF()
  if (!csrf)
    return

  const generation = interactionGeneration
  const accountId = getUserID()
  const root = target.rootRpid || target.rpid
  replySending.value = true
  try {
    const response = await api.moment.addMomentCommentReply({
      oid: props.commentId,
      type: props.commentType,
      message,
      plat: 1,
      root,
      parent: target.rpid,
      csrf,
    })
    if (generation !== interactionGeneration || accountId !== getUserID())
      return
    if (!isSuccessfulMutation(response))
      throw new Error('Comment reply request failed')

    replyTarget.value = null
    replyComposerRootId.value = ''
    replyDraft.value = ''
    toast.success(t('moment_card.comment_reply_succeeded'))
    await Promise.allSettled(pendingCommentLikeRequests.values())
    if (generation === interactionGeneration && accountId === getUserID())
      await loadComments(true)
  }
  catch {
    if (generation === interactionGeneration && accountId === getUserID())
      toast.error(t('moment_card.comment_reply_failed'))
  }
  finally {
    if (generation === interactionGeneration)
      replySending.value = false
  }
}

async function loadComments(reset = false) {
  if (reset) {
    requestGeneration += 1
    comments.value = []
    nextPage.value = 1
    hasMore.value = true
    loading.value = false
  }
  else if (loading.value || !hasMore.value) {
    return
  }

  const page = nextPage.value
  const generation = ++requestGeneration
  loading.value = true
  error.value = ''

  try {
    const response = await api.moment.getMomentComments({
      oid: props.commentId,
      type: props.commentType,
      pn: page,
      ps: PAGE_SIZE,
    })
    if (generation !== requestGeneration)
      return

    const result = normalizeMomentCommentPage(response, page, PAGE_SIZE)
    comments.value = reset
      ? result.items
      : mergeMomentComments(comments.value, result.items)
    hasMore.value = result.hasMore
    nextPage.value = result.nextPage
  }
  catch (reason) {
    if (generation !== requestGeneration)
      return
    error.value = reason instanceof Error && reason.message
      ? reason.message
      : t('moment_card.comments_load_failed')
  }
  finally {
    if (generation === requestGeneration) {
      loading.value = false
    }
  }
}

function retryComments() {
  void loadComments(comments.value.length === 0)
}

watch(
  () => [props.commentId, props.commentType] as const,
  () => {
    interactionGeneration += 1
    likingCommentIds.clear()
    pendingCommentLikeRequests.clear()
    replyTarget.value = null
    replyComposerRootId.value = ''
    replyDraft.value = ''
    replySending.value = false
    void loadComments(true)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  requestGeneration += 1
  interactionGeneration += 1
  likingCommentIds.clear()
  pendingCommentLikeRequests.clear()
})
</script>

<template>
  <section class="moment-comments" :aria-label="t('moment_card.comments')">
    <header class="moment-comments__header">
      <strong>{{ t('moment_card.comments') }}</strong>
      <span>{{ formatCount(commentCount) }}</span>
    </header>

    <div v-if="loading && !comments.length" class="moment-comments__skeleton" aria-hidden="true">
      <div v-for="index in 3" :key="index" class="moment-comments__skeleton-row">
        <SkeletonBlock width="28px" height="28px" radius="circle" />
        <div>
          <SkeletonBlock width="38%" height="10px" />
          <SkeletonBlock width="78%" height="10px" />
        </div>
      </div>
    </div>

    <div v-else-if="error && !comments.length" class="moment-comments__state" role="status">
      <span i-tabler-alert-circle aria-hidden="true" />
      <span>{{ t('moment_card.comments_load_failed') }}</span>
      <button type="button" @click="retryComments">
        {{ t('moment_card.comments_retry') }}
      </button>
    </div>

    <div v-else-if="!comments.length" class="moment-comments__state" role="status">
      <span i-tabler-message-circle aria-hidden="true" />
      <span>{{ t('moment_card.comments_empty') }}</span>
    </div>

    <div v-else class="moment-comments__list">
      <article v-for="comment in comments" :key="comment.id" class="moment-comment">
        <a
          v-if="getProfileUrl(comment)"
          :href="getProfileUrl(comment)"
          target="_blank"
          rel="noopener noreferrer"
          class="moment-comment__avatar"
          tabindex="-1"
          aria-hidden="true"
        >
          <img :src="getAvatarThumbnailUrl(comment.author.avatar)" alt="" loading="lazy" decoding="async">
        </a>
        <span v-else class="moment-comment__avatar" aria-hidden="true">
          <img :src="getAvatarThumbnailUrl(comment.author.avatar)" alt="" loading="lazy" decoding="async">
        </span>

        <div class="moment-comment__content">
          <header>
            <a
              v-if="getProfileUrl(comment)"
              :href="getProfileUrl(comment)"
              target="_blank"
              rel="noopener noreferrer"
              :style="{ color: comment.author.nameColor || undefined }"
            >
              {{ getAuthorName(comment) }}
            </a>
            <strong v-else :style="{ color: comment.author.nameColor || undefined }">{{ getAuthorName(comment) }}</strong>
            <time>{{ formatCommentTime(comment.createdAt) }}</time>
          </header>
          <p><MomentCommentRichText :segments="comment.segments" /></p>
          <footer class="moment-comment__actions">
            <button
              v-if="comment.rpid"
              type="button"
              class="moment-comment__action"
              :class="{ 'moment-comment__action--active': comment.isLiked }"
              :aria-label="t(comment.isLiked ? 'moment_card.comment_unlike' : 'moment_card.comment_like')"
              :aria-pressed="comment.isLiked"
              :disabled="likingCommentIds.has(comment.rpid)"
              @click.stop="toggleCommentLike(comment)"
            >
              <span :class="comment.isLiked ? 'i-tabler-thumb-up-filled' : 'i-tabler-thumb-up'" aria-hidden="true" />
              {{ formatCount(comment.likeCount) }}
            </button>
            <button
              v-if="comment.rpid"
              type="button"
              class="moment-comment__action"
              :aria-expanded="replyTarget?.id === comment.id"
              :aria-controls="replyTarget?.id === comment.id ? replyComposerId : undefined"
              @click.stop="toggleReplyComposer(comment, comment.id)"
            >
              <span i-tabler-message-circle aria-hidden="true" />
              {{ t('moment_card.comment_reply') }}
            </button>
            <span v-if="comment.replyCount">
              {{ t('moment_card.comments_reply_count', { count: comment.replyCount }) }}
            </span>
          </footer>

          <div v-if="comment.replies.length" class="moment-comment__replies">
            <article v-for="reply in comment.replies.slice(0, 2)" :key="reply.id">
              <header>
                <strong :style="{ color: reply.author.nameColor || undefined }">{{ getAuthorName(reply) }}</strong>
                <time>{{ formatCommentTime(reply.createdAt) }}</time>
              </header>
              <p><MomentCommentRichText :segments="reply.segments" /></p>
              <footer class="moment-comment__actions moment-comment__actions--nested">
                <button
                  v-if="reply.rpid"
                  type="button"
                  class="moment-comment__action"
                  :class="{ 'moment-comment__action--active': reply.isLiked }"
                  :aria-label="t(reply.isLiked ? 'moment_card.comment_unlike' : 'moment_card.comment_like')"
                  :aria-pressed="reply.isLiked"
                  :disabled="likingCommentIds.has(reply.rpid)"
                  @click.stop="toggleCommentLike(reply)"
                >
                  <span :class="reply.isLiked ? 'i-tabler-thumb-up-filled' : 'i-tabler-thumb-up'" aria-hidden="true" />
                  {{ formatCount(reply.likeCount) }}
                </button>
                <button
                  v-if="reply.rpid"
                  type="button"
                  class="moment-comment__action"
                  :aria-expanded="replyTarget?.id === reply.id"
                  :aria-controls="replyTarget?.id === reply.id ? replyComposerId : undefined"
                  @click.stop="toggleReplyComposer(reply, comment.id)"
                >
                  <span i-tabler-message-circle aria-hidden="true" />
                  {{ t('moment_card.comment_reply') }}
                </button>
              </footer>
            </article>
          </div>

          <form
            v-if="replyTarget && replyComposerRootId === comment.id"
            :id="replyComposerId"
            class="moment-comment__reply-composer"
            @click.stop
            @submit.prevent="submitReply"
          >
            <label :for="`${replyComposerId}-input`">
              {{ t('moment_card.comment_reply_to', { name: getAuthorName(replyTarget) }) }}
            </label>
            <textarea
              :id="`${replyComposerId}-input`"
              :ref="setReplyInputRef"
              v-model="replyDraft"
              :placeholder="t('moment_card.comment_reply_placeholder')"
              :disabled="replySending"
              rows="3"
              @keydown.ctrl.enter.prevent="submitReply"
              @keydown.meta.enter.prevent="submitReply"
            />
            <div class="moment-comment__reply-actions">
              <button type="button" :disabled="replySending" @click="closeReplyComposer">
                {{ t('common.operation.cancel') }}
              </button>
              <button type="submit" class="moment-comment__reply-submit" :disabled="replySending || !replyDraft.trim()">
                <span v-if="replySending" i-svg-spinners:ring-resize aria-hidden="true" />
                {{ t(replySending ? 'moment_card.comment_sending' : 'moment_card.comment_send') }}
              </button>
            </div>
          </form>
        </div>
      </article>
    </div>

    <footer v-if="comments.length && (hasMore || error || loading)" class="moment-comments__footer">
      <button v-if="error" type="button" @click="retryComments">
        <span i-tabler-refresh aria-hidden="true" />
        {{ t('moment_card.comments_retry') }}
      </button>
      <button v-else-if="hasMore" type="button" :disabled="loading" @click="loadComments()">
        <span v-if="loading" i-svg-spinners:ring-resize aria-hidden="true" />
        <span v-else i-tabler-chevron-down aria-hidden="true" />
        {{ loading ? t('moment_card.comments_loading') : t('moment_card.comments_load_more') }}
      </button>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.moment-comments {
  color: var(--bew-text-2);
  background: transparent;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.moment-comments__header {
  display: flex;
  align-items: baseline;
  gap: var(--bew-space-2);
  padding: var(--bew-space-3) var(--bew-space-4) var(--bew-space-2);
}

.moment-comments__header strong {
  color: var(--bew-text-1);
  font-weight: var(--bew-font-weight-semibold);
}

.moment-comments__header span {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
}

.moment-comments__skeleton {
  padding-bottom: var(--bew-space-2);
}

.moment-comments__skeleton-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: var(--bew-space-2);
  padding: var(--bew-space-2) var(--bew-space-4);
}

.moment-comments__skeleton-row > div {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.moment-comments__state {
  display: flex;
  min-height: 88px;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-3) var(--bew-space-4);
  color: var(--bew-text-3);
  box-sizing: border-box;
  text-align: center;
}

.moment-comments__state button,
.moment-comments__footer button {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  padding: 0 var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-theme-foreground);
  background: transparent;
  font: inherit;
  font-weight: var(--bew-font-weight-semibold);
  cursor: pointer;
}

.moment-comments__state button:hover,
.moment-comments__footer button:hover {
  background: var(--bew-theme-color-10);
}

.moment-comments__list {
  display: flex;
  flex-direction: column;
}

.moment-comment {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: var(--bew-space-2);
  padding: var(--bew-space-2) var(--bew-space-4) var(--bew-space-3);
}

.moment-comment + .moment-comment {
  border-top: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 78%);
}

.moment-comment__avatar {
  display: block;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
  background: var(--bew-fill-1);
}

.moment-comment__avatar img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  corner-shape: inherit;
  object-fit: cover;
}

.moment-comment__content {
  min-width: 0;
}

.moment-comment__content > header,
.moment-comment__replies header {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: var(--bew-space-2);
}

.moment-comment__content > header a,
.moment-comment__content > header strong,
.moment-comment__replies strong {
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moment-comment__content time,
.moment-comment__replies time {
  flex: 0 0 auto;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
}

.moment-comment__content > p,
.moment-comment__replies p {
  margin: var(--bew-space-1) 0 0;
  color: var(--bew-text-2);
  line-height: 20px;
  white-space: pre-wrap;
  word-break: break-word;
}

.moment-comment__actions {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  margin-top: var(--bew-space-1);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
}

.moment-comment__actions--nested {
  margin-top: var(--bew-space-1);
}

.moment-comment__action {
  display: inline-flex;
  min-width: 24px;
  min-height: 24px;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  padding: 0 var(--bew-space-2);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  color: inherit;
  background: transparent;
  font: inherit;
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-emphasized);
}

.moment-comment__action:hover:not(:disabled),
.moment-comment__action--active {
  color: var(--bew-theme-foreground);
  background: var(--bew-theme-color-10);
}

.moment-comment__action:active:not(:disabled) {
  transform: scale(0.96);
}

.moment-comment__action:disabled {
  opacity: 0.55;
  cursor: wait;
}

.moment-comment__replies {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-2);
  padding-left: var(--bew-space-3);
  border-left: 2px solid color-mix(in oklab, var(--bew-theme-color), transparent 68%);
}

.moment-comment__reply-composer {
  display: grid;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-3);
  padding: var(--bew-space-3);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-fill-1);
}

.moment-comment__reply-composer label {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
}

.moment-comment__reply-composer textarea {
  width: 100%;
  min-height: 72px;
  box-sizing: border-box;
  resize: vertical;
  padding: var(--bew-space-2) var(--bew-space-3);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-text-1);
  background: var(--bew-content-solid);
  font: inherit;
  line-height: var(--bew-line-height-body);
}

.moment-comment__reply-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--bew-space-2);
}

.moment-comment__reply-actions button {
  display: inline-flex;
  min-height: var(--bew-control-item-height);
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  padding: 0 var(--bew-space-3);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-text-2);
  background: var(--bew-elevated-solid);
  font: inherit;
  font-weight: var(--bew-font-weight-medium);
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-emphasized);
}

.moment-comment__reply-actions button:hover:not(:disabled) {
  color: var(--bew-text-1);
  background: var(--bew-elevated-solid-hover);
}

.moment-comment__reply-actions .moment-comment__reply-submit {
  border-color: transparent;
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
}

.moment-comment__reply-actions .moment-comment__reply-submit:hover:not(:disabled) {
  color: var(--bew-on-theme-color);
  filter: brightness(1.06);
}

.moment-comment__reply-actions button:active:not(:disabled) {
  transform: scale(0.97);
}

.moment-comment__reply-actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.moment-comments__footer {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  border-top: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 78%);
}

.moment-comments__footer button {
  width: 100%;
  min-height: 40px;
  border-radius: 0;
}

.moment-comments__footer button:disabled {
  cursor: wait;
  opacity: 0.65;
}
</style>
