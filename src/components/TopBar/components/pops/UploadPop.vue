<script setup>
import { useI18n } from 'vue-i18n'

import { resetTopBarTransientInteraction } from '~/components/TopBar/composables/useTopBarInteraction'

const { t } = useI18n()

const list = computed(() => {
  return [
    {
      name: t('topbar.upload_dropdown.article'),
      url: 'https://member.bilibili.com/platform/upload/text/apply',
      icon: 'i-tabler:file-plus',
    },
    {
      name: t('topbar.upload_dropdown.music'),
      url: 'https://member.bilibili.com/platform/upload/audio/frame',
      icon: 'i-tabler:music',
    },
    {
      name: t('topbar.upload_dropdown.sticker'),
      url: 'https://member.bilibili.com/platform/upload/sticker',
      icon: 'i-tabler:sticker',
    },
    {
      name: t('topbar.upload_dropdown.video'),
      url: 'https://member.bilibili.com/platform/upload/video/frame',
      icon: 'i-tabler:video',
    },
    {
      name: t('topbar.upload_dropdown.manager'),
      url: 'https://member.bilibili.com/platform/upload-manager/article',
      icon: 'i-tabler:video',
    },
  ]
})
</script>

<template>
  <div
    class="upload-pop bew-popover bew-popover-surface"
    data-key="upload"
  >
    <div class="bew-popover__scroll bew-popover__compact-list upload-pop__list">
      <a
        v-for="item in list"
        :key="item.url"
        class="upload-item bew-popover-row"
        :href="item.url"
        target="_blank"
        @click="resetTopBarTransientInteraction"
      >
        <i :class="item.icon" />
        <span>{{ item.name }}</span>
      </a>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.upload-pop {
  min-width: 160px;
  max-height: min(320px, var(--bew-popover-max-height));
}

.upload-pop__list {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
}

.upload-item {
  gap: var(--bew-space-2);
  white-space: nowrap;
}

.upload-item i {
  flex: 0 0 auto;
  color: var(--bew-text-2);
}
</style>
