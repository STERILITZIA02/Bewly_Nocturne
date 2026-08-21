<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { SystemNotification } from '../notification'

const props = defineProps<{
  item: SystemNotification
}>()

const { locale, t } = useI18n()
const sourceLogoFailed = ref(false)
const cardCoverFailed = ref(false)
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
  sourceLogoFailed.value = false
  cardCoverFailed.value = false
})
</script>

<template>
  <article class="native-system-notification" :data-notification-id="item.id">
    <div class="native-system-notification__icon" aria-hidden="true">
      <img
        v-if="item.sourceLogo && !sourceLogoFailed"
        :src="item.sourceLogo"
        alt=""
        loading="lazy"
        decoding="async"
        @error="sourceLogoFailed = true"
      >
      <i v-else i-solar:bell-bing-bold-duotone />
    </div>

    <div class="native-system-notification__content">
      <header class="native-system-notification__header">
        <div>
          <span v-if="item.unread" class="native-system-notification__unread" aria-hidden="true" />
          <h3>{{ item.title || t('notifications.native.system.unknown_title') }}</h3>
          <span v-if="item.source" class="native-system-notification__source">{{ item.source }}</span>
        </div>
        <time v-if="formattedTime" :datetime="new Date(item.timestamp * 1000).toISOString()">
          {{ formattedTime }}
        </time>
      </header>

      <p v-if="item.segments.length" class="native-system-notification__body">
        <template v-for="(segment, index) in item.segments" :key="`${item.id}:${index}`">
          <ALink
            v-if="segment.type === 'link'"
            :href="segment.href"
            type="content"
            class="native-system-notification__inline-link"
          >
            {{ segment.text }}
          </ALink>
          <span v-else>{{ segment.text }}</span>
        </template>
      </p>
      <template v-else>
        <p class="native-system-notification__body native-system-notification__body--unsupported">
          {{ t('notifications.native.system.unsupported_content') }}
        </p>
        <ALink
          :href="item.originalUrl"
          type="content"
          class="native-system-notification__fallback-link"
        >
          {{ t('notifications.actions.open_original') }}
        </ALink>
      </template>

      <ALink
        v-if="item.cardTitle && item.cardUrl"
        :href="item.cardUrl"
        type="content"
        class="native-system-notification__card"
      >
        <img
          v-if="item.cardCover && !cardCoverFailed"
          :src="item.cardCover"
          :alt="t('notifications.native.system.cover_alt')"
          loading="lazy"
          decoding="async"
          @error="cardCoverFailed = true"
        >
        <span>{{ item.cardTitle }}</span>
      </ALink>
    </div>
  </article>
</template>

<style scoped lang="scss">
.native-system-notification {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--bew-space-3);
  padding: var(--bew-space-4) var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.native-system-notification:hover {
  background: var(--bew-fill-1);
}

.native-system-notification__icon {
  display: grid;
  place-items: center;
  width: var(--bew-space-12);
  height: var(--bew-space-12);
  overflow: hidden;
  color: var(--bew-theme-color);
  font-size: var(--bew-icon-size-lg);
  background: var(--bew-fill-1);
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
}

.native-system-notification__icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.native-system-notification__content {
  min-width: 0;
}

.native-system-notification__header {
  display: flex;
  gap: var(--bew-space-3);
  align-items: baseline;
  justify-content: space-between;
}

.native-system-notification__header > div {
  display: flex;
  min-width: 0;
  gap: var(--bew-space-2);
  align-items: center;
}

.native-system-notification__header h3 {
  min-width: 0;
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
  overflow-wrap: anywhere;
}

.native-system-notification__header time,
.native-system-notification__source {
  flex: 0 0 auto;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.native-system-notification__unread {
  flex: 0 0 auto;
  width: var(--bew-space-2);
  height: var(--bew-space-2);
  background: var(--bew-theme-color);
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
}

.native-system-notification__body {
  margin: var(--bew-space-2) 0 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.native-system-notification__body--unsupported {
  color: var(--bew-text-2);
}

.native-system-notification__inline-link {
  color: var(--bew-theme-color);
  text-decoration: none;
}

.native-system-notification__fallback-link {
  display: inline-flex;
  margin-top: var(--bew-space-2);
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
}

.native-system-notification__card {
  display: flex;
  gap: var(--bew-space-3);
  align-items: center;
  margin-top: var(--bew-space-3);
  padding: var(--bew-space-3);
  color: var(--bew-text-1);
  text-decoration: none;
  background: var(--bew-fill-1);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.native-system-notification__card img {
  width: calc(var(--bew-space-10) * 2);
  height: var(--bew-space-12);
  object-fit: cover;
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
}

@media (prefers-reduced-motion: reduce) {
  .native-system-notification {
    transition: none;
  }
}
</style>
