<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { useTopBarStore } from '~/stores/topBarStore'
import { normalizeIntlLocale } from '~/utils/locale'

import type { MarkAllMessagesReadController } from '../composables/useMarkAllMessagesRead'
import type { NativeNotificationSection } from '../notificationSections'
import MessageActivityChart from './MessageActivityChart.vue'
import { getMessageInsights, getRecentConversationActivity } from './messageInsights'
import type { DisplayPrivateSession } from './privateSession'

const props = defineProps<{ sessions: DisplayPrivateSession[], loaded: boolean, readAll?: MarkAllMessagesReadController }>()
const emit = defineEmits<{
  (event: 'selectSession', session: DisplayPrivateSession): void
  (event: 'selectView', view: NativeNotificationSection): void
}>()
const { t, locale } = useI18n()
const topBarStore = useTopBarStore()
const insights = computed(() => getMessageInsights(props.sessions, topBarStore.unReadMessage, topBarStore.unReadDm))
const formatter = computed(() => new Intl.NumberFormat(normalizeIntlLocale(locale.value)))
const timeFormatter = computed(() => new Intl.DateTimeFormat(normalizeIntlLocale(locale.value), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))
const formatCount = (value: number | null) => value === null ? '—' : formatter.value.format(value)
const largestCount = computed(() => Math.max(1, ...insights.value.notifications.map(item => item.count ?? 0)))
const markingRead = computed(() => props.readAll?.state.status === 'running')
const markReadError = computed(() => props.readAll?.state.status === 'partial' || props.readAll?.state.status === 'error')
const activity = computed(() => getRecentConversationActivity(props.sessions))
const privateShare = computed(() => {
  const { followed, unfollowed } = insights.value
  if (followed === null || unfollowed === null || followed + unfollowed === 0)
    return null
  return followed / (followed + unfollowed) * 100
})
</script>

