<script setup lang="ts">
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'

import SettingsSectionHeading from './SettingsSectionHeading.vue'

export interface CategoryPage {
  value: string
  titleKey: string
  descriptionKey?: string
  icon: string
  iconActivated: string
  component: Component
  groupKey?: string
  warning?: boolean
  badgeKey?: string
}

const props = defineProps<{
  pages: CategoryPage[]
  storageKey: string
  navigationPage?: string
  navigationRequestId?: number
}>()

const { t } = useI18n()
const scrollSettingsContentToTop = inject<() => void>('scrollSettingsContentToTop')
// The window header shows the open page as the last step of its path.
const setSettingsPageTitle = inject<(title?: string) => void>('setSettingsPageTitle')
const savedPage = sessionStorage.getItem(props.storageKey)
const activePage = ref(
  props.pages.some(page => page.value === savedPage)
    ? savedPage!
    : props.pages[0]?.value ?? '',
)

const currentPage = computed(() =>
  props.pages.find(page => page.value === activePage.value) ?? props.pages[0],
)

const pageGroups = computed(() => {
  const groups: Array<{ key: string | null, pages: CategoryPage[] }> = []

  for (const page of props.pages) {
    const groupKey = page.groupKey ?? null
    const lastGroup = groups[groups.length - 1]
    if (!lastGroup || lastGroup.key !== groupKey) {
      groups.push({ key: groupKey, pages: [page] })
      continue
    }
    lastGroup.pages.push(page)
  }

  return groups
})

watch(activePage, page => sessionStorage.setItem(props.storageKey, page), { immediate: true, flush: 'sync' })
watchEffect(() => setSettingsPageTitle?.(currentPage.value && t(currentPage.value.titleKey)))
watch(
  () => [props.navigationRequestId, props.navigationPage] as const,
  ([, page]) => {
    if (page && props.pages.some(candidate => candidate.value === page))
      activePage.value = page
  },
  { immediate: true },
)

function selectPage(page: string) {
  if (page === activePage.value)
    return

  scrollSettingsContentToTop?.()
  activePage.value = page
}

function handlePageMouseDown(event: MouseEvent) {
  // Keep keyboard focus, but prevent the browser from scrolling the focused
  // secondary-nav item into view (can nudge the settings panel upward).
  if (event.button !== 0)
    return

  event.preventDefault()
  if (event.currentTarget instanceof HTMLElement)
    event.currentTarget.focus({ preventScroll: true })
}
</script>

<template>
  <!-- The category's pages as a column of their own between the categories
       and the page, divided from the page by a hairline (user-specified). -->
  <div class="settings-category-layout">
    <nav class="settings-category-nav" :aria-label="$t('settings.category_navigation')">
      <div
        v-for="(group, groupIndex) in pageGroups"
        :key="group.key ?? `ungrouped-${groupIndex}`"
        class="settings-category-group"
      >
        <div v-if="group.key" class="settings-category-group-label bew-section-label">
          {{ $t(group.key) }}
        </div>
        <button
          v-for="page in group.pages"
          :key="page.value"
          type="button"
          class="settings-category-button"
          :class="{ active: activePage === page.value }"
          :aria-current="activePage === page.value ? 'page' : undefined"
          @mousedown="handlePageMouseDown"
          @click="selectPage(page.value)"
        >
          <span
            class="settings-nav-icon"
            :class="activePage === page.value ? page.iconActivated : page.icon"
            aria-hidden="true"
          />
          <span class="settings-nav-label">{{ $t(page.titleKey) }}</span>
        </button>
      </div>
    </nav>

    <section v-if="currentPage" class="settings-category-content">
      <SettingsSectionHeading
        :title="$t(currentPage.titleKey)"
        :desc="currentPage.descriptionKey ? $t(currentPage.descriptionKey) : undefined"
        :warning="currentPage.warning"
        :badge="currentPage.badgeKey ? $t(currentPage.badgeKey) : undefined"
      />
      <Component :is="currentPage.component" :key="currentPage.value" />
    </section>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/settingsNav";

.settings-category-layout {
  --settings-category-nav-width: 192px;
  display: grid;
  grid-template-columns: var(--settings-category-nav-width) minmax(0, 1fr);
  align-items: start;
  overflow-anchor: none;
}

// Pinned in the page's scroller and exactly as tall as it (the scroller is a
// size container), so its hairline runs the full height and a long list
// scrolls on its own.
.settings-category-nav {
  @include settingsNav.column;
  @include settingsNav.scroller;
  position: sticky;
  top: 0;
  height: 100cqh;
  gap: var(--bew-space-4);
}

.settings-category-group {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
}

.settings-category-group-label {
  @include settingsNav.group-label;
}

.settings-category-button {
  @include settingsNav.row(".active");
}

.settings-category-content {
  box-sizing: border-box;
  min-width: 0;
  max-width: calc(var(--settings-content-max-width) + var(--bew-space-8) * 2);
  padding: var(--settings-content-padding);
}

// Too narrow for two columns: the pages wrap above the page instead, ruled
// off from it.
@container settings-viewport (max-width: 520px) {
  .settings-category-layout {
    display: block;
  }

  .settings-category-nav {
    position: static;
    flex-flow: row wrap;
    height: auto;
    gap: var(--bew-space-1);
    overflow: visible;
    border-inline-end: 0;
    border-bottom: var(--bew-hairline) solid var(--bew-separator-color);
  }

  .settings-category-group {
    display: contents;
  }

  .settings-category-group-label {
    display: none;
  }

  .settings-category-button {
    width: auto;
  }
}
</style>
