<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { computed, inject, ref } from 'vue'

import BangumiCardSkeleton from '~/components/BangumiCard/BangumiCardSkeleton.vue'
import LibraryVideoGridSkeleton from '~/components/LibraryVideoGridSkeleton.vue'
import LibraryWorkspace from '~/components/LibraryWorkspace.vue'
import MomentCardSkeleton from '~/components/MomentCard/MomentCardSkeleton.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import VideoListSkeleton from '~/components/VideoListSkeleton.vue'
import type { BewlyAppProvider } from '~/composables/useAppProvider'
import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { useGridLayout } from '~/composables/useGridLayout'
import AnimeTimeTableSkeleton from '~/contentScripts/views/Anime/components/AnimeTimeTableSkeleton.vue'
import FavoriteSidebarSkeleton from '~/contentScripts/views/Favorites/FavoriteSidebarSkeleton.vue'
import HistoryAdvancedFilters from '~/contentScripts/views/History/HistoryAdvancedFilters.vue'
import { createHistoryFilters } from '~/contentScripts/views/History/historyFilters'
import MomentsContentLayout from '~/contentScripts/views/Moments/MomentsContentLayout.vue'
import MomentsHotSearch from '~/contentScripts/views/Moments/MomentsHotSearch.vue'
import MomentsSidebar from '~/contentScripts/views/Moments/MomentsSidebar.vue'
import NotificationsPageSkeleton from '~/contentScripts/views/Notifications/components/NotificationsPageSkeleton.vue'
import WatchLaterPlayAllCard from '~/contentScripts/views/WatchLater/WatchLaterPlayAllCard.vue'
import { AppPage } from '~/enums/appEnums'
import type { GridLayoutType } from '~/logic'
import { gridLayout as savedGridLayout, settings } from '~/logic'
import { MOMENT_GRID_DIMENSIONS, resolveMomentGridColumnCount } from '~/utils/momentsLayout'
import { normalizeNotificationRoute } from '~/utils/notificationRoute'

const props = defineProps<{ contentOnly?: boolean, gridLayout?: GridLayoutType }>()
const app = inject<BewlyAppProvider>('BEWLY_APP')
const page = computed(() => app?.activatedPage.value ?? AppPage.Home)
const layout = computed(() => props.gridLayout ?? (page.value === AppPage.Home ? savedGridLayout.value.home : 'adaptive'))
const href = useCurrentLocationHref()
const view = computed(() => normalizeNotificationRoute(href.value).view)
const { gridClass, gridCssVars } = useGridLayout(() => 'adaptive')
const root = ref<HTMLElement>()
const momentContent = ref<HTMLElement>()
const { width } = useElementSize(momentContent)
const momentColumns = computed(() => resolveMomentGridColumnCount({
  containerWidth: width.value,
  preferredColumns: Number(settings.value.momentsGridColumns),
  minCardWidth: MOMENT_GRID_DIMENSIONS.minCardWidth,
  gap: MOMENT_GRID_DIMENSIONS.gap,
}))
const emptyItems: never[] = []
const historyFilters = createHistoryFilters()
</script>

