<script setup lang="ts">
import Button from '~/components/Button.vue'
import Empty from '~/components/Empty.vue'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import type { GridLayoutType } from '~/logic'
import { getRecommendationRequestIdentity } from '~/logic/recommendationMode'
import type { AppVideoElement, VideoElement } from '~/stores/forYouStore'
import { findImmersiveVideo } from '~/utils/immersiveRecommendation'
import type { ScrollPositionClaim } from '~/utils/scrollIntent'
import { claimScrollPosition } from '~/utils/scrollIntent'

import { useForYouRecommendations } from '../useForYouRecommendations'

defineProps<{ gridLayout: GridLayoutType }>()
const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()
const immersiveOpen = ref(false)
const { currentVideoList, feedGeneration, recommendationDataState, isLoading, noMoreContent, needToLoginFirst, appAuthorizationRequired, requestFailed, recommendationEmptyDescription, isWebRecommendationMode, requiresManualFilteredPaging, retryRecommendation, jumpToLoginPage, handleLoadMore, handleManualLoadMore, handleAppAuthorization, initData, undoRefresh, goForward, canGoBack, canGoForward } = useForYouRecommendations(emit, () => immersiveOpen.value)
const ImmersiveFeed = defineAsyncComponent(() => import('./ImmersiveFeed.vue'))
const root = ref<HTMLElement>()
const immersiveStartIndex = ref(0)
const immersiveTrigger = shallowRef<HTMLElement>()
const immersiveScrollClaim = shallowRef<ScrollPositionClaim>()
const { scrollViewportRef } = useBewlyApp()
function startImmersive(trigger: HTMLElement) {
  const visible = Array.from(root.value?.querySelectorAll<HTMLElement>('[data-index]') ?? [])
    .find((element) => {
      const rect = element.getBoundingClientRect()
      return rect.bottom > 0 && rect.top < window.innerHeight
    })
  const index = findImmersiveVideo(currentVideoList.value, Number(visible?.dataset.index || 0), 1)
  if (index < 0 || needToLoginFirst.value || appAuthorizationRequired.value)
    return
  immersiveStartIndex.value = index
  immersiveScrollClaim.value = scrollViewportRef.value ? claimScrollPosition(scrollViewportRef.value) : undefined
  immersiveTrigger.value = trigger
  immersiveOpen.value = true
}
watch(getRecommendationRequestIdentity, () => immersiveOpen.value = false, { flush: 'sync' })
defineExpose({ initData, undoRefresh, goForward, canGoBack, canGoForward, startImmersive })
</script>

<template>
  <div ref="root">
    <VideoCardGrid
      v-if="!immersiveOpen && !needToLoginFirst && !appAuthorizationRequired"
      :items="currentVideoList"
      :grid-layout="gridLayout"
      :loading="isLoading"
      :no-more-content="noMoreContent"
      :need-to-login-first="needToLoginFirst"
      :request-failed="requestFailed"
      :empty-description="recommendationEmptyDescription"
      :transform-item="(item: VideoElement | AppVideoElement) => item.displayData"
      :get-item-key="(item: VideoElement | AppVideoElement) => item.uniqueId"
      :video-type="isWebRecommendationMode ? 'rcmd' : 'appRcmd'"
      show-preview
      @refresh="retryRecommendation"
      @login="jumpToLoginPage"
      @load-more="handleLoadMore"
    />
    <ImmersiveFeed
      v-if="immersiveOpen"
      :items="currentVideoList"
      :initial-index="immersiveStartIndex"
      :feed-generation="feedGeneration"
      :paging-state="recommendationDataState"
      :manual-paging="requiresManualFilteredPaging"
      :trigger="immersiveTrigger"
      :scroll-claim="immersiveScrollClaim"
      :loading="isLoading"
      :no-more-content="noMoreContent"
      :request-failed="requestFailed"
      @load-more="handleManualLoadMore"
      @close="immersiveOpen = false"
    />

    <div
      v-if="requiresManualFilteredPaging && !isLoading && !noMoreContent"
      class="filtered-feed-load-more"
    >
      <Button type="secondary" @click="handleManualLoadMore()">
        <template #left>
          <span i-tabler-arrow-down />
        </template>
        {{ $t('common.load_more') }}
      </Button>
    </div>

    <Empty v-if="needToLoginFirst" mt-6 :description="$t('common.please_log_in_first')">
      <Button type="primary" @click="jumpToLoginPage()">
        {{ $t('common.login') }}
      </Button>
    </Empty>

    <Empty v-else-if="appAuthorizationRequired" mt-6 :description="$t('home.app_authorization_required')">
      <Button type="primary" @click="handleAppAuthorization">
        {{ $t('home.reauthorize_app') }}
      </Button>
    </Empty>
  </div>
</template>

<style lang="scss" scoped>
.filtered-feed-load-more {
  display: flex;
  justify-content: center;
  padding: var(--bew-space-6) 0 var(--bew-space-4);
}
</style>
