<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import ALink from '~/components/ALink.vue'
import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import PrivateMessageMediaCover from './PrivateMessageMediaCover.vue'
import type { ParsedPrivateMessageContent } from './privateMessageRenderers'

const props = defineProps<{
  autoLoadImages: boolean
  content: ParsedPrivateMessageContent
  isSelf: boolean
}>()

const emit = defineEmits<{
  (event: 'preview', src: string): void
}>()

const { t } = useI18n()
const originalUrl = buildOriginalNotificationUrl('whisper')
const mediaRequested = ref(false)
const mediaFailed = ref(false)
const failedInlineEmotes = ref<Set<number>>(new Set())
const mediaSource = computed(() => (
  props.content.type === 'image' || props.content.type === 'emoticon'
    ? props.content.src
    : ''
))
const shouldLoadMedia = computed(() => (
  props.content.type !== 'image'
  || props.autoLoadImages
  || mediaRequested.value
))

function requestMedia() {
  mediaFailed.value = false
  mediaRequested.value = true
}

function markInlineEmoteFailed(index: number) {
  failedInlineEmotes.value = new Set([...failedInlineEmotes.value, index])
}

watch(mediaSource, () => {
  mediaRequested.value = false
  mediaFailed.value = false
})
watch(() => props.content, () => {
  failedInlineEmotes.value = new Set()
})
</script>

<template>
  <div
    v-if="content.type === 'text'"
    class="private-message-content__bubble"
    :class="{ 'private-message-content__bubble--self': isSelf }"
  >
    <template v-for="(segment, index) in content.segments" :key="index">
      <span v-if="segment.type === 'text'">{{ segment.text }}</span>
      <ALink
        v-else-if="segment.type === 'link'"
        :href="segment.href"
        type="content"
        class="private-message-content__inline-link"
      >
        {{ segment.text }}
      </ALink>
      <span v-else-if="failedInlineEmotes.has(index)">{{ segment.text }}</span>
      <img
        v-else
        class="private-message-content__inline-emote"
        :class="{ 'private-message-content__inline-emote--large': segment.size > 1 }"
        :src="segment.url"
        :alt="segment.text"
        loading="lazy"
        decoding="async"
        @error="markInlineEmoteFailed(index)"
      >
    </template>
  </div>

  <template v-else-if="content.type === 'image' || content.type === 'emoticon'">
    <button
      v-if="shouldLoadMedia && !mediaFailed"
      type="button"
      class="private-message-content__media-button"
      :aria-label="t('notifications.whisper.messages.preview_image')"
      @click="emit('preview', content.src)"
    >
      <img
        class="private-message-content__media"
        :class="{ 'private-message-content__media--emoticon': content.type === 'emoticon' }"
        :src="content.src"
        :style="content.width > 0 && content.height > 0
          ? { aspectRatio: `${content.width} / ${content.height}` }
          : undefined"
        :alt="content.type === 'emoticon'
          ? t('notifications.whisper.messages.emoticon_alt')
          : t('notifications.whisper.messages.image_alt')"
        loading="lazy"
        decoding="async"
        @error="mediaFailed = true"
      >
    </button>
    <button
      v-else
      type="button"
      class="private-message-content__media-placeholder"
      @click="requestMedia"
    >
      <i i-tabler:photo aria-hidden="true" />
      <span>
        {{ t(mediaFailed
          ? 'notifications.whisper.messages.image_load_failed'
          : 'notifications.whisper.messages.click_load_image') }}
      </span>
    </button>
  </template>

  <div v-else-if="content.type === 'recalled'" class="private-message-content__notice">
    {{ t('notifications.whisper.messages.recalled') }}
  </div>

  <div v-else-if="content.type === 'expired'" class="private-message-content__expired">
    <i i-tabler:link-off aria-hidden="true" />
    {{ t('notifications.whisper.messages.expired') }}
  </div>

  <div v-else-if="content.type === 'tip'" class="private-message-content__notice">
    <span v-for="(line, index) in content.lines" :key="index">{{ line }}</span>
  </div>

  <div
    v-else-if="content.type === 'share-v2'"
    class="private-message-content__card"
  >
    <PrivateMessageMediaCover
      v-if="content.cover"
      class="private-message-content__cover"
      :src="content.cover"
      :href="content.href"
      :video="content.source === 'video'"
    />
    <ALink :href="content.href" type="content" class="private-message-content__card-copy">
      <strong>{{ content.title }}</strong>
      <span v-if="content.headline">{{ content.headline }}</span>
      <small v-if="content.author">{{ content.author }}</small>
    </ALink>
  </div>

  <div v-else-if="content.type === 'notification'" class="private-message-content__card">
    <div class="private-message-content__card-copy">
      <strong v-if="content.title">{{ content.title }}</strong>
      <span v-if="content.text">{{ content.text }}</span>
    </div>
    <dl v-if="content.modules.length" class="private-message-content__fields">
      <div v-for="(module, index) in content.modules" :key="index">
        <dt>{{ module.title }}</dt>
        <dd>{{ module.detail }}</dd>
      </div>
    </dl>
    <div v-if="content.links.length" class="private-message-content__actions">
      <ALink v-for="link in content.links" :key="link.href" :href="link.href" type="content">
        {{ link.text }}
      </ALink>
    </div>
  </div>

  <div
    v-else-if="content.type === 'video-card'"
    class="private-message-content__card"
  >
    <PrivateMessageMediaCover
      v-if="content.cover"
      class="private-message-content__cover"
      :src="content.cover"
      :href="content.href"
      video
    />
    <ALink :href="content.href" type="content" class="private-message-content__card-copy">
      <strong>{{ content.title }}</strong>
      <span v-if="content.attachMessage">{{ content.attachMessage }}</span>
      <small>{{ t('notifications.whisper.messages.video_views', { count: content.times }) }}</small>
    </ALink>
  </div>

  <ALink
    v-else-if="content.type === 'article-card'"
    :href="content.href"
    type="content"
    class="private-message-content__card"
  >
    <img
      v-if="content.images[0]"
      class="private-message-content__cover"
      :src="content.images[0]"
      alt=""
      loading="lazy"
      decoding="async"
    >
    <span class="private-message-content__card-copy">
      <strong>{{ content.title }}</strong>
      <span v-if="content.summary">{{ content.summary }}</span>
    </span>
  </ALink>

  <ALink
    v-else-if="content.type === 'picture-card'"
    :href="content.href"
    type="content"
    class="private-message-content__picture-card"
  >
    <img
      :src="content.src"
      :alt="t('notifications.whisper.messages.picture_card_alt')"
      loading="lazy"
      decoding="async"
    >
  </ALink>

  <div
    v-else-if="content.type === 'common-share-card'"
    class="private-message-content__card"
  >
    <PrivateMessageMediaCover
      v-if="content.cover"
      class="private-message-content__cover"
      :src="content.cover"
      :href="content.href"
      :video="content.source === 'video'"
    />
    <ALink :href="content.href" type="content" class="private-message-content__card-copy">
      <strong>{{ content.title }}</strong>
      <small v-if="content.author">{{ content.author }}</small>
    </ALink>
  </div>

  <ALink
    v-else-if="content.type === 'text-share'"
    :href="content.href"
    type="content"
    class="private-message-content__card"
  >
    <span class="private-message-content__card-copy">
      <strong>{{ content.title }}</strong>
      <span v-if="content.text">{{ content.text }}</span>
    </span>
  </ALink>

  <div v-else-if="content.type === 'business-card'" class="private-message-content__card">
    <strong>{{ content.title }}</strong>
    <div class="private-message-content__business-cards">
      <ALink v-for="(card, index) in content.cards" :key="`${card.href}:${index}`" :href="card.href" type="content">
        <img
          v-if="card.cover"
          :src="card.cover"
          alt=""
          loading="lazy"
          decoding="async"
        >
        <span class="private-message-content__card-copy">
          <span v-for="(field, fieldIndex) in card.fields" :key="fieldIndex">{{ field }}</span>
        </span>
      </ALink>
    </div>
  </div>

  <div v-else class="private-message-content__unknown">
    <span>{{ t('notifications.whisper.messages.unsupported') }}</span>
    <ALink :href="originalUrl" type="content">
      {{ t('notifications.actions.open_original') }}
    </ALink>
  </div>
