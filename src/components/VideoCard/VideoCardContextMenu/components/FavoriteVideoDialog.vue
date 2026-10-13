<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import Dialog from '~/components/Dialog.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import type { Video } from '~/components/VideoCard/types'
import { useBewlyApp } from '~/composables/useAppProvider'
import { AppPage } from '~/enums/appEnums'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'
import { createVideoFavoriteSelection } from '~/utils/videoFavoriteSelection'

const props = defineProps<{ video: Video }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const store = useTopBarStore()
const { getDockPageHref } = useBewlyApp()
const managementUrl = computed(() => getDockPageHref(AppPage.Favorites))
const dialog = ref<InstanceType<typeof Dialog>>()
const account = computed(() => {
  const id = resolveAuthenticatedAccountId(store.isLogin, store.userInfo.mid)
  return id !== null && String(id) === getUserID() ? id : null
})
const selection = createVideoFavoriteSelection({ ...props.video }, {
  account: () => account.value !== null && getUserID() === String(account.value) ? account.value : null,
  csrf: getCSRF,
  resolveAid: async (bvid, signal) => {
    const response = await api.video.getVideoInfo({ bvid }, { signal })
    return response.code === 0 ? response.data?.aid : undefined
  },
  read: (rid, mid, signal) => api.favorite.getFavoriteCategories({ up_mid: String(mid), rid, type: 2 }, { signal }),
  write: data => api.favorite.updateVideoFavorites(data),
  changed: () => store.notifyFavoritesChanged(),
})
const { folders, selected, loading, saving, loaded, error, editable, needsVerification } = selection
watch(account, () => dialog.value?.close())
onMounted(selection.load)
onBeforeUnmount(selection.close)
async function save() {
  if (await selection.save())
    dialog.value?.close()
}
</script>

<template>
  <Dialog
    ref="dialog" :title="t('video_card.operation.favorite')" width="var(--bew-dialog-compact-width)" :show-footer="false"
    :loading="saving" :show-loading-overlay="false" :prevent-close-when-loading="false" :close-on-confirm="false"
    append-to-bewly-body @before-close="selection.close" @close="emit('close')" @confirm="save"
  >
    <div class="favorite-video-selection">
      <p class="favorite-video-selection__title">
        {{ video.title }}
      </p>
      <div v-if="loading && !loaded" class="favorite-video-selection__folders" :aria-label="t('common.loading')">
        <SkeletonBlock v-for="index in 3" :key="index" height="var(--bew-control-height)" radius="interactive" />
      </div>
      <p v-if="error" role="alert">
        {{ t(`video_card.favorite_dialog.${error}`) }}
      </p>
      <Button v-if="error" type="secondary" :disabled="loading || saving" @click="selection.load">
        {{ t('common.operation.refresh') }}
      </Button>
      <div v-if="loaded && folders.length" class="favorite-video-selection__folders">
        <label v-for="folder in folders" :key="folder.id" class="favorite-video-selection__folder">
          <input
            type="checkbox" :checked="selected.includes(folder.id)"
            :disabled="!editable || (!selected.includes(folder.id) && folder.fav_state !== 1 && selection.full(folder))"
            @change="selection.toggle(folder)"
          >
          <span>{{ folder.title }}</span><small>{{ folder.media_count }}</small>
        </label>
      </div>
      <p v-else-if="loaded" class="favorite-video-selection__empty">
        {{ t('video_card.favorite_dialog.empty') }}
      </p>
      <a v-if="loaded && !folders.length" :href="managementUrl" target="_blank" rel="noopener noreferrer">{{ t('dock.favorites') }}</a>
      <div class="favorite-video-selection__actions">
        <Button type="tertiary" @click="dialog?.close()">
          {{ t('common.operation.cancel') }}
        </Button>
        <Button type="primary" :disabled="!editable || needsVerification || !folders.length" @click="save">
          {{ t('common.operation.confirm') }}
        </Button>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.favorite-video-selection {
  display: grid;
  gap: var(--bew-space-3);
  &__title {
    overflow-wrap: anywhere;
    font-weight: var(--bew-font-weight-medium);
  }
  &__folders {
    display: grid;
    gap: var(--bew-space-1);
    max-height: 40dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  &__folder {
    display: flex;
    align-items: center;
    gap: var(--bew-space-3);
    padding: var(--bew-space-3);
    border-radius: var(--bew-interactive-radius);
    cursor: pointer;
    &:hover {
      background: var(--bew-fill-1);
    }
    &:has(input:checked) {
      background: var(--bew-theme-surface);
      color: var(--bew-on-theme-surface);
    }
    &:has(input:disabled) {
      cursor: default;
    }
    input {
      flex: none;
      width: var(--bew-space-6);
      height: var(--bew-space-6);
      accent-color: var(--bew-theme-color);
    }
    span {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    small {
      color: var(--bew-text-2);
      font-size: var(--bew-font-size-caption);
    }
  }
  &__empty {
    text-align: center;
    padding: var(--bew-space-6);
  }
  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--bew-space-2);
  }
}
</style>
