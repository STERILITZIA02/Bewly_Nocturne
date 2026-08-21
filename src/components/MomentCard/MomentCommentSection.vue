<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import api from '~/utils/api'
import { normalizeIntlLocale } from '~/utils/locale'

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
const comments = ref<MomentCommentItem[]>([])
const loading = ref(false)
const error = ref('')
const hasMore = ref(true)
const nextPage = ref(1)
const PAGE_SIZE = 8
let requestGeneration = 0

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
  () => void loadComments(true),
  { immediate: true },
)

onBeforeUnmount(() => {
  requestGeneration += 1
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
        <span />
        <div><i /><i /></div>
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
          <footer>
            <span><span i-tabler-thumb-up aria-hidden="true" />{{ formatCount(comment.likeCount) }}</span>
            <span v-if="comment.replyCount">
              <span i-tabler-message-circle aria-hidden="true" />
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
            </article>
          </div>
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

.moment-comments__skeleton-row > span {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.moment-comments__skeleton-row > div {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.moment-comments__skeleton-row i {
  display: block;
  width: 38%;
  height: 10px;
  border-radius: var(--bew-radius-sm);
}

.moment-comments__skeleton-row i:last-child {
  width: 78%;
}

.moment-comments__skeleton-row > span,
.moment-comments__skeleton-row i {
  background: linear-gradient(100deg, var(--bew-fill-1) 25%, var(--bew-fill-2) 38%, var(--bew-fill-1) 63%);
  background-size: 400% 100%;
  animation: moment-comment-shimmer 1.5s ease infinite;
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
  background: var(--bew-fill-1);
}

.moment-comment__avatar img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
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

.moment-comment__content > footer {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  margin-top: var(--bew-space-1);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
}

.moment-comment__content > footer span {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
}

.moment-comment__replies {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-2);
  padding-left: var(--bew-space-3);
  border-left: 2px solid color-mix(in oklab, var(--bew-theme-color), transparent 68%);
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

@media (prefers-reduced-motion: reduce) {
  .moment-comments__skeleton-row > span,
  .moment-comments__skeleton-row i {
    animation: none;
  }
}

@keyframes moment-comment-shimmer {
  to {
    background-position: -400% 0;
  }
}
</style>
