<script setup lang="ts">
import HorizontalScrollView from '~/components/HorizontalScrollView.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'

withDefaults(defineProps<{ todayIndex?: number }>(), { todayIndex: -1 })
</script>

<template>
  <HorizontalScrollView aria-hidden="true">
    <div class="anime-timetable-skeleton">
      <article
        v-for="index in 7"
        :key="index"
        class="anime-timetable-skeleton__day"
        w="1/1 sm:1/2 md:1/4 lg:1/5 xl:1/6 2xl:1/7"
        p="x-2 b-8"
        shrink-0
      >
        <div class="anime-timetable-skeleton__heading">
          <SkeletonBlock :width="index - 1 === todayIndex ? '50px' : '38px'" :height="index - 1 === todayIndex ? '48px' : '36px'" radius="interactive" />
          <SkeletonBlock width="76px" height="var(--bew-line-height-heading)" />
        </div>
        <SkeletonBlock height="var(--bew-space-1)" radius="full" />
        <div class="anime-timetable-skeleton__episodes">
          <div v-for="episode in 3" :key="episode" class="anime-timetable-skeleton__episode">
            <span class="anime-timetable-skeleton__time" data-bew-skeleton>00:00</span>
            <div class="anime-timetable-skeleton__episode-content">
              <SkeletonBlock width="72px" height="72px" radius="half" />
              <div>
                <SkeletonBlock width="88px" height="var(--bew-line-height-body)" />
                <SkeletonBlock width="56px" height="var(--bew-line-height-body)" />
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>
  </HorizontalScrollView>
</template>

<style scoped lang="scss">
.anime-timetable-skeleton {
  display: flex;
}

.anime-timetable-skeleton__day {
  display: flex;
  box-sizing: border-box;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 0;
}

.anime-timetable-skeleton__heading,
.anime-timetable-skeleton__episode-content,
.anime-timetable-skeleton__episode-content > div {
  display: flex;
  align-items: stretch;
  gap: var(--bew-space-4);
}

.anime-timetable-skeleton__heading {
  min-height: 66px;
  align-items: flex-end;
  margin-bottom: var(--bew-space-3);
}

.anime-timetable-skeleton__episodes,
.anime-timetable-skeleton__episode,
.anime-timetable-skeleton__episode-content > div {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.anime-timetable-skeleton__episodes {
  gap: var(--bew-space-4);
  padding: var(--bew-space-3) 0 0 var(--bew-space-3);
  border-left: 2px dashed var(--bew-fill-2);
}

.anime-timetable-skeleton__episode-content > div {
  align-items: flex-start;
  gap: 0;
}
.anime-timetable-skeleton__episode-content > div > :last-child {
  margin-top: auto;
}
.anime-timetable-skeleton__time {
  align-self: flex-start;
  padding: var(--bew-space-1) var(--bew-space-2);
  color: transparent;
  border-radius: var(--bew-radius-half);
}
</style>
