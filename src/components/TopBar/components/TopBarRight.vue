<script setup lang="ts">
import { useWindowFocus } from '@vueuse/core'
import { storeToRefs } from 'pinia'

import ALink from '~/components/ALink.vue'
import { settings } from '~/logic'
import { getTopBarItemLayoutEditableId, vLayoutEditable } from '~/logic/layoutEdit'
import { useTopBarStore } from '~/stores/topBarStore'
import { getUserID, isInIframe, removeHttpFromUrl } from '~/utils/main'
import { reportRuntimeFailure } from '~/utils/messaging'
import { isComponentVisible, shouldShowBadge, shouldShowDotBadge, shouldShowNumberBadge } from '~/utils/topBarBadge'

import { resetTopBarTransientInteraction, useTopBarInteraction } from '../composables/useTopBarInteraction'
import { MESSAGE_URL } from '../constants/urls'
import FavoritesPop from './pops/FavoritesPop.vue'
import HistoryPop from './pops/HistoryPop.vue'
import MomentsPop from './pops/MomentsPop.vue'
import MorePop from './pops/MorePop.vue'
import NotificationsPop from './pops/NotificationsPop.vue'
import UploadPop from './pops/UploadPop.vue'
import UserPanelPop from './pops/UserPanelPop.vue'
import WatchLaterPop from './pops/WatchLaterPop.vue'

const emit = defineEmits(['notificationsClick'])

const topBarStore = useTopBarStore()
// 使用 store 中的必要状态
const {
  isLogin,
  userInfo,
  unReadMessage,
  unReadDm,
  newMomentsCount,
  watchLaterCount,
  drawerVisible,
  popupVisible,
  unReadMessageCount,
  hasBCoinToReceive,
} = storeToRefs(topBarStore)

const { invalidateUnreadMessageState, syncMomentsState, syncSharedData, syncUnreadMessageState } = topBarStore

function refreshUnreadMessageSharedState() {
  syncUnreadMessageState().catch((error) => {
    reportRuntimeFailure('Failed to sync shared unread-message state', error)
  })
}

// 将 DOM 引用移到组件内部
const avatarImg = ref<HTMLElement | null>(null)
const avatarShadow = ref<HTMLElement | null>(null)

const {
  getTopBarItemHref,
  handleClickTopBarItem,
  setupTopBarItemHoverEvent,
  setupTopBarItemTransformer,
  shouldOpenConfiguredTopBarItem,
  forceWhiteIcon,
} = useTopBarInteraction()

const mid = computed(() => userInfo.value.mid || getUserID())

// Controllers are created independently of current visibility so hiding and
// later re-enabling an item restores hover/popover behavior without remounting.
const moments = setupTopBarItemHoverEvent('moments')
const favorites = setupTopBarItemHoverEvent('favorites')
const history = setupTopBarItemHoverEvent('history')
const watchLater = setupTopBarItemHoverEvent('watchLater')
const upload = setupTopBarItemHoverEvent('upload')
const notifications = setupTopBarItemHoverEvent('notifications')
const more = setupTopBarItemHoverEvent('more')
const avatar = setupTopBarItemHoverEvent('userPanel')

// 将transformer初始化移到onMounted中
// 声明组件ref
const avatarPopRef = ref()
const notificationsPopRef = ref()
const momentsPopRef = ref()
const favoritesPopRef = ref()
const historyPopRef = ref()
const watchLaterPopRef = ref()
const uploadPopRef = ref()
const morePopRef = ref()

setupTopBarItemTransformer('userPanel', avatarPopRef)
setupTopBarItemTransformer('notifications', notificationsPopRef)
setupTopBarItemTransformer('moments', momentsPopRef)
setupTopBarItemTransformer('favorites', favoritesPopRef)
setupTopBarItemTransformer('history', historyPopRef)
setupTopBarItemTransformer('watchLater', watchLaterPopRef)
setupTopBarItemTransformer('upload', uploadPopRef)
setupTopBarItemTransformer('more', morePopRef)

watch(
  () => popupVisible.value?.notifications ?? false,
  (newVal, oldVal) => {
    if (newVal === undefined || oldVal === undefined)
      return

    if (oldVal !== undefined && MESSAGE_URL.test(location.href))
      return

    if (newVal === oldVal)
      return

    if (!newVal)
      refreshUnreadMessageSharedState()
  },
  { immediate: true },
)

watch(
  () => drawerVisible.value?.notifications ?? false,
  (newVal, oldVal) => {
    if (newVal === oldVal)
      return

    if (!newVal)
      refreshUnreadMessageSharedState()
  },
)