<template>
  <div ref="root" class="bew-page-async-loading" role="status" :aria-label="$t('common.loading')" aria-busy="true">
    <NotificationsPageSkeleton v-if="page === AppPage.Notifications" :label="$t('common.loading')" :view="view" :announce="false" />
    <LibraryWorkspace v-else-if="!contentOnly && page === AppPage.Moments" :label="$t('moments.moments')">
      <template #sidebar="{ contentId }">
        <MomentsSidebar model-value="all" :content-id="contentId" loading inert />
      </template>
      <MomentsContentLayout :sidebar-label="$t('moments.hot_search_title')">
        <template #sidebar>
          <MomentsHotSearch placeholder />
        </template>
        <div ref="momentContent" class="bew-page-async-loading__moments-content">
          <div v-if="settings.momentsShowUpList" class="bew-page-async-loading__moments-users" aria-hidden="true">
            <div v-for="index in 10" :key="index">
              <SkeletonBlock width="var(--bew-space-12)" height="var(--bew-space-12)" radius="circle" />
              <SkeletonBlock width="var(--bew-space-12)" height="var(--bew-line-height-caption)" />
            </div>
          </div>
          <div class="bew-page-async-loading__moments" :style="{ gridTemplateColumns: `repeat(${momentColumns}, minmax(0, 1fr))` }">
            <MomentCardSkeleton v-for="index in momentColumns * 2" :key="index" />
          </div>
        </div>
      </MomentsContentLayout>
    </LibraryWorkspace>
    <LibraryWorkspace v-else-if="!contentOnly && [AppPage.Favorites, AppPage.History, AppPage.WatchLater].includes(page)" :label="$t('common.loading')">
      <template #sidebar>
        <div class="library-rail-content" aria-hidden="true">
          <div class="bew-page-async-loading__rail-heading" :class="{ 'bew-page-async-loading__rail-heading--static': page === AppPage.WatchLater, 'bew-page-async-loading__rail-heading--wheel-only': page === AppPage.History || page === AppPage.Favorites }">
            <SkeletonBlock v-if="page !== AppPage.WatchLater" width="32%" height="var(--bew-line-height-control)" />
            <SkeletonBlock :width="page === AppPage.WatchLater ? 'calc(var(--bew-wheel-label-size) * 4)' : '64%'" height="var(--bew-wheel-label-line-height)" />
            <SkeletonBlock v-if="page === AppPage.WatchLater" width="var(--bew-space-10)" height="var(--bew-space-6)" radius="full" />
            <SkeletonBlock v-if="page !== AppPage.WatchLater" width="40%" height="var(--bew-line-height-control)" />
          </div>
          <div class="library-rail-tools">
            <SkeletonBlock height="var(--bew-control-height)" radius="full" />
            <div v-if="page === AppPage.Favorites" class="bew-page-async-loading__favorite-order bew-segment-control--track">
              <SkeletonBlock v-for="index in 3" :key="index" height="var(--bew-control-item-height)" radius="full" />
              <SkeletonBlock width="var(--bew-control-item-height)" height="var(--bew-control-item-height)" radius="circle" />
            </div>
            <div v-if="page === AppPage.WatchLater || page === AppPage.History" class="bew-page-async-loading__watch-toolbar" :class="{ 'bew-page-async-loading__watch-toolbar--sort-only': !settings.enableGridLayoutSwitcher }">
              <div v-if="settings.enableGridLayoutSwitcher" class="bew-page-async-loading__rail-layout bew-segment-control--track">
                <SkeletonBlock v-for="index in 2" :key="index" width="100%" height="var(--bew-control-item-height)" radius="full" />
              </div>
              <SkeletonBlock class="bew-page-async-loading__sort" width="var(--bew-control-height)" height="var(--bew-control-height)" radius="circle" />
            </div>
          </div>
          <div v-if="page === AppPage.WatchLater" class="bew-page-async-loading__advanced">
            <div class="bew-page-async-loading__filter-section">
              <div class="bew-page-async-loading__filter-heading">
                <SkeletonBlock width="45%" height="var(--bew-line-height-control)" />
                <SkeletonBlock width="var(--bew-control-icon-size)" height="var(--bew-space-0-5)" />
              </div>
              <div class="bew-page-async-loading__filter-options">
                <SkeletonBlock v-for="index in 2" :key="index" width="100%" height="var(--bew-control-item-height)" radius="interactive" />
              </div>
            </div>
            <div class="bew-page-async-loading__filter-section">
              <div class="bew-page-async-loading__filter-heading">
                <SkeletonBlock width="45%" height="var(--bew-line-height-control)" />
                <SkeletonBlock width="var(--bew-control-icon-size)" height="var(--bew-space-0-5)" />
              </div>
              <div class="bew-page-async-loading__filter-range">
                <div v-for="index in 2" :key="index">
                  <SkeletonBlock width="50%" height="var(--bew-line-height-caption)" />
                  <SkeletonBlock width="100%" height="var(--bew-control-height)" radius="interactive" />
                </div>
              </div>
            </div>
            <div class="bew-page-async-loading__filter-section">
              <div class="bew-page-async-loading__filter-heading">
                <SkeletonBlock width="45%" height="var(--bew-line-height-control)" />
                <SkeletonBlock width="var(--bew-control-icon-size)" height="var(--bew-space-0-5)" />
              </div>
              <div class="bew-page-async-loading__filter-options">
                <SkeletonBlock
                  v-for="index in 5" :key="index" :style="index === 1 ? { gridColumn: '1 / -1' } : undefined" width="100%" height="var(--bew-control-item-height)"
                  radius="interactive"
                />
              </div>
            </div>
          </div>
          <HistoryAdvancedFilters v-if="page === AppPage.History" :model-value="historyFilters" disabled inert />
          <WatchLaterPlayAllCard v-if="page === AppPage.WatchLater" :items="[]" :total="0" loading disabled />
          <FavoriteSidebarSkeleton v-if="page === AppPage.Favorites" />
          <div v-else class="library-rail-actions">
            <SkeletonBlock
              v-for="index in (page === AppPage.History ? 4 : 5)" :key="index"
              class="library-sidebar-action-skeleton"
              width="calc(100% - var(--bew-sidebar-action-inset) * 2)"
              height="var(--bew-control-height)" radius="full"
            />
          </div>
        </div>
      </template>
      <SkeletonBlock v-if="page === AppPage.Favorites" class="bew-page-async-loading__toolbar" width="180px" height="var(--bew-line-height-heading)" />
      <VideoListSkeleton v-if="(page === AppPage.History && settings.historyLayout === 'list') || (page === AppPage.WatchLater && settings.watchLaterLayoutMode === 'list')" :class="{ 'history-timeline-skeleton': page === AppPage.History }" :count="5" :history="page === AppPage.History" :action-count="page === AppPage.WatchLater ? 3 : 1" />
      <LibraryVideoGridSkeleton v-else-if="page === AppPage.History || page === AppPage.WatchLater" :history="page === AppPage.History" />
      <VideoCardGrid
        v-else :items="emptyItems" :transform-item="() => undefined" :get-item-key="(_, index) => index ?? 0" grid-layout="adaptive"
        :loading="true" :persist-state="false" :initial-skeleton-count="12" disable-content-visibility
      />
    </LibraryWorkspace>
    <template v-else>
      <div v-if="!contentOnly && page !== AppPage.Favorites" class="bew-page-async-loading__header" aria-hidden="true">
        <SkeletonBlock width="180px" height="var(--bew-line-height-heading)" />
        <SkeletonBlock width="min(100%, 300px)" height="var(--bew-control-height)" radius="control" />
      </div>
      <VideoListSkeleton v-if="(page === AppPage.History && settings.historyLayout === 'list') || (page === AppPage.WatchLater && settings.watchLaterLayoutMode === 'list')" :class="{ 'history-timeline-skeleton': page === AppPage.History }" :count="5" :history="page === AppPage.History" :action-count="page === AppPage.WatchLater ? 3 : 1" />
      <LibraryVideoGridSkeleton v-else-if="page === AppPage.History || page === AppPage.WatchLater" :history="page === AppPage.History" />
      <div v-else-if="page === AppPage.Anime" class="bew-page-async-loading__anime">
        <AnimeTimeTableSkeleton />
        <div :class="gridClass" :style="gridCssVars">
          <BangumiCardSkeleton v-for="index in 6" :key="index" />
        </div>
      </div>
      <div v-else-if="page === AppPage.Moments" ref="momentContent" class="bew-page-async-loading__moment-layout">
        <div class="bew-page-async-loading__moments" :style="{ gridTemplateColumns: `repeat(${momentColumns}, minmax(0, 1fr))` }">
          <MomentCardSkeleton v-for="index in momentColumns * 2" :key="index" />
        </div>
      </div>
      <VideoCardGrid
        v-else :items="emptyItems" :transform-item="() => undefined" :get-item-key="(_, index) => index ?? 0" :grid-layout="layout"
        :loading="true" :persist-state="false" :initial-skeleton-count="12" disable-content-visibility
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
@use "../contentScripts/views/History/historyTimeline";

