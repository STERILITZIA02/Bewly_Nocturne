<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import { getUserID } from '~/utils/main'

import { useTopBarInteraction } from '../../composables/useTopBarInteraction'

const { t } = useI18n()
const { getTopBarItemHref, handleClickTopBarItem, shouldOpenConfiguredTopBarItem } = useTopBarInteraction()

const list = computed((): { name: string, url: string, icon: string, bewlyKey?: string }[] => [
  { name: t('topbar.notifications'), url: '//message.bilibili.com', icon: 'i-mingcute:notification-line' },
  { name: t('topbar.moments'), url: '//t.bilibili.com/', icon: 'i-tabler:windmill', bewlyKey: 'moments' },
  { name: t('topbar.favorites'), url: `//space.bilibili.com/${getUserID() ?? ''}/favlist`, icon: 'i-mingcute:star-line', bewlyKey: 'favorites' },
  { name: t('topbar.history'), url: '//www.bilibili.com/history', icon: 'i-mingcute:time-line', bewlyKey: 'history' },
  { name: t('topbar.watch_later'), url: '//www.bilibili.com/watchlater/#/list', icon: 'i-mingcute:carplay-line', bewlyKey: 'watchLater' },
  { name: t('topbar.creative_center'), url: '//member.bilibili.com/platform/home', icon: 'i-mingcute:bulb-line' },
])
</script>

<template>
  <div
    class="more-pop bew-popover bew-popover-surface"
    data-key="more"
  >
    <div class="bew-popover__scroll bew-popover__compact-list more-pop__list">
      <ALink
        v-for="item in list"
        :key="item.name"
        :href="item.bewlyKey ? getTopBarItemHref(item.bewlyKey, item.url) : item.url"
        type="topBar"
        class="bew-popover-row more-pop__row"
        :custom-click-event="!!item.bewlyKey && !settings.touchScreenOptimization && shouldOpenConfiguredTopBarItem(item.bewlyKey)"
        @click="item.bewlyKey && handleClickTopBarItem($event, item.bewlyKey)"
      >
        <i :class="item.icon" />
        <span>{{ item.name }}</span>
      </ALink>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.more-pop {
  width: 180px;
  max-height: min(320px, var(--bew-popover-max-height));
}

.more-pop__list {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
}

.more-pop__row {
  gap: var(--bew-space-3);
}

.more-pop__row i {
  flex: 0 0 auto;
  color: var(--bew-text-2);
}
</style>