const focused = useWindowFocus()
watch(() => focused.value, (newVal, _) => {
  if (!isLogin.value)
    return

  if (!newVal) {
    if (MESSAGE_URL.test(location.href) && !isInIframe())
      refreshUnreadMessageSharedState()
    return
  }

  syncSharedData().catch((error) => {
    reportRuntimeFailure('Failed to sync shared TopBar state', error)
  })

  nextTick(() => {
    favoritesPopRef.value?.refreshFavoriteData?.()
  })
})

watch(
  () => popupVisible.value?.moments ?? false,
  async (newVal, oldVal) => {
    if (newVal === undefined || oldVal === undefined)
      return

    if (newVal === oldVal)
      return

    // 弹窗关闭时更新
    if (isLogin.value) {
      if (!newVal) {
        await syncMomentsState('video')
      }
      else {
        nextTick(() => {
          if (momentsPopRef.value)
            momentsPopRef.value.initData?.()
        })
      }
    }
  },
)

// 修改通知点击处理
function handleNotificationsClick(item: { name: string, url: string, unreadCount: number, icon: string }) {
  invalidateUnreadMessageState().catch((error) => {
    reportRuntimeFailure('Failed to invalidate unread-message state', error)
  })
  emit('notificationsClick', item)
}

// 判断分割线是否应该显示：左右两组至少各有一个可见时才显示
const shouldShowDivider = computed(() => {
  const leftSideVisible = isComponentVisible('moments')
    || isComponentVisible('favorites')
    || isComponentVisible('history')
    || isComponentVisible('watchLater')
    || isComponentVisible('creatorCenter')

  const rightSideVisible = isComponentVisible('upload')
    || isComponentVisible('notifications')

  return leftSideVisible && rightSideVisible
})
</script>

