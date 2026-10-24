<script setup lang="ts">
import Button from '~/components/Button.vue'
import Empty from '~/components/Empty.vue'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import type { GridLayoutType } from '~/logic'
import { settings } from '~/logic'
import { getRecommendationRequestIdentity } from '~/logic/recommendationMode'
import type { AppVideoElement, VideoElement } from '~/stores/forYouStore'
import { findImmersiveVideo } from '~/utils/immersiveRecommendation'

import { useForYouRecommendations } from '../useForYouRecommendations'

defineProps<{ gridLayout: GridLayoutType }>()
const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()
const { currentVideoList, isLoading, noMoreContent, needToLoginFirst, appAuthorizationRequired, requestFailed, recommendationEmptyDescription, isWebRecommendationMode, requiresManualFilteredPaging, retryRecommendation, jumpToLoginPage, handleLoadMore, handleManualLoadMore, handleAppAuthorization, initData, undoRefresh, goForward, canGoBack, canGoForward } = useForYouRecommendations(emit)
const ImmersiveFeed = defineAsyncComponent(() => import('./ImmersiveFeed.vue'))
const root = ref<HTMLElement>()
const immersiveOpen = ref(false)
const immersiveStartIndex = ref(0)
const immersiveTrigger = shallowRef<HTMLElement>()
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
  immersiveTrigger.value = trigger
  immersiveOpen.value = true
}
watch([getRecommendationRequestIdentity, () => settings.value.showImmersiveModeEntry], () => immersiveOpen.value = false, { flush: 'sync' })
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
      :trigger="immersiveTrigger"
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
      <Button type="secondary" @click="handleManualLoadMore">
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
