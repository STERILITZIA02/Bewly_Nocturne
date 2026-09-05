<script setup lang="ts">
import type { Ref } from 'vue'

import { settings } from '~/logic'

const scrollListWrap = ref<HTMLElement>() as Ref<HTMLElement>
const showScrollMask = ref<boolean>(true)

watch([() => settings.value.enableHorizontalScrolling, scrollListWrap], ([enabled, element], _previous, onCleanup) => {
  if (!enabled || !element)
    return

  element.addEventListener('wheel', handleMouseScroll, { passive: false })
  onCleanup(() => element.removeEventListener('wheel', handleMouseScroll))
})

function handleMouseScroll(event: WheelEvent) {
  const element = event.currentTarget as HTMLElement
  if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))
    return
  const maxScrollLeft = element.scrollWidth - element.clientWidth
  if (maxScrollLeft <= 0 || event.deltaY === 0
    || (event.deltaY < 0 && element.scrollLeft <= 0)
    || (event.deltaY > 0 && element.scrollLeft >= maxScrollLeft)) {
    return
  }

  event.preventDefault()
  element.scrollLeft += event.deltaY
}
</script>

<template>
  <div relative>
    <div
      ref="scrollListWrap"
      w="[calc(100%+80px)]"
      h="[calc(100%+40px)]"
      m="x--40px y--20px" p="x-40px y-20px"
      overflow-x-scroll
      overflow-y-hidden
      relative
      :class="{ 'scroll-mask': showScrollMask }"
    >
      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.scroll-mask {
  mask-image: linear-gradient(to right, transparent 0, black 40px, black calc(100% - 40px), transparent 100%);
  -webkit-mask-image: linear-gradient(to right, transparent 0, black 40px, black calc(100% - 40px), transparent 100%);
}
</style>
