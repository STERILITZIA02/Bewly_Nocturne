<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { computed, inject, ref } from 'vue'

import BangumiCardSkeleton from '~/components/BangumiCard/BangumiCardSkeleton.vue'
import MomentCardSkeleton from '~/components/MomentCard/MomentCardSkeleton.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import VideoListSkeleton from '~/components/VideoListSkeleton.vue'
import type { BewlyAppProvider } from '~/composables/useAppProvider'
import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { useGridLayout } from '~/composables/useGridLayout'
import AnimeTimeTableSkeleton from '~/contentScripts/views/Anime/components/AnimeTimeTableSkeleton.vue'
import NotificationsPageSkeleton from '~/contentScripts/views/Notifications/components/NotificationsPageSkeleton.vue'
import { AppPage } from '~/enums/appEnums'
import type { GridLayoutType } from '~/logic'
import { gridLayout as savedGridLayout, settings } from '~/logic'
import { MOMENT_GRID_DIMENSIONS, resolveMomentGridColumnCount, shouldShowMomentsSidebar } from '~/utils/momentsLayout'
import { normalizeNotificationRoute } from '~/utils/notificationRoute'

const props = defineProps<{ contentOnly?: boolean, gridLayout?: GridLayoutType }>()
const app = inject<BewlyAppProvider>('BEWLY_APP')
const page = computed(() => app?.activatedPage.value ?? AppPage.Home)
const layout = computed(() => props.gridLayout ?? (page.value === AppPage.Home ? savedGridLayout.value.home : 'adaptive'))
const href = useCurrentLocationHref()
const view = computed(() => normalizeNotificationRoute(href.value).view)
const { gridClass, gridCssVars } = useGridLayout(() => 'adaptive')
const root = ref<HTMLElement>()
const { width } = useElementSize(root)
const momentSidebar = computed(() => shouldShowMomentsSidebar({
  layoutWidth: width.value,
  sidebarWidth: MOMENT_GRID_DIMENSIONS.sidebarWidth,
  gap: MOMENT_GRID_DIMENSIONS.gap,
  minMainWidth: MOMENT_GRID_DIMENSIONS.minCardWidth * 2 + MOMENT_GRID_DIMENSIONS.gap,
  hasContent: settings.value.momentsSidebarShowUserCard || settings.value.momentsSidebarShowPublish || settings.value.momentsSidebarShowLive,
}))
const momentColumns = computed(() => resolveMomentGridColumnCount({
  containerWidth: width.value - (momentSidebar.value ? MOMENT_GRID_DIMENSIONS.sidebarWidth + MOMENT_GRID_DIMENSIONS.gap : 0),
  preferredColumns: Number(settings.value.momentsGridColumns),
  minCardWidth: MOMENT_GRID_DIMENSIONS.minCardWidth,
  gap: MOMENT_GRID_DIMENSIONS.gap,
}))
const emptyItems: never[] = []
</script>

<template>
  <div ref="root" class="bew-page-async-loading" role="status" :aria-label="$t('common.loading')" aria-busy="true">
    <NotificationsPageSkeleton v-if="page === AppPage.Notifications" :label="$t('common.loading')" :view="view" :announce="false" />
    <template v-else>
      <div v-if="!contentOnly && page !== AppPage.Favorites" class="bew-page-async-loading__header" aria-hidden="true">
        <SkeletonBlock width="180px" height="var(--bew-line-height-heading)" />
        <SkeletonBlock width="min(100%, 300px)" height="var(--bew-control-height)" radius="control" />
      </div>
      <div v-if="page === AppPage.Favorites" class="favorites-old-page">
        <main class="favorites-old-main">
          <SkeletonBlock class="favorites-main-heading" width="180px" height="var(--bew-line-height-heading)" />
          <SkeletonBlock class="bew-page-async-loading__toolbar" width="250px" height="var(--bew-control-height)" radius="interactive" />
          <VideoCardGrid
            :items="emptyItems" :transform-item="() => undefined" :get-item-key="(_, index) => index ?? 0" grid-layout="adaptive" :loading="true"
            :persist-state="false" :initial-skeleton-count="12" disable-content-visibility
          />
        </main>
        <aside class="favorites-old-sidebar">
          <div class="favorites-sidebar-panel bew-page-async-loading__sidebar">
            <SkeletonBlock class="bew-page-async-loading__cover" height="auto" radius="media" />
            <SkeletonBlock height="var(--bew-line-height-heading)" />
            <SkeletonBlock v-for="index in 6" :key="index" height="var(--bew-control-height)" radius="interactive" />
          </div>
        </aside>
      </div>
      <VideoListSkeleton v-else-if="page === AppPage.History || (page === AppPage.WatchLater && settings.watchLaterLayoutMode === 'list')" :count="5" :history="page === AppPage.History" :action-count="page === AppPage.WatchLater ? 3 : 1" />
      <div v-else-if="page === AppPage.Anime" class="bew-page-async-loading__anime">
        <AnimeTimeTableSkeleton />
        <div :class="gridClass" :style="gridCssVars">
          <BangumiCardSkeleton v-for="index in 6" :key="index" />
        </div>
      </div>
      <div v-else-if="page === AppPage.Moments" class="bew-page-async-loading__moment-layout">
        <aside v-if="momentSidebar" class="bew-page-async-loading__moment-sidebar">
          <SkeletonBlock height="180px" radius="panel" />
          <SkeletonBlock height="var(--bew-control-height-lg)" radius="interactive" />
          <SkeletonBlock height="240px" radius="panel" />
        </aside>
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
@use "../contentScripts/views/Favorites/favoritesLayout";
.bew-page-async-loading {
  width: 100%;
  min-height: 240px;
  container-type: inline-size;
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
.bew-page-async-loading__moment-sidebar {
  display: grid;
  gap: var(--bew-space-3);
  flex: 0 0 var(--bew-layout-moments-sidebar-width);
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
