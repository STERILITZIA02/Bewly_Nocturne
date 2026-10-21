<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { normalizeIntlLocale } from '~/utils/locale'

import { PRIVATE_HISTORY_VISIBLE_BATCH_SIZE } from './privateSearchPolicy'
import type { PrivateHistorySearchController } from './usePrivateHistorySearch'

const props = defineProps<{ controller: PrivateHistorySearchController, query: string }>()
const emit = defineEmits<{ select: [key: string], search: [] }>()
const { t, locale } = useI18n()
const root = ref<HTMLElement>()
const state = computed(() => props.controller.state)
const visibleCount = computed({ get: () => state.value.visibleResultCount, set: value => state.value.visibleResultCount = value })
const results = computed(() => props.controller.filteredResults.value)
const visibleResults = computed(() => results.value.slice(0, visibleCount.value))
watch(() => props.controller.selectedIndex.value, async (index) => {
  if (index < 0)
    return
  visibleCount.value = Math.max(visibleCount.value, Math.ceil((index + 1) / PRIVATE_HISTORY_VISIBLE_BATCH_SIZE) * PRIVATE_HISTORY_VISIBLE_BATCH_SIZE)
  await nextTick()
  root.value?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' })
}, { immediate: true })
const pattern = computed(() => state.value.query ? new RegExp(state.value.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu') : null)
function snippetParts(text: string) {
  const match = pattern.value?.exec(text)
  if (!match)
    return [{ text, match: false }]
  return [{ text: text.slice(0, match.index), match: false }, { text: match[0], match: true }, { text: text.slice(match.index + match[0].length), match: false }]
}
function moveFocus(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowUp', 'ArrowDown'].includes(event.key))
    return
  const items = Array.from(root.value?.querySelectorAll<HTMLButtonElement>('.private-history-results__item') ?? [])
  const current = items.indexOf(event.target as HTMLButtonElement)
  const next = current + (event.key === 'ArrowDown' ? 1 : -1)
  if (current >= 0 && items[next]) {
    event.preventDefault()
    items[next].focus()
  }
}
function formatTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString(normalizeIntlLocale(locale.value))
}
</script>

<template>
  <section ref="root" class="private-history-results" :aria-label="t('notifications.whisper.search.messages')" @keydown="moveFocus">
    <Button v-if="!state.query" type="tertiary" :disabled="!query.trim()" @click="emit('search')">
      {{ t('notifications.whisper.search.start') }}
    </Button>
    <template v-else>
      <div class="private-history-results__list">
        <p v-if="state.complete" class="private-history-results__status" role="status">
          {{ t('notifications.whisper.search.complete') }}
        </p>
        <p v-if="state.batch > 1" class="private-history-results__status">
          {{ t('notifications.whisper.search.batch', { count: state.batch }) }}
        </p>
        <p v-if="state.skippedSessions" class="private-history-results__status">
          {{ t('notifications.whisper.search.skipped', { count: state.skippedSessions }) }}
        </p>
        <button
          v-for="result in visibleResults" :key="result.key" type="button"
          class="private-history-results__item"
          :aria-current="state.selectedKey === result.key ? 'true' : undefined"
          @click="emit('select', result.key)"
        >
          <span class="private-history-results__heading">
            <strong>{{ result.session.name }}</strong>
            <time>{{ formatTime(result.message.timestamp) }}</time>
          </span>
          <span class="private-history-results__snippet">
            <template v-for="(part, index) in snippetParts(result.snippet)" :key="index">
              <mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template>
            </template>
          </span>
        </button>
        <div v-if="visibleCount < results.length" class="private-history-results__more">
          <button type="button" class="bew-message-search-pill" @click="visibleCount += PRIVATE_HISTORY_VISIBLE_BATCH_SIZE">
            {{ t('notifications.whisper.recipient_search.more') }}
          </button>
        </div>
        <p v-if="state.error" class="private-history-results__status" role="alert">
          {{ t('notifications.whisper.search.error') }}
        </p>
        <p v-else-if="state.limited" class="private-history-results__status">
          {{ t('notifications.whisper.search.limit') }}
        </p>
        <p v-else-if="state.complete && !results.length" class="private-history-results__status">
          {{ t('notifications.whisper.search.empty') }}
        </p>
      </div>
      <div class="private-history-results__controls">
        <button
          v-if="state.running || (!state.complete && !state.limited)"
          type="button" class="private-history-results__search-toggle bew-message-search-pill"
          :class="{ 'private-history-results__search-toggle--running': state.running }"
          :aria-label="state.running ? `${t('notifications.whisper.search.progress')}，${t('notifications.whisper.search.stop')}` : t('notifications.whisper.search.continue')"
          @click="state.running ? controller.stop() : controller.resume()"
        >
          <span class="private-history-results__activity" aria-hidden="true">
            <svg
              class="private-history-results__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round"
            >
              <circle class="private-history-results__search-ring" cx="10" cy="10" r="6" stroke-dasharray="28 10" />
              <path d="m15 15 5 5" />
            </svg>
            <svg class="private-history-results__pause-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3v14H7zm7 0h3v14h-3z" /></svg>
          </span>
          <span aria-live="polite">{{ t(state.running ? 'notifications.whisper.search.progress' : 'notifications.whisper.search.continue') }}</span>
        </button>
        <Button v-if="state.canSkip && !state.running" type="tertiary" @click="controller.skipFailed()">
          {{ t('notifications.whisper.search.skip') }}
        </Button>
        <Button v-if="state.limited" type="tertiary" @click="controller.nextBatch()">
          {{ t('notifications.whisper.search.next_batch') }}
        </Button>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/sidebarSurface";
@use "../../../../styles/scrollEdgeFade";
.private-history-results {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  gap: var(--bew-space-2);
}
.private-history-results__list {
  @include sidebarSurface.vertical-scroll;
  // Its bottom is the screen edge, which needs no fade.
  @include scrollEdgeFade.vertical($bottom: false);
  display: grid;
  align-content: start;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  gap: var(--bew-space-2);
}
.private-history-results__controls {
  display: grid;
  justify-items: center;
  flex: none;
  gap: var(--bew-space-2);
}
.private-history-results__status {
  margin: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.private-history-results__item {
  display: grid;
  min-width: 0;
  gap: var(--bew-space-1);
  padding: var(--bew-space-3);
  text-align: left;
  cursor: pointer;
  color: var(--bew-text-1);
  background: transparent;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  &[aria-current="true"] {
    background: var(--bew-theme-surface);
    color: var(--bew-on-theme-surface);
  }
  &:not([aria-current="true"]):hover {
    background: var(--bew-fill-1);
  }
}
.private-history-results__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--bew-space-2);
}
.private-history-results__heading strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
}
.private-history-results__heading time {
  flex: none;
  font-size: var(--bew-font-size-caption);
  color: var(--bew-text-3);
}
.private-history-results__snippet {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.private-history-results__snippet mark {
  padding: 0;
  color: var(--bew-theme-foreground);
  background: transparent;
  border-radius: 0;
}

.private-history-results__search-toggle {
  justify-self: center;
  margin-block: var(--bew-space-2);

  &::before {
    position: absolute;
    inset: 0;
    z-index: -1;
    content: "";
    pointer-events: none;
    background: linear-gradient(100deg, transparent 20%, var(--bew-fill-4) 50%, transparent 80%);
    opacity: 0;
  }
}

.private-history-results__more {
  display: flex;
  justify-content: center;
  margin-block: var(--bew-space-2);
}

.private-history-results__activity {
  position: relative;
  flex: none;
  width: var(--bew-icon-size-md);
  height: var(--bew-icon-size-md);

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transition: opacity var(--bew-duration-fast) ease;
  }
}
.private-history-results__search-icon {
  opacity: 0;
}
.private-history-results__pause-icon {
  opacity: 1;
}
.private-history-results__search-ring {
  transform-origin: 10px 10px;
}

.private-history-results__search-toggle--running {
  &::before {
    opacity: 1;
    animation: private-search-shimmer 1.4s ease-in-out infinite alternate;
  }
  .private-history-results__search-icon {
    opacity: 1;
  }
  .private-history-results__pause-icon {
    opacity: 0;
  }
  .private-history-results__search-ring {
    animation: private-search-spin 1s linear infinite;
  }
}
@keyframes private-search-shimmer {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}
@keyframes private-search-spin {
  to {
    transform: rotate(1turn);
  }
}
@media (prefers-reduced-motion: reduce) {
  .private-history-results__search-toggle--running::before,
  .private-history-results__search-toggle--running .private-history-results__search-ring {
    animation: none;
  }
  .private-history-results__search-toggle--running::before {
    opacity: 0;
  }
}
</style>
