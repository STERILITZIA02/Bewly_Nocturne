<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import LibrarySidebarHeading from '~/components/LibrarySidebarHeading.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { settings } from '~/logic'
import { vLayoutEditable } from '~/logic/layoutEdit'
import { numFormatter } from '~/utils/dataFormatter'

import type { MomentFilter } from './momentFeedTypes'
import type { MomentsPortalLiveUser, MomentsPortalUser } from './momentPortal'
import { getSidebarAvatarUrl } from './momentPortal'
import MomentsLiveRow from './MomentsLiveRow.vue'
import type { useMomentPreviews } from './useMomentPreviews'

withDefaults(defineProps<{
  modelValue: MomentFilter
  contentId: string
  loading?: boolean
  user?: MomentsPortalUser | null
  liveUsers?: MomentsPortalLiveUser[]
  liveCount?: number
  previews?: ReturnType<typeof useMomentPreviews>
}>(), { user: null, liveUsers: () => [], liveCount: 0 })
const emit = defineEmits<{ (event: 'update:modelValue', value: MomentFilter): void }>()
const { t } = useI18n()
const options = computed(() => (['all', 'video', 'pgc', 'article'] as const).map(value => ({ value, label: t(`moments.filter_${value}`) })))
const stats = [
  { key: 'following', path: 'fans/follow', label: 'moments.following' },
  { key: 'follower', path: 'fans/fans', label: 'moments.followers' },
  { key: 'dyns', path: 'dynamic', label: 'moments.moments' },
] as const
function select(value: string) {
  const option = options.value.find(option => option.value === value)
  if (option)
    emit('update:modelValue', option.value)
}
</script>

<template>
  <div v-layout-editable="'moments-sidebar'" class="library-rail-content moments-sidebar" data-layout-editable-id="moments-sidebar">
    <LibrarySidebarHeading
      hide-title :title="t('moments.moments')" :model-value="modelValue" :options="options" :content-id="contentId"
      @update:model-value="select"
    />
    <div
      v-if="settings.momentsSidebarShowUserCard || settings.momentsSidebarShowPublish || settings.momentsSidebarShowLive"
      class="moments-sidebar__modules"
    >
      <article v-if="settings.momentsSidebarShowUserCard && (loading || user)" class="moments-sidebar__card moments-user-card" :aria-busy="loading">
        <template v-if="loading && !user">
          <div class="moments-user-card__profile" aria-hidden="true">
            <SkeletonBlock width="var(--bew-space-12)" height="var(--bew-space-12)" radius="circle" />
            <div class="moments-user-card__identity">
              <SkeletonBlock width="100%" height="var(--bew-line-height-title)" />
              <SkeletonBlock width="65%" height="var(--bew-space-5)" />
            </div>
          </div>
          <div class="moments-user-card__stats" aria-hidden="true">
            <div v-for="stat in stats" :key="stat.key" class="moments-user-card__stat">
              <SkeletonBlock width="65%" height="var(--bew-line-height-heading)" />
              <SkeletonBlock width="50%" height="var(--bew-line-height-caption)" />
            </div>
          </div>
        </template>
        <template v-else-if="user">
          <a class="moments-user-card__profile" :href="`https://space.bilibili.com/${user.mid}`" target="_blank" rel="noopener noreferrer">
            <img :src="getSidebarAvatarUrl(user.face)" :alt="user.name">
            <span class="moments-user-card__identity">
              <strong>{{ user.name }}</strong>
              <span class="moments-user-card__badges">
                <em v-if="user.vip?.status === 1 && user.vip.label?.text">{{ user.vip.label.text }}</em>
                <i v-if="user.level_info?.current_level">LV{{ user.level_info.current_level }}</i>
              </span>
            </span>
          </a>
          <div class="moments-user-card__stats">
            <a
              v-for="stat in stats" :key="stat.key" class="moments-user-card__stat" :href="`https://space.bilibili.com/${user.mid}/${stat.path}`"
              target="_blank" rel="noopener noreferrer" :title="user[stat.key]" @click.stop
            ><strong>{{ numFormatter(user[stat.key] || 0) }}</strong><small>{{ t(stat.label) }}</small></a>
          </div>
        </template>
      </article>
      <a v-if="settings.momentsSidebarShowPublish" class="moments-publish-link library-sidebar-action" href="https://t.bilibili.com" target="_blank" rel="noopener noreferrer">
        <i i-tabler:edit aria-hidden="true" />
        <span>{{ t('moments.publish') }}</span>
        <i i-tabler:external-link aria-hidden="true" />
      </a>
      <section v-if="settings.momentsSidebarShowLive && (loading || liveUsers.length)" class="moments-sidebar__card moments-live-card" :aria-busy="loading">
        <header><strong>{{ t('moments.live_now') }}</strong><span v-if="!loading || liveUsers.length">{{ liveCount }}</span></header>
        <div class="moments-live-card__list">
          <template v-if="loading && !liveUsers.length">
            <div v-for="index in 5" :key="index" class="moments-live-card__row" data-bew-skeleton-group aria-hidden="true">
              <SkeletonBlock width="var(--bew-space-10)" height="var(--bew-space-10)" radius="circle" />
              <div class="moments-live-card__info">
                <SkeletonBlock width="70%" height="var(--bew-line-height-control)" />
                <SkeletonBlock width="90%" height="var(--bew-line-height-caption)" />
              </div>
              <SkeletonBlock width="var(--bew-space-6)" height="var(--bew-space-6)" radius="circle" />
            </div>
          </template>
          <MomentsLiveRow v-for="liveUser in liveUsers" :key="liveUser.room_id" :user="liveUser" :previews="previews" />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "../../../styles/scrollEdgeFade";

