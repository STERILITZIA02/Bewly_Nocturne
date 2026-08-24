<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { useFloatingMenuPosition } from '~/composables/useFloatingMenuPosition'
import { MEDIA_EPISODE_MENU_MAX_HEIGHT } from '~/constants/layout'

interface Episode {
  id: string
  title: string
  longTitle?: string
  url?: string
  badge?: string
}

const props = defineProps<{
  episodes: Episode[]
  fallbackUrl?: string
}>()

const { mainAppRef } = useBewlyApp()
const currentLocationHref = useCurrentLocationHref()
const { t } = useI18n()

const isOpen = ref(false)
const containerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const {
  position: dropdownPosition,
  scheduleUpdate: schedulePositionUpdate,
  start: startPositionTracking,
  stop: stopPositionTracking,
} = useFloatingMenuPosition(containerRef, dropdownRef, MEDIA_EPISODE_MENU_MAX_HEIGHT)

const normalizedEpisodes = computed(() => {
  return Array.isArray(props.episodes) ? props.episodes : []
})

const hasEpisodes = computed(() => normalizedEpisodes.value.length > 0)

const defaultLabel = computed(() => {
  const currentUrl = new URL(currentLocationHref.value)
  const currentEpisode = normalizedEpisodes.value.find((episode) => {
    if (!episode.url)
      return false
    const episodeUrl = new URL(episode.url, currentUrl)
    return episodeUrl.pathname === currentUrl.pathname
      && episodeUrl.searchParams.get('p') === currentUrl.searchParams.get('p')
  })
  if (currentEpisode)
    return currentEpisode.title
  if (normalizedEpisodes.value.length > 0)
    return normalizedEpisodes.value[0].title
  return t('search.media.select_episode')
})

function toggleDropdown() {
  if (isOpen.value) {
    isOpen.value = false
    return
  }
  startPositionTracking()
  isOpen.value = true
}

function closeDropdown() {
  isOpen.value = false
}

function handleEpisodeClick() {
  closeDropdown()
}

/** when you click on it outside, the selection option will be turned off  */
function onMouseLeave() {
  window.addEventListener('click', closeDropdown)
}

function onMouseEnter() {
  window.removeEventListener('click', closeDropdown)
}

onBeforeUnmount(() => window.removeEventListener('click', closeDropdown))

watch(isOpen, async (open) => {
  if (!open) {
    stopPositionTracking()
    return
  }
  await nextTick()
  schedulePositionUpdate()
}, { flush: 'post' })
</script>

<template>
  <div
    v-if="hasEpisodes"
    ref="containerRef"
    class="media-episode-select"
    pos="relative"
    @mouseleave="onMouseLeave"
    @mouseenter="onMouseEnter"
  >
    <button
      class="select-button"
      p="x-4 y-2"
      bg="$bew-fill-1"
      rounded="$bew-interactive-radius"
      text="$bew-text-1"
      cursor="pointer"
      flex="~"
      justify="between"
      items="center"
      w="full"
      :ring="isOpen ? '2px $bew-theme-color' : ''"
      duration-300
      @click.stop="toggleDropdown"
    >
      <span truncate>{{ defaultLabel }}</span>

      <!-- arrow -->
      <div
        border="~ solid t-0 l-0 r-2 b-2"
        :border-color="isOpen ? '$bew-theme-color' : '$bew-fill-4'"
        p="3px"
        m="l-2"
        display="inline-block"
        :transform="`~ ${!isOpen ? 'rotate-45 -translate-y-1/4' : 'rotate-225 translate-y-1/4'} `"
        transition="background-color duration-200, color duration-200, box-shadow duration-200"
      />
    </button>

    <Teleport :to="mainAppRef">
      <Transition :name="dropdownPosition.openUp ? 'dropdown-up' : 'dropdown'">
        <div
          v-if="isOpen"
          ref="dropdownRef"
          class="bew-popover-surface"
          :style="{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            maxHeight: `${dropdownPosition.maxHeight}px`,
            transform: dropdownPosition.openUp ? 'translateY(-100%)' : undefined,
          }"
          pos="fixed"
          p="2"
          z="$bew-z-control-menu"
          flex="~ col gap-1"
          w="full"
          overflow-y-overlay
          will-change-transform
          @click.stop
        >
          <a
            v-for="(episode, index) in normalizedEpisodes"
            :key="episode.id || index"
            :href="episode.url || fallbackUrl"
            target="_blank"
            rel="noopener"
            class="dropdown-item"
            p="x-2 y-2"
            rounded="$bew-interactive-radius"
            w="full"
            bg="hover:$bew-fill-2"
            transition="background-color duration-200, color duration-200, box-shadow duration-200"
            cursor="pointer"
            :title="episode.longTitle || episode.title"
            @click.stop="handleEpisodeClick"
          >
            <span class="episode-title">{{ episode.title }}</span>
            <span v-if="episode.badge" class="episode-badge">{{ episode.badge }}</span>
          </a>
        </div>
      </Transition>

      <!-- 遮罩 外部滚动时关闭下拉菜单 -->
      <div
        v-if="isOpen"
        pos="fixed top-0 left-0"
        w-full
        h-full
        z="$bew-z-control-backdrop"
      />
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.media-episode-select {
  display: inline-block;
  margin-top: var(--bew-space-3);
}

.select-button {
  min-height: var(--bew-control-height);
  border: 1px solid transparent;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  user-select: none;

  &:hover {
    background: var(--bew-fill-2);
  }
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-3);
  color: var(--bew-text-1);
  text-decoration: none;
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);

  .episode-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .episode-badge {
    flex-shrink: 0;
    padding: var(--bew-space-0-5) var(--bew-space-2);
    border-radius: var(--bew-badge-radius);
    corner-shape: var(--bew-corner-shape-round);
    background: var(--bew-theme-color-20);
    color: var(--bew-theme-foreground);
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
  }
}

.dropdown-up-enter-active,
.dropdown-up-leave-active {
  transition:
    opacity 300ms ease,
    translate 300ms ease,
    filter 300ms ease;
}

.dropdown-up-enter-from,
.dropdown-up-leave-to {
  opacity: 0;
  translate: 0 12px;
  filter: blur(4px);
}
</style>
