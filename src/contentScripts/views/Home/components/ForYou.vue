<script setup lang="ts">
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import type { GridLayoutType } from '~/logic'
import type { AppVideoElement, VideoElement } from '~/stores/forYouStore'

import { useForYouRecommendations } from '../useForYouRecommendations'

defineProps<{ gridLayout: GridLayoutType }>()
const emit = defineEmits<{
  (e: 'beforeLoading'): void
  (e: 'afterLoading'): void
}>()
const { currentVideoList, isLoading, noMoreContent, needToLoginFirst, appAuthorizationRequired, requestFailed, recommendationEmptyDescription, isWebRecommendationMode, requiresManualFilteredPaging, retryRecommendation, jumpToLoginPage, handleLoadMore, handleManualLoadMore, handleAppAuthorization, initData, undoRefresh, goForward, canGoBack, canGoForward } = useForYouRecommendations(emit)
defineExpose({ initData, undoRefresh, goForward, canGoBack, canGoForward })
</script>

<template>
  <div>
    <VideoCardGrid
      v-if="!needToLoginFirst && !appAuthorizationRequired"
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
      more-btn
      @refresh="retryRecommendation"
      @login="jumpToLoginPage"
      @load-more="handleLoadMore"
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
