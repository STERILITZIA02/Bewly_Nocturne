<script setup lang="ts">
import { useEventListener, useResizeObserver } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import HorizontalScrollView from '~/components/HorizontalScrollView.vue'
import type { Result as TimetableItem, TimetableResult } from '~/models/anime/timeTable'
import api from '~/utils/api'
import { removeHttpFromUrl } from '~/utils/main'
import { reportRuntimeFailure } from '~/utils/messaging'

import AnimeTimeTableSkeleton from './AnimeTimeTableSkeleton.vue'

const { t } = useI18n()
const animeTimeTable = reactive<TimetableItem[]>([])
const isLoading = ref(true)
const requestFailed = ref(false)
const animeTimeTableWrap = ref<HTMLElement | null>(null)
const scrollViewRef = ref<InstanceType<typeof HorizontalScrollView> | null>(null)
const scrollViewport = computed(() => scrollViewRef.value?.getScrollElement() ?? null)
const atStart = ref(true)
const atEnd = ref(true)
const hasToday = computed(() => animeTimeTable.some(day => day.is_today))
let mounted = false
let requestGeneration = 0

function updateScrollBounds() {
  const viewport = scrollViewport.value
  atStart.value = !viewport || viewport.scrollLeft <= 1
  atEnd.value = !viewport || viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft <= 1
}
useEventListener(scrollViewport, 'scroll', updateScrollBounds, { passive: true })
useResizeObserver(scrollViewport, updateScrollBounds)

function scrollHorizontally(left: number, behavior: ScrollBehavior) {
  scrollViewport.value?.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : behavior })
}
function scrollToToday(behavior: ScrollBehavior = 'smooth') {
  const viewport = scrollViewport.value
  const today = animeTimeTableWrap.value?.querySelector<HTMLElement>('[data-today="true"]')
  if (!viewport || !today)
    return
  const bounds = today.getBoundingClientRect()
  const left = viewport.scrollLeft + bounds.left - viewport.getBoundingClientRect().left - (viewport.clientWidth - bounds.width) / 2
  scrollHorizontally(Math.max(0, left), behavior)
  updateScrollBounds()
}
function scrollDay(direction: number) {
  const viewport = scrollViewport.value
  const column = animeTimeTableWrap.value?.firstElementChild
  if (viewport && column)
    scrollHorizontally(viewport.scrollLeft + direction * column.getBoundingClientRect().width, 'smooth')
}

const daysOfTheWeekList = computed(() => {
  return [
    t('anime.anime_timetable.days_of_week.mon'),
    t('anime.anime_timetable.days_of_week.tue'),
    t('anime.anime_timetable.days_of_week.wed'),
    t('anime.anime_timetable.days_of_week.thu'),
    t('anime.anime_timetable.days_of_week.fri'),
    t('anime.anime_timetable.days_of_week.sat'),
    t('anime.anime_timetable.days_of_week.sun'),
  ]
})

onMounted(() => {
  mounted = true
  void getAnimeTimeTable()
})
onScopeDispose(() => {
  mounted = false
  requestGeneration++
})

function refreshAnimeTimeTable() {
  void getAnimeTimeTable()
}

async function getAnimeTimeTable() {
  const generation = ++requestGeneration
  const isCurrent = () => mounted && generation === requestGeneration
  const revealToday = animeTimeTable.length === 0
  isLoading.value = true
  requestFailed.value = false
  try {
    const res: TimetableResult = await api.anime.getAnimeTimeTable()
    if (!isCurrent())
      return
    const { code, result } = res
    if (code === 0 && Array.isArray(result)) {
      animeTimeTable.splice(0, animeTimeTable.length, ...result)
      await nextTick()
      if (isCurrent()) {
        if (revealToday)
          scrollToToday('auto')
        else
          updateScrollBounds()
      }
    }
    else {
      requestFailed.value = true
    }
  }
  catch (error) {
    if (isCurrent())
      requestFailed.value = reportRuntimeFailure('Failed to load anime timetable', error)
  }
  finally {
    if (isCurrent())
      isLoading.value = false
  }
}

defineExpose({ refreshAnimeTimeTable })
</script>