</template>

<style scoped lang="scss">
.private-message-content__bubble,
.private-message-content__card,
.private-message-content__unknown {
  box-sizing: border-box;
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  background: var(--bew-elevated-solid);
  border: 1px solid var(--bew-message-card-border);
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
}

.private-message-content__bubble,
.private-message-content__unknown {
  padding: var(--bew-space-2) var(--bew-space-3);
  white-space: pre-wrap;
}

.private-message-content__bubble--self {
  color: var(--bew-text-1);
  background: var(--bew-selected-bg);
  border-color: var(--bew-message-card-border);
}

.private-message-content__bubble--self .private-message-content__inline-link {
  color: inherit;
  text-decoration: underline;
}

.private-message-content__inline-link,
.private-message-content__unknown a {
  color: var(--bew-theme-foreground);
  text-decoration: none;
}

.private-message-content__inline-link:hover,
.private-message-content__unknown a:hover {
  text-decoration: underline;
}

.private-message-content__inline-emote {
  display: inline-block;
  width: var(--bew-icon-size-lg);
  height: var(--bew-icon-size-lg);
  margin: 0 var(--bew-space-1);
  vertical-align: text-bottom;
  object-fit: contain;
}

.private-message-content__inline-emote--large {
  width: var(--bew-icon-size-xl);
  height: var(--bew-icon-size-xl);
}

.private-message-content__media-button {
  box-sizing: border-box;
  max-width: 100%;
  padding: var(--bew-space-2);
  appearance: none;
  cursor: zoom-in;
  background: var(--bew-elevated-solid);
  border: 0;
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
}