<template>
  <section class="conversation-insights" data-top-bar-scroll :aria-label="t('notifications.insights.overview')">
    <div class="conversation-insights__grid">
      <article class="conversation-insights__card conversation-insights__hero">
        <header class="conversation-insights__headline">
          <div class="conversation-insights__heading">
            <h2>{{ t('notifications.insights.unread_total') }}</h2>
            <strong class="conversation-insights__total">{{ formatCount(insights.total) }}</strong>
          </div>
          <button
            v-if="readAll" type="button" class="conversation-insights__mark-read"
            :disabled="markingRead || insights.total === 0" :aria-busy="markingRead"
            @click="readAll.markAllRead()"
          >
            <SkeletonBlock v-if="markingRead" width="var(--bew-icon-size-md)" height="var(--bew-icon-size-md)" radius="circle" />
            <i v-else i-mingcute:checks-line aria-hidden="true" />
            {{ t(markingRead ? 'notifications.insights.marking_read' : insights.total === 0 ? 'notifications.insights.all_read' : 'notifications.insights.mark_all_read') }}
          </button>
        </header>
        <p v-if="markReadError" class="conversation-insights__error" role="status">
          {{ t(readAll?.state.status === 'partial' ? 'notifications.insights.read_partial' : 'notifications.insights.read_failed') }}
        </p>
        <div class="conversation-insights__bars" :aria-label="t('notifications.insights.unread_notifications')">
          <button
            v-for="(item, index) in insights.notifications" :key="item.key"
            class="conversation-insights__notification" type="button"
            :style="{ '--bar-intensity': `${40 + index * 20}%` }"
            :aria-label="`${t(`notifications.sections.${item.key}.label`)} ${formatCount(item.count)}`"
            @click="emit('selectView', item.key)"
          >
            <span class="conversation-insights__bar-track" aria-hidden="true">
              <span class="conversation-insights__bar" :style="{ height: `${(item.count ?? 0) / largestCount * 100}%` }" />
            </span>
            <strong>{{ formatCount(item.count) }}</strong>
            <span class="conversation-insights__bar-label">{{ t(`notifications.sections.${item.key}.label`) }}</span>
          </button>
        </div>
      </article>

      <article class="conversation-insights__card conversation-insights__activity">
        <header class="conversation-insights__heading">
          <h2>{{ t('notifications.insights.activity') }}</h2>
          <span class="conversation-insights__caption">{{ t('notifications.insights.activity_scope') }}</span>
        </header>
        <MessageActivityChart v-if="loaded" :days="activity" />
        <div v-else class="conversation-insights__activity-skeleton">
          <SkeletonBlock width="40%" height="var(--bew-line-height-caption)" />
          <SkeletonBlock height="var(--bew-insights-chart-height)" radius="interactive" />
          <SkeletonBlock width="60%" height="var(--bew-line-height-caption)" />
        </div>
      </article>

      <article class="conversation-insights__card conversation-insights__private">
        <h2>{{ t('notifications.insights.unread_private') }}</h2>
        <div class="conversation-insights__private-body">
          <div class="conversation-insights__proportion">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle class="conversation-insights__ring-track" cx="60" cy="60" r="48" />
              <circle v-if="privateShare !== null" class="conversation-insights__ring-secondary" cx="60" cy="60" r="48" />
              <circle
                v-if="privateShare !== null && privateShare > 0" class="conversation-insights__ring-primary" cx="60" cy="60" r="48"
                pathLength="100" :stroke-dasharray="privateShare === 100 ? undefined : `${privateShare} 100`"
              />
            </svg>
            <strong class="conversation-insights__number">{{ formatCount(insights.privateCount) }}</strong>
          </div>
          <dl>
            <div>
              <dt class="conversation-insights__key">
                {{ t('notifications.insights.followed') }}
              </dt><dd>{{ formatCount(insights.followed) }}</dd>
            </div>
            <div>
              <dt class="conversation-insights__key conversation-insights__key--secondary">
                {{ t('notifications.insights.unfollowed') }}
              </dt><dd>{{ formatCount(insights.unfollowed) }}</dd>
            </div>
          </dl>
        </div>
        <dl class="conversation-insights__session-stats">
          <div>
            <dt>{{ t('notifications.insights.loaded_sessions') }}</dt>
            <dd>
              <template v-if="loaded">
                {{ formatCount(insights.sessions) }}
              </template>
              <SkeletonBlock v-else width="var(--bew-space-8)" height="var(--bew-line-height-title)" />
            </dd>
          </div>
          <div><dt>{{ t('notifications.insights.pinned') }}</dt><dd>{{ loaded ? formatCount(insights.pinned) : '—' }}</dd></div>
          <div><dt>{{ t('notifications.insights.muted') }}</dt><dd>{{ loaded ? formatCount(insights.muted) : '—' }}</dd></div>
        </dl>
      </article>

      <article v-if="insights.recent.length" class="conversation-insights__card conversation-insights__recent">
        <h2>{{ t('notifications.insights.recent') }}</h2>
        <div class="conversation-insights__recent-list">
          <button v-for="session in insights.recent" :key="session.key" type="button" class="conversation-insights__session" @click="emit('selectSession', session)">
            <span class="conversation-insights__avatar" aria-hidden="true">{{ session.name.slice(0, 1) }}</span>
            <span class="conversation-insights__session-copy">
              <strong>{{ session.name }}</strong>
              <time :datetime="new Date(Math.trunc(session.timestamp / 1000)).toISOString()">{{ timeFormatter.format(Math.trunc(session.timestamp / 1000)) }}</time>
            </span>
            <span v-if="session.unreadCount > 0" class="conversation-insights__badge">{{ formatCount(session.unreadCount) }}</span>
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped lang="scss">
.conversation-insights__mark-read {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: var(--bew-space-2);
  min-height: var(--bew-control-height);
  padding: var(--bew-space-2) var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-badge-radius);
  background: var(--bew-fill-1);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--bew-fill-2);
  }
  &:active:not(:disabled) {
    background: var(--bew-fill-3);
  }
  &:disabled {
    color: var(--bew-text-3);
    cursor: default;
  }
}

.conversation-insights__error {
  margin: 0;
  color: var(--bew-error-color);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.conversation-insights {
  box-sizing: border-box;
  padding: calc(var(--bew-top-bar-height) + var(--bew-space-4)) var(--bew-notifications-feed-inline-space)
    var(--notifications-detail-bottom-space, var(--bew-space-3));
  height: 100%;
  min-width: 0;
  overflow: auto;
  overscroll-behavior: contain;
  container: message-insights / inline-size;
}

.conversation-insights__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--bew-space-3);
  padding: var(--bew-space-1);
  align-items: stretch;
}

.conversation-insights__activity-skeleton {
  display: grid;
  gap: var(--bew-space-3);
}

