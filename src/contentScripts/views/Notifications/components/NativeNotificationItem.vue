<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { DisplayNotification, DisplayNotificationActor } from '../notification'

const props = defineProps<{
  item: DisplayNotification
}>()

const { locale, t } = useI18n()
const avatarFailed = ref(false)
const sourceImageFailed = ref(false)

const fallbackActor: DisplayNotificationActor = { id: '', name: '', avatar: '' }
const primaryActor = computed(() => props.item.actors[0] ?? fallbackActor)
const actorName = computed(() => primaryActor.value.name || t('notifications.reply.unknown_user'))
const actorUrl = computed(() => primaryActor.value.id
  ? `https://space.bilibili.com/${encodeURIComponent(primaryActor.value.id)}`
  : props.item.originalUrl)
const sourceUrl = computed(() => props.item.sourceUrl || props.item.originalUrl)
const sourceTitle = computed(() => props.item.sourceTitle || t('notifications.reply.original_content'))
const formattedTime = computed(() => {
  if (!props.item.timestamp)
    return ''

  try {
    return new Intl.DateTimeFormat(locale.value, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(props.item.timestamp * 1000)
  }
  catch {
    return ''
  }
})

watch(() => props.item.id, () => {
  avatarFailed.value = false
  sourceImageFailed.value = false
})
</script>

<template>
  <article class="native-notification-item">
    <div class="native-notification-item__avatar" aria-hidden="true">
      <img
        v-if="primaryActor.avatar && !avatarFailed"
        :src="primaryActor.avatar"
        alt=""
        @error="avatarFailed = true"
      >
      <i v-else i-solar:user-circle-bold-duotone />
    </div>

    <div class="native-notification-item__content">
      <header class="native-notification-item__header">
        <p>
          <span v-if="item.unread" class="native-notification-item__unread" aria-hidden="true" />
          <ALink :href="actorUrl" type="content" class="native-notification-item__actor">
            {{ actorName }}
          </ALink>
          <span>{{ t(item.actionTextKey) }}</span>
        </p>
        <time v-if="formattedTime" :datetime="new Date(item.timestamp * 1000).toISOString()">
          {{ formattedTime }}
        </time>
      </header>

      <p v-if="item.body" class="native-notification-item__body">
        {{ item.body }}
      </p>

      <div v-if="item.quote || item.sourceTitle || item.sourceImage" class="native-notification-item__reference">
        <p v-if="item.quote">
          {{ item.quote }}
        </p>
        <ALink :href="sourceUrl" type="content" class="native-notification-item__source">
          <span class="native-notification-item__source-image">
            <img
              v-if="item.sourceImage && !sourceImageFailed"
              :src="item.sourceImage"
              alt=""
              @error="sourceImageFailed = true"
            >
            <i v-else i-solar:document-text-bold-duotone />
          </span>
          <span>{{ sourceTitle }}</span>
        </ALink>
      </div>

      <ALink :href="sourceUrl" type="content" class="native-notification-item__open-source">
        {{ t('notifications.reply.view_source') }}
        <i i-mingcute:arrow-right-line />
      </ALink>
    </div>
  </article>
</template>

<style scoped lang="scss">
.native-notification-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--bew-space-3);
  padding: var(--bew-space-4) var(--bew-space-2);
  border-bottom: 1px solid var(--bew-border-color);
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.native-notification-item:hover {
  background: var(--bew-fill-1);
}

.native-notification-item__avatar {
  display: grid;
  place-items: center;
  width: var(--bew-space-12);
  height: var(--bew-space-12);
  overflow: hidden;
  color: var(--bew-text-3);
  font-size: var(--bew-icon-size-xl);
  background: var(--bew-fill-1);
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
}

.native-notification-item__avatar img,
.native-notification-item__source-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.native-notification-item__content {
  min-width: 0;
}

.native-notification-item__header {
  display: flex;
  gap: var(--bew-space-3);
  align-items: baseline;
  justify-content: space-between;
}

.native-notification-item__header p,
.native-notification-item__body,
.native-notification-item__reference p {
  margin: 0;
}

.native-notification-item__header p {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-1);
  align-items: center;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-title);
  line-height: var(--bew-line-height-title);
}

.native-notification-item__header time {
  flex: 0 0 auto;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.native-notification-item__actor {
  color: var(--bew-text-1);
  font-weight: var(--bew-font-weight-semibold);
  text-decoration: none;
}

.native-notification-item__actor:hover,
.native-notification-item__open-source:hover {
  color: var(--bew-theme-color);
}

.native-notification-item__unread {
  width: var(--bew-space-2);
  height: var(--bew-space-2);
  background: var(--bew-theme-color);
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
}

.native-notification-item__body {
  margin-top: var(--bew-space-2);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.native-notification-item__reference {
  display: grid;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-3);
  padding: var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  background: var(--bew-fill-1);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.native-notification-item__source {
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.native-notification-item__source-image {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: calc(var(--bew-space-10) * 2);
  height: var(--bew-space-12);
  overflow: hidden;
  color: var(--bew-text-3);
  font-size: var(--bew-icon-size-lg);
  background: var(--bew-content-alt);
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
}

.native-notification-item__source > span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.native-notification-item__open-source {
  display: inline-flex;
  gap: var(--bew-space-1);
  align-items: center;
  margin-top: var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
}

@media (prefers-reduced-motion: reduce) {
  .native-notification-item {
    transition: none;
  }
}
</style>