.private-message-content__media-placeholder {
  display: inline-flex;
  gap: var(--bew-space-2);
  align-items: center;
  justify-content: center;
  width: min(100%, calc(var(--bew-space-12) * 3));
  min-height: calc(var(--bew-space-12) * 2);
  padding: var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  appearance: none;
  cursor: pointer;
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-message-card-border);
  border-radius: var(--bew-thumb-radius);
  corner-shape: var(--bew-corner-shape);
}

.private-message-content__media-placeholder:focus-visible {
  outline: var(--bew-focus-ring, 1px solid CanvasText);
  outline-offset: var(--bew-space-1);
}

.private-message-content__media-button:focus-visible,
.private-message-content__card:focus-visible,
.private-message-content__picture-card:focus-visible,
.private-message-content__actions a:focus-visible,
.private-message-content__business-cards a:focus-visible {
  outline: var(--bew-focus-ring, 1px solid CanvasText);
  outline-offset: var(--bew-space-1);
}

.private-message-content__media {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: calc(var(--bew-space-12) * 8);
  object-fit: contain;
  background: var(--bew-fill-1);
  border-radius: var(--bew-interactive-radius);
  corner-shape: inherit;
}

.private-message-content__media--emoticon {
  max-width: calc(var(--bew-space-12) * 3);
  max-height: calc(var(--bew-space-12) * 3);
  background: transparent;
}

.private-message-content__notice {
  display: grid;
  max-width: 80%;
  padding: var(--bew-space-1) var(--bew-space-2);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-caption);
  text-align: center;
}

.private-message-content__expired {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  box-sizing: border-box;
  width: calc(var(--bew-space-12) * 6);
  max-width: 100%;
  min-height: calc(var(--bew-space-12) * 2);
  padding: var(--bew-space-4);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  background: var(--bew-elevated-solid);
  border: 1px solid var(--bew-message-card-border);
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
}

.private-message-content__card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--bew-space-3);
  width: 100%;
  padding: var(--bew-space-3);
  text-decoration: none;
}

a.private-message-content__card:not(:has(.private-message-content__cover)):hover {
  background: var(--bew-fill-1);
}

.private-message-content__cover {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.private-message-content__card:has(> .private-message-content__cover) {
  grid-template-columns: minmax(0, 1fr);
  width: calc(var(--bew-message-share-width) + var(--bew-space-4));
  gap: var(--bew-space-2);
  padding: var(--bew-space-2);
  border-radius: var(--bew-surface-radius);

  .private-message-content__card-copy {
    padding: var(--bew-space-1) var(--bew-space-2) var(--bew-space-2);
  }
}

.private-message-content__card-copy {
  display: grid;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.private-message-content__card-copy strong,
.private-message-content__card-copy span,
.private-message-content__card-copy small {
  overflow: hidden;
  overflow-wrap: anywhere;
}

.private-message-content__card-copy strong {
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-title);
}

.private-message-content__card-copy span {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.private-message-content__card-copy small {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.private-message-content__fields {
  display: grid;
  grid-column: 1 / -1;
  gap: var(--bew-space-2);
  margin: 0;
  padding: var(--bew-space-2);
  background: var(--bew-fill-1);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.private-message-content__fields > div {
  display: flex;
  gap: var(--bew-space-2);
  justify-content: space-between;
}

.private-message-content__fields dt,
.private-message-content__fields dd {
  margin: 0;
}

.private-message-content__fields dt {
  color: var(--bew-text-2);
}

.private-message-content__fields dd {
  color: var(--bew-text-1);
}

.private-message-content__actions {
  display: flex;
  grid-column: 1 / -1;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
}

.private-message-content__actions a {
  padding: var(--bew-space-1) var(--bew-space-2);
  color: var(--bew-theme-foreground);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
  background: var(--bew-fill-1);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.private-message-content__picture-card {
  display: block;
  box-sizing: border-box;
  max-width: 100%;
  padding: var(--bew-space-2);
  overflow: hidden;
  background: var(--bew-elevated-solid);
  border: 0;
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
}

.private-message-content__picture-card img {
  display: block;
  width: var(--bew-message-share-width);
  max-width: 100%;
  max-height: calc(var(--bew-space-12) * 8);
  object-fit: contain;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

@media (hover: hover) {
  .private-message-content__media-button:hover img,
  .private-message-content__picture-card:hover img,
  a.private-message-content__card > .private-message-content__cover:hover {
    filter: brightness(0.85);
  }
}

.private-message-content__business-cards {
  display: grid;
  grid-column: 1 / -1;
  gap: var(--bew-space-2);
}

.private-message-content__business-cards a {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--bew-space-2);
  padding: var(--bew-space-2);
  color: inherit;
  text-decoration: none;
  background: var(--bew-fill-1);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.private-message-content__business-cards img {
  width: var(--bew-message-share-width);
  max-width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: var(--bew-radius-tiny);
  corner-shape: var(--bew-corner-shape);
}

.private-message-content__unknown {
  display: grid;
  gap: var(--bew-space-1);
}

.private-message-content__unknown a {
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
}
</style>