.conversation-insights__card {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: var(--bew-space-3);
  padding: var(--bew-space-4);
  color: var(--bew-text-1);
  background: transparent;
  border: 1px solid var(--bew-message-card-border);
  border-radius: var(--bew-card-radius);
  corner-shape: var(--bew-corner-shape);

  h2 {
    display: flex;
    align-items: center;
    gap: var(--bew-space-2);
    margin: 0;
    font-size: var(--bew-font-size-title);
    line-height: var(--bew-line-height-title);
    font-weight: var(--bew-font-weight-semibold);
  }

  i {
    font-size: var(--bew-icon-size-md);
  }

  dl {
    display: grid;
    gap: var(--bew-space-2);
    margin: 0;
  }
  dl > div {
    display: flex;
    justify-content: space-between;
    gap: var(--bew-space-2);
  }
  dt {
    color: var(--bew-text-2);
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
}

.conversation-insights__total {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: var(--bew-font-size-data-emphasis);
  line-height: 1;
  font-weight: var(--bew-font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.conversation-insights__heading {
  display: grid;
  gap: var(--bew-space-1);
}
.conversation-insights__private-body {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--bew-space-6);
}
.conversation-insights__card .conversation-insights__session-stats {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bew-space-3);
  padding-top: var(--bew-space-3);
  border-top: 1px solid var(--bew-border-color);
}
.conversation-insights__session-stats > div {
  flex-direction: column;
}
.conversation-insights__session-stats dd {
  font-size: var(--bew-font-size-title);
  line-height: var(--bew-line-height-title);
  font-weight: var(--bew-font-weight-semibold);
}
.conversation-insights__number {
  font-size: var(--bew-font-size-data);
  line-height: 1;
  font-weight: var(--bew-font-weight-semibold);
  font-variant-numeric: tabular-nums;
}
.conversation-insights__caption {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.conversation-insights__card dl,
.conversation-insights__notification {
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.conversation-insights__notification,
.conversation-insights__session {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bew-space-2) var(--bew-space-3);
  width: 100%;
  min-width: 0;
  padding: var(--bew-space-2);
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  text-align: start;
  cursor: pointer;
  transition: background-color 180ms ease;

  &:hover {
    background: var(--bew-fill-1);
  }
  &:active {
    background: var(--bew-fill-2);
  }
  &:focus-visible {
    outline: var(--bew-focus-ring, 1px solid CanvasText);
    outline-offset: var(--bew-space-0-5);
  }
}

.conversation-insights__headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--bew-space-3);
}
.conversation-insights__bars {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--bew-space-2);
}
.conversation-insights__bars .conversation-insights__notification {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--bew-space-2);
  text-align: center;
  align-content: end;
  justify-items: center;
}
.conversation-insights__bar-track {
  display: flex;
  align-items: end;
  justify-content: center;
  width: 100%;
  height: calc(var(--bew-insights-chart-height) - var(--bew-space-12));
}
.conversation-insights__bar {
  display: block;
  width: min(100%, calc(var(--bew-space-8) * 2));
  min-height: var(--bew-space-0-5);
  background: color-mix(in oklab, var(--bew-theme-color) var(--bar-intensity), var(--bew-content-solid));
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}
.conversation-insights__bar-label {
  min-height: calc(var(--bew-line-height-caption) * 2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.conversation-insights__proportion {
  display: grid;
  place-items: center;
  justify-self: center;
  width: calc(var(--bew-space-12) * 2);
  aspect-ratio: 1;
}
.conversation-insights__proportion > * {
  grid-area: 1 / 1;
}
.conversation-insights__proportion svg {
  width: 100%;
  transform: rotate(-90deg);
}
.conversation-insights__proportion circle {
  fill: none;
  stroke-width: 12;
}
.conversation-insights__ring-track {
  stroke: var(--bew-fill-1);
}
.conversation-insights__ring-secondary {
  stroke: color-mix(in oklab, var(--bew-theme-color) 35%, var(--bew-content-solid));
}
.conversation-insights__ring-primary {
  stroke: var(--bew-theme-color);
}
.conversation-insights__key {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}
.conversation-insights__key::before {
  content: "";
  width: var(--bew-space-2);
  height: var(--bew-space-2);
  border-radius: var(--bew-radius-sm);
  background: var(--bew-theme-color);
}
.conversation-insights__key--secondary::before {
  background: color-mix(in oklab, var(--bew-theme-color) 35%, var(--bew-content-solid));
}

.conversation-insights__recent-list {
  display: grid;
  gap: var(--bew-space-1);
  min-width: 0;
}
.conversation-insights__avatar {
  display: grid;
  place-items: center;
  width: var(--bew-space-8);
  height: var(--bew-space-8);
  border-radius: 50%;
  background: var(--bew-fill-1);
}
.conversation-insights__session-copy {
  display: grid;
  gap: 0;
  min-width: 0;
}
.conversation-insights__session-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  font-weight: var(--bew-font-weight-medium);
}
.conversation-insights__session-copy time {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
.conversation-insights__badge {
  padding: 0 var(--bew-space-2);
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
  border-radius: var(--bew-badge-radius);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

@container message-insights (min-width: 720px) {
  .conversation-insights__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.conversation-insights__session {
  padding-block: var(--bew-space-1);
}

@media (prefers-reduced-motion: reduce) {
  .conversation-insights__notification,
  .conversation-insights__session {
    transition: none;
  }
}
</style>
