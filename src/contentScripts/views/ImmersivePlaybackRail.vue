<script setup lang="ts">
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { createPlaybackAppHost } from '~/utils/bewlyWidescreen/appHost'
import { playbackRailTabs } from '~/utils/bewlyWidescreen/railTabs'
import { immersiveRail } from '~/utils/immersivePlayback'

const app = useBewlyApp()
const { isDark } = useDark()
const viewport = computed(() => playbackRailTabs.value?.recommendations ?? null)
const mount = shallowRef<HTMLElement>()
watch([viewport, () => immersiveRail.value?.visible && playbackRailTabs.value?.activeTab === 'recommendations'], ([panel, visible], _previous, onCleanup) => {
  if (!panel || !visible)
    return
  const context = createPlaybackAppHost('bewly-immersive-rail')
  panel.append(context.host)
  mount.value = context.mount
  onCleanup(() => {
    mount.value = undefined
    context.dispose()
  })
}, { flush: 'post', immediate: true })
provide('BEWLY_APP', { ...app, scrollViewportRef: viewport })
function select(item: { uniqueId: string }, event: MouseEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
    return
  event.preventDefault()
  immersiveRail.value?.action('select', item.uniqueId)
}
</script>

<template>
  <Teleport v-if="mount && immersiveRail" :to="mount">
    <div v-if="immersiveRail.visible && playbackRailTabs?.activeTab === 'recommendations'" class="bewly-wrapper" :class="{ dark: isDark }">
      <VideoCardGrid
        :items="immersiveRail.window.items"
        grid-layout="oneColumn"
        :persist-state="false"
        :show-preview="false"
        :loading="immersiveRail.window.loading"
        :no-more-content="!immersiveRail.window.hasMore"
        :request-failed="immersiveRail.window.failed"
        :transform-item="item => item.displayData"
        :get-item-key="item => item.uniqueId"
        :card-click-handler="select"
        text-only-states
        @load-more="immersiveRail?.action('more')"
        @refresh="immersiveRail?.action('more')"
      >
        <template #afterCard="{ item }">
          <span v-if="item.uniqueId === immersiveRail.window.currentKey" class="bew-help">{{ $t('settings.immersive_current') }}</span>
        </template>
      </VideoCardGrid>
    </div>
  </Teleport>
</template>