.moments-sidebar {
  height: 100%;
  min-height: 0;
}
.moments-sidebar .moments-sidebar__modules {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: var(--bew-space-3);
  min-width: 0;
  min-height: 0;
  > * {
    flex: none;
  }
  > .moments-live-card {
    flex: 0 1 auto;
    // Keep one row reachable on exceptionally short windows; only then may
    // the outer rail scroll. Ordinary expansion stays inside the live list.
    min-height: calc(
      var(--bew-library-filter-padding) * 2 + var(--bew-line-height-control) + var(--bew-space-2) +
        var(--bew-space-10) + var(--bew-space-4)
    );
  }
}
.moments-sidebar__card {
  box-sizing: border-box;
  min-width: 0;
  padding: var(--bew-library-filter-padding);
  border-radius: var(--bew-library-filter-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-message-pinned-background);
}
.moments-user-card__profile {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  min-width: 0;
  color: var(--bew-text-1);
  text-decoration: none;
  border-radius: var(--bew-interactive-radius);
  > img {
    width: var(--bew-space-12);
    height: var(--bew-space-12);
    flex: none;
    object-fit: cover;
    border-radius: var(--bew-radius-full);
    corner-shape: var(--bew-corner-shape-round);
  }
  &:hover strong {
    color: var(--bew-theme-foreground);
  }
}
.moments-user-card__identity {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: var(--bew-space-1);
  > strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--bew-font-size-title);
    line-height: var(--bew-line-height-title);
    font-weight: var(--bew-font-weight-medium);
    transition: color var(--bew-duration-fast) var(--bew-ease-standard);
  }
}
.moments-user-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-1);
  em,
  i {
    padding: var(--bew-space-0-5) var(--bew-space-1);
    border-radius: var(--bew-radius-sm);
    font-size: var(--bew-font-size-caption);
    font-weight: var(--bew-font-weight-medium);
    font-style: normal;
    line-height: var(--bew-line-height-caption);
  }
  em {
    background: var(--bew-selected-bg);
    color: var(--bew-text-1);
  }
  i {
    background: var(--bew-fill-1);
    color: var(--bew-text-2);
  }
}
.moments-user-card__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bew-space-1);
  margin-top: var(--bew-space-3);
}
.moments-user-card__stat {
  display: flex;
  align-items: center;
  flex-direction: column;
  min-width: 0;
  gap: var(--bew-space-1);
  padding-block: var(--bew-space-1);
  color: var(--bew-text-1);
  text-decoration: none;
  border-radius: var(--bew-interactive-radius);
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
  strong {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--bew-font-size-heading);
    line-height: var(--bew-line-height-heading);
    font-weight: var(--bew-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  small {
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
  }
  &:hover {
    background: var(--bew-fill-1);
  }
}
.moments-publish-link {
  i {
    flex: none;
    width: var(--bew-control-icon-size);
    height: var(--bew-control-icon-size);
  }
  > :last-child {
    margin-inline-start: auto;
  }
}
.moments-live-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.moments-live-card > header {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  padding-bottom: var(--bew-space-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  strong {
    font-weight: var(--bew-font-weight-semibold);
  }
  > span {
    color: var(--bew-text-2);
    font-variant-numeric: tabular-nums;
  }
}
.moments-live-card__list {
  @include scrollEdgeFade.vertical;
  display: grid;
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  overflow-anchor: none;
  scrollbar-width: thin;
  gap: var(--bew-space-1);
}
.moments-live-card__row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-width: 0;
  min-height: calc(var(--bew-space-10) + var(--bew-space-4));
  padding: var(--bew-space-2) var(--bew-space-1);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-1);
  text-decoration: none;
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
  &:hover {
    background: var(--bew-fill-1);
  }
}
.moments-live-card__info {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: var(--bew-space-1);
  strong,
  small {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  strong {
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
    font-weight: var(--bew-font-weight-medium);
  }
  small {
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
    color: var(--bew-text-2);
  }
}
.moments-sidebar a:focus-visible {
  outline: var(--bew-focus-ring);
  outline-offset: var(--bew-space-0-5);
}
@media (prefers-reduced-motion: reduce) {
  .moments-sidebar a,
  .moments-sidebar strong {
    transition: none;
  }
}
</style>