.bew-page-async-loading__favorite-order {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) var(--bew-control-item-height);
  align-items: center;
  gap: var(--bew-control-gap);
  height: var(--bew-control-height);
  padding: var(--bew-control-padding);
  box-sizing: border-box;
}
.bew-page-async-loading__rail-heading {
  box-sizing: border-box;
  display: grid;
  align-content: center;
  gap: var(--bew-space-1);
  height: var(--bew-sidebar-heading-height);
  margin-inline: calc(-1 * var(--bew-sidebar-inline-padding));
  padding: 0 calc(var(--bew-sidebar-inline-padding) + var(--bew-sidebar-label-inset)) var(--bew-space-2);
}
.bew-page-async-loading__rail-heading--static {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  padding-inline-end: var(--bew-space-3);
}
.bew-page-async-loading__rail-heading--wheel-only {
  padding-block-start: 0;
}
.bew-page-async-loading__advanced {
  display: grid;
  gap: var(--bew-space-3);
  padding: var(--bew-library-filter-padding);
  background: var(--bew-message-pinned-background);
  border-radius: var(--bew-library-filter-radius);
  corner-shape: var(--bew-corner-shape);
  container-type: inline-size;
}
.bew-page-async-loading__filter-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bew-control-gap);
}
.bew-page-async-loading__filter-section {
  display: grid;
  gap: var(--bew-space-2);
  + .bew-page-async-loading__filter-section {
    padding-top: var(--bew-space-3);
    border-top: 1px solid var(--bew-message-card-border);
  }
}
.bew-page-async-loading__filter-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--bew-control-item-height);
}
.bew-page-async-loading__filter-range {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bew-space-2);
  > div {
    display: grid;
    gap: var(--bew-space-1);
  }
}
@container (max-width: 240px) {
  .bew-page-async-loading__filter-range {
    grid-template-columns: minmax(0, 1fr);
  }
}
.bew-page-async-loading__watch-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 60%) minmax(0, 1fr);
  align-items: center;
  .bew-page-async-loading__rail-layout {
    grid-column: 2;
  }
}
.bew-page-async-loading__sort {
  grid-column: 3;
  margin-inline-start: var(--bew-space-1);
}
.bew-page-async-loading__watch-toolbar--sort-only .bew-page-async-loading__sort {
  grid-column: 2;
  justify-self: center;
  margin: 0;
}
.bew-page-async-loading__rail-layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bew-control-gap);
  padding: var(--bew-control-padding);
}
.bew-page-async-loading {
  width: 100%;
  min-height: 240px;
  container-type: inline-size;
}