<template>
  <div>
    <AnimeTimeTableSkeleton v-if="isLoading && !animeTimeTable.length" :today-index="animeTimeTable.findIndex(day => day.is_today)" />
    <Empty v-else-if="requestFailed && !animeTimeTable.length" :description="t('common.load_failed')">
      <Button type="tertiary" @click="refreshAnimeTimeTable">
        {{ t('common.operation.refresh') }}
      </Button>
    </Empty>
    <template v-else>
      <div class="anime-timetable__navigation">
        <span v-if="requestFailed" role="status">{{ t('common.load_failed') }}</span>
        <Button v-if="requestFailed" type="tertiary" @click="refreshAnimeTimeTable">
          {{ t('common.operation.refresh') }}
        </Button>
        <Button type="tertiary" :disabled="!hasToday" @click="scrollToToday()">
          {{ t('anime.anime_timetable.today') }}
        </Button>
        <IconButton :label="t('anime.anime_timetable.previous_day')" class="anime-timetable__arrow" :disabled="atStart" @click="scrollDay(-1)">
          <i i-mingcute:left-line />
        </IconButton>
        <IconButton :label="t('anime.anime_timetable.next_day')" class="anime-timetable__arrow" :disabled="atEnd" @click="scrollDay(1)">
          <i i-mingcute:right-line />
        </IconButton>
      </div>
      <HorizontalScrollView ref="scrollViewRef">
        <ul ref="animeTimeTableWrap" flex="~">
          <li
            v-for="item in animeTimeTable"
            :key="item.date_ts"
            :data-today="item.is_today ? 'true' : undefined"
            class="anime-timetable__column"
            w="1/1 sm:1/2 md:1/4 lg:1/5 xl:1/6 2xl:1/7"
            p="x-2 b-8"
            shrink-0
            :bg="item.is_today ? '!$bew-theme-surface' : ''"
            hover:bg="$bew-fill-1"
          >
            <header class="anime-timetable__heading">
              <h4 class="anime-timetable__day">
                {{ daysOfTheWeekList[item.day_of_week - 1] }}
              </h4>
              <span>{{ item.date }}</span>
            </header>
            <span
              block
              w-full
              h-4px
              :bg="item.is_today ? '$bew-theme-color' : '$bew-fill-3'"
              rounded-full
            />
            <ul
              grid
              gap-4
              :border-l="`~ 2px dashed ${
                item.is_today ? '$bew-theme-surface' : '$bew-fill-2'
              }`"
              p="t-3 l-3"
            >
              <li v-for="episode in item.episodes" :key="episode.season_id">
                <div
                  p="x-2 y-1"
                  w="[fit-content]"
                  mb-2
                  rounded="$bew-radius-half"
                  :color="item.is_today ? '$bew-on-theme-surface' : '$bew-text-3'"
                  :bg="item.is_today ? '$bew-theme-surface' : '$bew-fill-1'"
                  relative
                  grid
                  place-items-center
                >
                  <i
                    class="bew-shape-circle"
                    pos="absolute left--3"
                    w-2
                    h-2
                    rounded-full
                    :bg="item.is_today ? '$bew-theme-color' : '$bew-fill-3'"
                    transform="~ translate-x-[calc(-0.25rem-1px)]"
                  />
                  {{ episode.pub_time }}
                </div>

                <div flex gap-4>
                  <a
                    :href="`//www.bilibili.com/bangumi/play/ss${episode.season_id}`"
                    target="_blank" tabindex="-1"
                    shrink-0
                  >
                    <img
                      :src="`${removeHttpFromUrl(
                        episode.square_cover,
                      )}@80w_80h.webp`"
                      :alt="episode.title"
                      w-18
                      aspect="square"
                      rounded="$bew-radius-half"
                    >
                  </a>
                  <div flex="~ col">
                    <a
                      :href="`//www.bilibili.com/bangumi/play/ss${episode.season_id}`"
                      target="_blank"
                    >{{ episode.title }}</a>
                    <p mt-auto text="$bew-theme-foreground">
                      {{ episode.pub_index }}
                    </p>
                  </div>
                </div>
              </li>
            </ul>
          </li>
        </ul>
      </HorizontalScrollView>
    </template>
  </div>
</template>

<style scoped lang="scss">
.anime-timetable__day {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-heading);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-heading);
}
.anime-timetable__heading {
  display: flex;
  align-items: baseline;
  gap: var(--bew-space-2);
  min-height: var(--bew-space-12);
  padding-block: var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}
.anime-timetable__column {
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);
}
.anime-timetable__navigation {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--bew-space-2);
  margin-bottom: var(--bew-space-6);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}
.anime-timetable__arrow {
  width: var(--bew-control-height);
  height: var(--bew-control-height);
  font-size: var(--bew-control-icon-size);
  &:hover:not(:disabled) {
    background: var(--bew-fill-1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .anime-timetable__column {
    transition: none;
  }
}
</style>
