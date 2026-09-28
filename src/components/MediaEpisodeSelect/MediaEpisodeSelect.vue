<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBewlyApp } from '~/composables/useAppProvider'
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
}>()

const { mainAppRef } = useBewlyApp()
const { t } = useI18n()

const isOpen = ref(false)
const keyboardOpened = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const dropdownId = `bew-episode-menu-${getCurrentInstance()?.uid ?? 0}`
const containerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const {
  position: dropdownPosition,
  scheduleUpdate: schedulePositionUpdate,
  start: startPositionTracking,
  stop: stopPositionTracking,
} = useFloatingMenuPosition(containerRef, dropdownRef, MEDIA_EPISODE_MENU_MAX_HEIGHT)

const normalizedEpisodes = computed(() => {
  return Array.isArray(props.episodes) ? props.episodes.filter(episode => episode.url) : []
})

const hasEpisodes = computed(() => normalizedEpisodes.value.length > 0)

function toggleDropdown(event: MouseEvent) {
  keyboardOpened.value = event.detail === 0
  if (isOpen.value) {
    isOpen.value = false
    return
  }
  startPositionTracking()
  isOpen.value = true
  if (event.detail === 0)
    void focusEpisode(0)
}

function closeDropdown(restoreFocus = false) {
  isOpen.value = false
  if (restoreFocus)
    void nextTick(() => triggerRef.value?.focus({ preventScroll: true }))
}

function handleEpisodeClick() {
  closeDropdown(true)
}

async function focusEpisode(index: number) {
  await nextTick()
  if (!isOpen.value)
    return
  const links = dropdownRef.value?.querySelectorAll<HTMLAnchorElement>('a[href]')
  if (links?.length)
    links[(index + links.length) % links.length]?.focus({ preventScroll: true })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing)
    return
  if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault()
    event.stopPropagation()
    closeDropdown(true)
  }
  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    keyboardOpened.value = true
    if (!isOpen.value) {
      startPositionTracking()
      isOpen.value = true
    }
    const links = Array.from(dropdownRef.value?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])
    const index = links.indexOf(event.target as HTMLAnchorElement)
    void focusEpisode(event.key === 'Home' ? 0 : event.key === 'End' ? -1 : index < 0 ? (event.key === 'ArrowUp' ? -1 : 0) : index + (event.key === 'ArrowDown' ? 1 : -1))
  }
}

function handleFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (!containerRef.value?.contains(next) && !dropdownRef.value?.contains(next))
    closeDropdown()
}

watch(isOpen, async (open, _previous, onCleanup) => {
  if (!open) {
    stopPositionTracking()
    return
  }
  onCleanup(onClickOutside(dropdownRef, () => closeDropdown(), { ignore: [containerRef] }))
  await nextTick()
  if (isOpen.value)
    schedulePositionUpdate()
}, { flush: 'post' })
</script>

<template>
  <div
    v-if="hasEpisodes"
    ref="containerRef"
    class="media-episode-select"
    pos="relative"
    @keydown="handleKeydown"
    @focusout="handleFocusOut"
  >
    <button
      ref="triggerRef"
      type="button"
      :aria-expanded="isOpen"
      :aria-controls="isOpen ? dropdownId : undefined"
      class="select-button"
      :class="{ 'is-open': isOpen }"
      p="x-3 y-2"
      bg="$bew-fill-1"
      rounded="$bew-interactive-radius"
      text="$bew-text-1"
      cursor="pointer"
      flex="~"
      justify="between"
      items="center"
      w="full"
      @click.stop="toggleDropdown"
    >
      <span truncate>{{ t('search.media.select_episode') }}</span>

      <!-- arrow -->
      <i i-mingcute:down-line class="select-arrow" aria-hidden="true" />
    </button>

    <Teleport :to="mainAppRef">
      <Transition :name="dropdownPosition.openUp ? 'dropdown-up' : 'dropdown'" :css="!keyboardOpened">
        <div
          v-if="isOpen"
          :id="dropdownId"
          ref="dropdownRef"
          class="bew-popover-surface"
          role="region"
          :aria-label="t('search.media.select_episode')"
          :style="{
            'top': `${dropdownPosition.top}px`,
            'left': `${dropdownPosition.left}px`,
            'width': `${dropdownPosition.width}px`,
            'maxHeight': `${dropdownPosition.maxHeight}px`,
            'transform': dropdownPosition.openUp ? 'translateY(-100%)' : undefined,
            '--bew-dropdown-origin': dropdownPosition.openUp ? 'bottom center' : 'top center',
          }"
          pos="fixed"
          p="2"
          z="$bew-z-control-menu"
          flex="~ col gap-1"
          w="full"
          overflow-y-overlay
          will-change-transform
          @click.stop
          @keydown="handleKeydown"
          @focusout="handleFocusOut"
        >
          <ALink
            v-for="(episode, index) in normalizedEpisodes"
            :key="episode.id || index"
            :href="episode.url"
            type="videoCard"
            rel="noopener"
            stop-propagation
            class="dropdown-item"
            p="x-2 y-2"
            rounded="$bew-interactive-radius"
            w="full"
            bg="hover:$bew-fill-2"
            transition="background-color duration-200, color duration-200, box-shadow duration-200"
            cursor="pointer"
            :title="episode.longTitle || episode.title"
            @click.capture="handleEpisodeClick"
          >
            <span class="episode-title">{{ episode.title }}</span>
            <span v-if="episode.badge" class="episode-badge">{{ episode.badge }}</span>
          </ALink>
        </div>
      </Transition>

      <!-- 遮罩 外部滚动时关闭下拉菜单 -->
      <div
        v-if="isOpen"
        pos="fixed top-0 left-0"
        w-full
        h-full
        z="$bew-z-control-backdrop"
        @click.stop="closeDropdown()"
      />
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.media-episode-select {
  display: inline-block;
  width: min(100%, var(--bew-media-episode-control-width));
  margin-top: var(--bew-space-3);
}

.select-button {
  min-height: var(--bew-control-height);
  border: 1px solid transparent;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  user-select: none;
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover {
    background: var(--bew-fill-2);
  }
  &.is-open {
    background: var(--bew-control-selected-background);
  }
}

.select-arrow {
  flex: 0 0 auto;
  font-size: var(--bew-control-icon-size);
  transition: transform var(--bew-duration-fast) var(--bew-ease-standard);
}
.is-open .select-arrow {
  transform: rotate(180deg);
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-3);
  color: var(--bew-text-1);
  text-decoration: none;
  min-height: var(--bew-control-height);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);

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
    background: var(--bew-theme-surface-hover);
    color: var(--bew-on-theme-surface);
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
  }
}

@media (prefers-reduced-motion: reduce) {
  .select-button,
  .select-arrow {
    transition: none;
  }
}
</style>