.bew-page-async-loading:has(> .library-workspace) {
  container-type: normal;
}
.bew-page-async-loading__header {
  display: grid;
  gap: var(--bew-space-6);
  margin-bottom: var(--bew-space-6);
}
.bew-page-async-loading__moments {
  display: grid;
  gap: var(--bew-space-4);
}
.bew-page-async-loading__moment-layout {
  display: flex;
  gap: var(--bew-space-4);
  align-items: start;
}
.bew-page-async-loading__moment-layout > .bew-page-async-loading__moments {
  flex: 1;
  min-width: 0;
}
.bew-page-async-loading__moments-content {
  display: grid;
  min-width: 0;
  gap: var(--bew-space-4);
}
.bew-page-async-loading__moments-users {
  display: flex;
  gap: var(--bew-space-4);
  padding: var(--bew-space-3);
  overflow: hidden;
  border-radius: var(--bew-panel-radius);
  border: 1px solid var(--bew-surface-border-color);
  > div {
    display: grid;
    flex: none;
    gap: var(--bew-space-1);
  }
}
.bew-page-async-loading__toolbar {
  margin-bottom: var(--bew-space-3);
}
.bew-page-async-loading__sidebar {
  display: grid;
  align-content: start;
  gap: var(--bew-space-4);
  padding: var(--bew-space-6);
  box-sizing: border-box;
}
.bew-page-async-loading__cover {
  aspect-ratio: 16 / 9;
}
.bew-page-async-loading__anime {
  display: grid;
  gap: var(--bew-space-6);
}
</style>
