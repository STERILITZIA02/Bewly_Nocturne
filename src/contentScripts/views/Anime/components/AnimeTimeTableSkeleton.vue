<script setup lang="ts">
import HorizontalScrollView from '~/components/HorizontalScrollView.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
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
          <SkeletonBlock width="48px" height="48px" radius="interactive" />
          <SkeletonBlock width="76px" height="var(--bew-line-height-heading)" />
        </div>
        <SkeletonBlock height="var(--bew-space-1)" radius="full" />
        <div class="anime-timetable-skeleton__episodes">
          <div v-for="episode in 3" :key="episode" class="anime-timetable-skeleton__episode">
            <SkeletonBlock width="48px" height="24px" radius="interactive" />
            <div class="anime-timetable-skeleton__episode-content">
              <SkeletonBlock width="72px" height="72px" radius="media" />
              <div>
                <SkeletonBlock width="88px" height="var(--bew-line-height-control)" />
                <SkeletonBlock width="56px" height="var(--bew-line-height-caption)" />
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
  gap: var(--bew-space-3);
}

.anime-timetable-skeleton__heading,
.anime-timetable-skeleton__episode-content,
.anime-timetable-skeleton__episode-content > div {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
}

.anime-timetable-skeleton__heading {
  min-height: 66px;
}

.anime-timetable-skeleton__episodes,
.anime-timetable-skeleton__episode,
.anime-timetable-skeleton__episode-content > div {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
}

.anime-timetable-skeleton__episodes {
  padding: var(--bew-space-3) 0 0 var(--bew-space-3);
  border-left: 2px dashed var(--bew-fill-2);
}

.anime-timetable-skeleton__episode-content > div {
  align-items: flex-start;
  gap: var(--bew-space-2);
}
</style>