<template>
  <div
    class="right-side"
    flex="inline xl:1 justify-end items-center"
  >
    <div
      class="others"
      flex="~ items-center gap-1" px-5px
      text="$bew-text-1"
      :style="{ height: 'var(--bew-control-height)' }"
    >
      <div
        v-if="!isLogin"
        class="right-side-item"
        important-w-auto
      >
        <a href="https://passport.bilibili.com/login" class="login">
          <div i-solar:user-circle-bold-duotone class="text-xl mr-2" />{{
            $t('topbar.sign_in')
          }}
        </a>
      </div>
      <template v-if="isLogin">
        <div class="hidden lg:flex" gap-1>
          <!-- Moments -->
          <div
            v-if="isComponentVisible('moments')"
            ref="moments"
            v-layout-editable="getTopBarItemLayoutEditableId('moments')"
            class="right-side-item"
            :data-layout-editable-id="getTopBarItemLayoutEditableId('moments')"
            :class="{ active: popupVisible?.moments }"
            @click="(event: MouseEvent) => handleClickTopBarItem(event, 'moments')"
          >
            <template v-if="newMomentsCount > 0 && shouldShowBadge('moments')">
              <div
                v-if="shouldShowNumberBadge('moments')"
                class="unread-num-dot"
              >
                {{ newMomentsCount > 99 ? '99+' : newMomentsCount }}
              </div>
              <div
                v-else-if="shouldShowDotBadge('moments')"
                class="unread-dot"
              />
            </template>
            <ALink
              class="top-bar-trigger"
              :class="{ 'white-icon': forceWhiteIcon }"
              :href="getTopBarItemHref('moments', 'https://t.bilibili.com')"
              :title="$t('topbar.moments')"
              type="topBar"
              :custom-click-event="!settings.touchScreenOptimization && shouldOpenConfiguredTopBarItem('moments')"
              @click="(event: MouseEvent) => handleClickTopBarItem(event, 'moments')"
            >
              <div i-tabler:windmill />
            </ALink>

            <Transition name="slide-in">
              <MomentsPop
                v-if="popupVisible?.moments"
                ref="momentsPopRef"
                class="bew-popover"
                @click.stop="() => {}"
              />
            </Transition>
          </div>

          <!-- Favorites -->
          <div
            v-if="isComponentVisible('favorites')"
            ref="favorites"
            v-layout-editable="getTopBarItemLayoutEditableId('favorites')"
            class="right-side-item"
            :data-layout-editable-id="getTopBarItemLayoutEditableId('favorites')"
            :class="{ active: popupVisible?.favorites }"
            @click="(event: MouseEvent) => handleClickTopBarItem(event, 'favorites')"
          >
            <ALink
              class="top-bar-trigger"
              :class="{ 'white-icon': forceWhiteIcon }"
              :href="getTopBarItemHref('favorites', `https://space.bilibili.com/${mid}/favlist`)"
              :title="$t('topbar.favorites')"
              type="topBar"
              :custom-click-event="!settings.touchScreenOptimization && shouldOpenConfiguredTopBarItem('favorites')"
              @click="(event: MouseEvent) => handleClickTopBarItem(event, 'favorites')"
            >
              <div i-mingcute:star-line />
            </ALink>

            <Transition name="slide-in">
              <FavoritesPop
                v-if="popupVisible?.favorites"
                ref="favoritesPopRef"
                class="bew-popover"
                @click.stop="() => {}"
              />
            </Transition>
          </div>

          <!-- History -->
          <div
            v-if="isComponentVisible('history')"
            ref="history"
            v-layout-editable="getTopBarItemLayoutEditableId('history')"
            class="right-side-item"
            :data-layout-editable-id="getTopBarItemLayoutEditableId('history')"
            :class="{ active: popupVisible?.history }"
            @click="(event: MouseEvent) => handleClickTopBarItem(event, 'history')"
          >
            <ALink
              class="top-bar-trigger"
              :class="{ 'white-icon': forceWhiteIcon }"
              :href="getTopBarItemHref('history', 'https://www.bilibili.com/history')"
              :title="$t('topbar.history')"
              type="topBar"
              :custom-click-event="!settings.touchScreenOptimization && shouldOpenConfiguredTopBarItem('history')"
              @click="(event: MouseEvent) => handleClickTopBarItem(event, 'history')"
            >
              <div i-mingcute:time-line />
            </ALink>

            <Transition name="slide-in">
              <HistoryPop
                v-if="popupVisible?.history"
                ref="historyPopRef"
                class="bew-popover"
                @click.stop="() => {}"
              />
            </Transition>
          </div>

          <!-- Watch later -->
          <div
            v-if="isComponentVisible('watchLater')"
            ref="watchLater"
            v-layout-editable="getTopBarItemLayoutEditableId('watchLater')"
            class="right-side-item"
            :data-layout-editable-id="getTopBarItemLayoutEditableId('watchLater')"
            :class="{ active: popupVisible?.watchLater }"
            @click="(event: MouseEvent) => handleClickTopBarItem(event, 'watchLater')"
          >
            <template v-if="watchLaterCount > 0 && shouldShowBadge('watchLater')">
              <div
                v-if="shouldShowNumberBadge('watchLater')"
                class="unread-num-dot"
              >
                {{ watchLaterCount > 99 ? '99+' : watchLaterCount }}
              </div>
              <div
                v-else-if="shouldShowDotBadge('watchLater')"
                class="unread-dot"
              />
            </template>
            <ALink
              class="top-bar-trigger"
              :class="{ 'white-icon': forceWhiteIcon }"
              :href="getTopBarItemHref('watchLater', 'https://www.bilibili.com/watchlater/list')"
              :title="$t('topbar.watch_later')"
              type="topBar"
              :custom-click-event="!settings.touchScreenOptimization && shouldOpenConfiguredTopBarItem('watchLater')"
              @click="(event: MouseEvent) => handleClickTopBarItem(event, 'watchLater')"
            >
              <div i-mingcute:carplay-line />
            </ALink>

            <Transition name="slide-in">
              <WatchLaterPop
                v-if="popupVisible?.watchLater"
                ref="watchLaterPopRef"
                class="bew-popover"
                @click.stop="() => {}"
              />
            </Transition>
          </div>

          <!-- Creative center -->
          <div
            v-if="isComponentVisible('creatorCenter')"
            v-layout-editable="getTopBarItemLayoutEditableId('creatorCenter')"
            class="right-side-item"
            :data-layout-editable-id="getTopBarItemLayoutEditableId('creatorCenter')"
          >
            <a
              class="top-bar-trigger"
              :class="{ 'white-icon': forceWhiteIcon }"
              href="https://member.bilibili.com/platform/home"
              target="_blank"
              :title="$t('topbar.creative_center')"
              @click="resetTopBarTransientInteraction"
            >
              <div i-mingcute:bulb-line />
            </a>
          </div>
        </div>

        <!-- More -->
        <div
          ref="more"
          v-layout-editable="'topbar-more'"
          class="right-side-item lg:!hidden flex"
          data-layout-editable-id="topbar-more"
          :class="{ active: popupVisible?.more }"
          @click="(event: MouseEvent) => handleClickTopBarItem(event, 'more')"
        >
          <button
            type="button"
            class="top-bar-icon-button top-bar-trigger"
            :class="{ 'white-icon': forceWhiteIcon }"
            :title="$t('video_card.operation.more_options')"
            :aria-label="$t('video_card.operation.more_options')"
            :aria-expanded="Boolean(popupVisible?.more)"
          >
            <div i-mingcute:menu-line />
          </button>

          <Transition name="slide-in">
            <MorePop
              v-show="popupVisible?.more"
              ref="morePopRef"
              class="bew-popover"
              @click.stop="() => {}"
            />
          </Transition>
        </div>

        <div class="hidden lg:flex" gap-1 items-center>
          <!-- Divider -->
          <div
            v-if="shouldShowDivider"
            :class="{ 'white-icon': forceWhiteIcon }"
            w-2px h-16px bg="$bew-border-color" mx-1
            rounded="$bew-radius-sm"
          />

          <!-- Upload -->
          <div
            v-if="isComponentVisible('upload')"
            ref="upload"
            v-layout-editable="getTopBarItemLayoutEditableId('upload')"
            class="right-side-item"
            :data-layout-editable-id="getTopBarItemLayoutEditableId('upload')"
            :class="{ active: popupVisible?.upload }"
            @click="(event: MouseEvent) => handleClickTopBarItem(event, 'upload')"
          >
            <a
              class="upload top-bar-trigger"
              :class="{ 'white-icon': forceWhiteIcon }"
              style="backdrop-filter: var(--bew-filter-glass-1);"
              href="https://member.bilibili.com/platform/upload/video/frame"
              target="_blank"
              :title="$t('topbar.upload')"
              @click="resetTopBarTransientInteraction"
            >
              <div i-mingcute:upload-line flex-shrink-0 />
            </a>

            <Transition name="slide-in">
              <UploadPop
                v-show="popupVisible?.upload"
                ref="uploadPopRef"
                class="bew-popover"
                @click.stop="() => {}"
              />
            </Transition>
          </div>

          <!-- Notifications -->
          <div
            v-if="isComponentVisible('notifications')"
            ref="notifications"
            v-layout-editable="getTopBarItemLayoutEditableId('notifications')"
            class="right-side-item"
            :data-layout-editable-id="getTopBarItemLayoutEditableId('notifications')"
            :class="{ active: popupVisible?.notifications }"
            @click="(event: MouseEvent) => handleClickTopBarItem(event, 'notifications')"
          >
            <template v-if="unReadMessageCount > 0 && shouldShowBadge('notifications')">
              <div
                v-if="shouldShowNumberBadge('notifications')"
                class="unread-num-dot"
              >
                {{ unReadMessageCount > 99 ? '99+' : unReadMessageCount }}
              </div>
              <div
                v-else-if="shouldShowDotBadge('notifications')"
                class="unread-dot"
              />
            </template>

            <ALink
              class="top-bar-trigger"
              :href="settings.openNotificationsPageAsDrawer ? undefined : 'https://message.bilibili.com'"
              :class="{ 'white-icon': forceWhiteIcon }"
              :title="$t('topbar.notifications')"
              type="topBar"
              :custom-click-event="settings.openNotificationsPageAsDrawer"
              @click="drawerVisible && (drawerVisible.notifications = true)"
            >
              <div i-tabler:bell />
            </ALink>

            <Transition name="slide-in">
              <NotificationsPop
                v-show="popupVisible?.notifications"
                ref="notificationsPopRef"
                class="bew-popover"
                :un-read-message="unReadMessage"
                :un-read-dm="unReadDm"
                @click.stop="() => {}"
                @item-click="handleNotificationsClick"
              />
            </Transition>
          </div>
        </div>
      </template>

      <!-- Avatar -->

      <div
        v-if="isLogin"
        ref="avatar"
        :class="{ hover: popupVisible?.userPanel }"
        class="avatar right-side-item"
        @click="(event: MouseEvent) => handleClickTopBarItem(event, 'userPanel')"
      >
        <!-- B币领取提醒dot -->
        <div
          v-if="hasBCoinToReceive && settings.showBCoinReceiveReminder"
          class="unread-dot avatar-dot"
          :class="{ hover: popupVisible?.userPanel }"
        />

        <ALink
          ref="avatarImg"
          :href="`https://space.bilibili.com/${mid}`"
          type="topBar"
          class="avatar-img top-bar-trigger"
          :class="{ hover: popupVisible?.userPanel }"
          :style="{
            backgroundImage: `url(${userInfo.face ? removeHttpFromUrl(userInfo.face) : ''})`,
          }"
        />
        <div
          ref="avatarShadow"
          class="avatar-shadow"
          :class="{ hover: popupVisible?.userPanel }"
          :style="{
            backgroundImage: `url(${userInfo.face ? removeHttpFromUrl(userInfo.face) : ''})`,
          }"
        />
        <svg
          v-if="userInfo.vip?.status === 1"
          class="vip-img"
          :class="{ hover: popupVisible?.userPanel }"
          :style="{ opacity: popupVisible?.userPanel ? 1 : 0 }"
          bg="[url(https://i0.hdslb.com/bfs/seed/jinkela/short/user-avatar/big-vip.svg)] contain no-repeat"
          w="28%" h="28%" z-1
          pos="absolute bottom-18px right-11px" duration-300
        />

        <Transition name="slide-in">
          <UserPanelPop
            v-if="popupVisible?.userPanel"
            ref="avatarPopRef"
            :user-info="userInfo"
            after:h="!0"
            class="bew-popover"
            @click.stop="() => {}"
          />
        </Transition>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/index.scss";
</style>
