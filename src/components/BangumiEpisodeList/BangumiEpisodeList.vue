<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { computed, ref } from 'vue'

interface Episode {
  id: string
  title: string
  longTitle?: string
  url?: string
  badge?: string
  number?: number
}

const props = defineProps<{
  episodes: Episode[]
}>()

interface EpisodeEntry {
  type: 'episode'
  key: string
  number: number
  title: string
  longTitle?: string
  url: string
}

interface EllipsisEntry {
  type: 'ellipsis'
  key: string
}

type Entry = EpisodeEntry | EllipsisEntry

const containerRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)

useResizeObserver(containerRef, (entries) => {
  const entry = entries[0]
  containerWidth.value = entry.contentRect.width
})

const BUTTON_BASE_WIDTH = 44
const BUTTON_GAP = 8
const MIN_BUTTONS = 6
const DEFAULT_MAX_BUTTONS = 12

const normalizedEpisodes = computed(() => Array.isArray(props.episodes) ? props.episodes : [])

const episodeMap = computed(() => {
  const map = new Map<number, Episode>()
  normalizedEpisodes.value.forEach((episode, index) => {
    if (!episode.url)
      return
    const resolvedNumber = resolveEpisodeNumber(episode, index)
    if (resolvedNumber && !map.has(resolvedNumber))
      map.set(resolvedNumber, episode)
  })
  return map
})

const maxVisibleButtons = computed(() => {
  const width = containerWidth.value
  if (!width || !Number.isFinite(width))
    return DEFAULT_MAX_BUTTONS

  const estimated = Math.floor((width + BUTTON_GAP) / (BUTTON_BASE_WIDTH + BUTTON_GAP))
  return Math.min(Math.max(estimated, MIN_BUTTONS), DEFAULT_MAX_BUTTONS)
})

const entries = computed<Entry[]>(() => {
  const numbers = [...episodeMap.value.keys()].sort((a, b) => a - b)
  const limit = Math.max(maxVisibleButtons.value, MIN_BUTTONS)
  if (numbers.length <= limit)
    return numbers.map(createEpisodeEntry)
  return [
    ...numbers.slice(0, limit - 2).map(createEpisodeEntry),
    { type: 'ellipsis', key: 'ellipsis' },
    createEpisodeEntry(numbers[numbers.length - 1]),
  ]
})

function resolveEpisodeNumber(episode: Episode, index: number): number | undefined {
  if (typeof episode.number === 'number' && Number.isFinite(episode.number) && episode.number > 0)
    return Math.round(episode.number)

  const match = episode.title.match(/(\d+)/)
  if (match) {
    const parsed = Number.parseInt(match[1], 10)
    if (Number.isFinite(parsed) && parsed > 0)
      return parsed
  }

  return index + 1
}

function createEpisodeEntry(number: number): EpisodeEntry {
  const episode = episodeMap.value.get(number)!
  return {
    type: 'episode',
    key: `episode-${number}`,
    number,
    title: episode.title,
    longTitle: episode.longTitle,
    url: episode.url!,
  }
}
</script>

<template>
  <div
    v-if="entries.length"
    ref="containerRef"
    class="bangumi-episode-buttons"
  >
    <template v-for="entry in entries" :key="entry.key">
      <ALink
        v-if="entry.type === 'episode'"
        :href="entry.url"
        type="videoCard"
        rel="noopener"
        stop-propagation
        class="episode-button"
        :title="entry.longTitle || entry.title"
      >
        {{ entry.number }}
      </ALink>
      <span
        v-else
        class="episode-ellipsis"
      >
        …
      </span>
    </template>
  </div>
</template>

<style scoped lang="scss">
.bangumi-episode-buttons {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-3);
}

.episode-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  background: var(--bew-fill-1);
  color: var(--bew-text-1);
  text-decoration: none;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  border: 1px solid transparent;
  transition:
    background-color var(--bew-duration-normal) var(--bew-ease-standard),
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    color var(--bew-duration-normal) var(--bew-ease-standard);

  &:hover {
    background: var(--bew-fill-2);
  }
}

.episode-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--bew-control-height);
  height: var(--bew-control-height);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-title);
}
</style>
