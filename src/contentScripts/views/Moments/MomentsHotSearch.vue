<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'

import ALink from '~/components/ALink.vue'
import Button from '~/components/Button.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { settings } from '~/logic'
import { acquireSearchExperience, loadSharedHotSearch, useSearchExperience } from '~/logic/searchExperience'
import { resolveSearchNavigationTarget } from '~/utils/searchNavigation'

const props = defineProps<{ placeholder?: boolean }>()
const { t } = useI18n()
const { hotSearchList, isLoadingHotSearch, hotSearchFailed } = useSearchExperience()
const release = acquireSearchExperience({ hotSearch: computed(() => !props.placeholder), recommendation: false })
onBeforeUnmount(release)
const items = computed(() => hotSearchList.value
  .filter(item => item && typeof item.keyword === 'string' && item.keyword.trim())
  .slice(0, 10)
  .map(item => ({
    keyword: item.keyword.trim(),
    label: typeof item.show_name === 'string' && item.show_name.trim() ? item.show_name : item.keyword,
    icon: typeof item.icon === 'string' && !item.icon.includes('.gif') ? item.icon : '',
  })))
const loading = computed(() => props.placeholder || isLoadingHotSearch.value)
</script>

<template>
  <section class="moments-hot-search" :class="{ 'moments-hot-search--solid': settings.disableFrostedGlass }" :aria-busy="loading">
    <header class="moments-hot-search__header">
      <h2>{{ t('moments.hot_search_title') }}</h2>
      <i i-tabler:trending-up aria-hidden="true" />
    </header>
    <div v-if="loading && !items.length" class="moments-hot-search__loading" aria-hidden="true">
      <div v-for="index in 10" :key="index" class="moments-hot-search__loading-row">
        <SkeletonBlock width="var(--bew-space-5)" height="var(--bew-line-height-control)" />
        <span><SkeletonBlock :width="index % 3 ? '80%' : '65%'" height="var(--bew-line-height-control)" /></span>
      </div>
    </div>
    <ol v-else-if="items.length" class="moments-hot-search__list">
      <li v-for="(item, index) in items" :key="`${index}:${item.keyword}`">
        <ALink :href="resolveSearchNavigationTarget(item.keyword)" type="searchBar" class="moments-hot-search__item" :title="item.label">
          <span class="moments-hot-search__rank" aria-hidden="true">{{ index + 1 }}</span>
          <span class="moments-hot-search__keyword">{{ item.label }}</span>
          <img
            v-if="item.icon" :src="item.icon" alt="" class="moments-hot-search__badge" loading="lazy"
            decoding="async"
          >
        </ALink>
      </li>
    </ol>
    <div v-else class="moments-hot-search__empty" role="status">
      <p>{{ hotSearchFailed ? t('common.load_failed') : t('search_page.no_hot_search_data') }}</p>
      <Button v-if="hotSearchFailed" type="tertiary" center @click="loadSharedHotSearch(true)">
        {{ t('common.retry') }}
      </Button>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../styles/truncateFade";
@use "../../../styles/sidebarSurface";
@use "../../../styles/scrollEdgeFade";

.moments-hot-search {
  @include sidebarSurface.surface;
  // The card paints the glass, so its list scrolls (and fades) inside it.
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-width: 0;
  max-height: var(--bew-moments-hot-search-max-height);
  overflow: hidden;
  padding: var(--bew-space-4);
  border: 1px solid var(--bew-message-card-border);
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
  color: var(--bew-text-1);
}
.moments-hot-search--solid {
  @include sidebarSurface.solid;
}
.moments-hot-search__header {
  flex: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--bew-space-2);
  margin-bottom: var(--bew-space-3);
  h2 {
    margin: 0;
    font-size: var(--bew-font-size-title);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-title);
  }
  i {
    flex: none;
    width: var(--bew-control-icon-size);
    height: var(--bew-control-icon-size);
    color: var(--bew-text-2);
  }
}
.moments-hot-search__list,
.moments-hot-search__loading {
  @include sidebarSurface.vertical-scroll;
  @include scrollEdgeFade.vertical;
  flex: 1 1 auto;
  min-height: 0;
  scrollbar-width: thin;
  display: grid;
  gap: var(--bew-space-1);
  // A hairline of room keeps focus rings inside the scroll clip.
  margin: calc(-1 * var(--bew-space-0-5));
  padding: var(--bew-space-0-5);
  list-style: none;
  min-width: 0;
}
.moments-hot-search__item {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-height: var(--bew-control-height);
  box-sizing: border-box;
  padding: var(--bew-space-1);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-1);
  text-decoration: none;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
  &:hover {
    background: var(--bew-fill-1);
  }
  &:focus-visible {
    outline: var(--bew-focus-ring);
    outline-offset: var(--bew-space-0-5);
  }
}
.moments-hot-search__loading-row {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-height: var(--bew-control-height);
  padding-inline: var(--bew-space-1);
  > span {
    flex: 1;
    min-width: 0;
  }
}
.moments-hot-search__rank {
  flex: 0 0 var(--bew-space-5);
  color: var(--bew-text-2);
  font-weight: var(--bew-font-weight-semibold);
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.moments-hot-search__list li:nth-child(-n + 3) .moments-hot-search__rank {
  color: var(--bew-text-1);
}
.moments-hot-search__keyword {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  @include truncateFade.lines(2);
}
.moments-hot-search__badge {
  flex: none;
  width: var(--bew-control-icon-size);
  height: var(--bew-control-icon-size);
  object-fit: contain;
}
.moments-hot-search__empty {
  display: grid;
  justify-items: center;
  gap: var(--bew-space-2);
  padding-block: var(--bew-space-4);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  p {
    margin: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .moments-hot-search__item {
    transition: none;
  }
}
</style>
