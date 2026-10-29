<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import IconButton from '~/components/IconButton.vue'
import Tooltip from '~/components/Tooltip.vue'

/**
 * Batch management in the open folder card's action row: one icon to enter;
 * while managing, the selected count and icons for select all, copy, move,
 * unfavourite and exit share the row (no full-width buttons).
 */
defineProps<{
  managing: boolean
  pending: boolean
  total: number
  selectedCount: number
  allSelected: boolean
  canTransfer: boolean
}>()
const emit = defineEmits<{ toggle: [], selectAll: [], copy: [], move: [], remove: [] }>()
const { t } = useI18n()
</script>

<template>
  <template v-if="managing">
    <span class="favorite-resource-actions__count" role="status">{{ t('favorites.batch_selected_count', { count: selectedCount }) }}</span>
    <Tooltip :content="t(allSelected ? 'favorites.batch_unselect_all' : 'favorites.batch_select_all')" placement="top">
      <IconButton
        class="bew-icon-button--control favorite-folder-icon-action" shape="smooth-rect" :label="t(allSelected ? 'favorites.batch_unselect_all' : 'favorites.batch_select_all')"
        :aria-pressed="allSelected" :disabled="!total || pending" @click="emit('selectAll')"
      >
        <i :class="allSelected ? 'i-tabler:checkbox' : 'i-tabler:square'" />
      </IconButton>
    </Tooltip>
    <Tooltip :content="t('favorites.batch_copy')" placement="top">
      <IconButton class="bew-icon-button--control favorite-folder-icon-action" shape="smooth-rect" :label="t('favorites.batch_copy')" :disabled="!selectedCount || !canTransfer || pending" @click="emit('copy')">
        <i i-tabler:copy />
      </IconButton>
    </Tooltip>
    <Tooltip :content="t('favorites.batch_move')" placement="top">
      <IconButton class="bew-icon-button--control favorite-folder-icon-action" shape="smooth-rect" :label="t('favorites.batch_move')" :disabled="!selectedCount || !canTransfer || pending" @click="emit('move')">
        <i i-tabler:folder-symlink />
      </IconButton>
    </Tooltip>
    <Tooltip :content="t('favorites.batch_unfavorite')" placement="top">
      <IconButton class="bew-icon-button--control favorite-folder-icon-action danger" shape="smooth-rect" :label="t('favorites.batch_unfavorite')" :disabled="!selectedCount || pending" @click="emit('remove')">
        <i i-tabler:trash />
      </IconButton>
    </Tooltip>
  </template>
  <Tooltip :content="t(managing ? 'favorites.sidebar_manage_exit' : 'favorites.batch_manage')" placement="top">
    <IconButton
      class="bew-icon-button--control favorite-folder-icon-action" shape="smooth-rect" :label="t(managing ? 'favorites.sidebar_manage_exit' : 'favorites.batch_manage')"
      :aria-pressed="managing" :disabled="pending" @click="emit('toggle')"
    >
      <i :class="managing ? 'i-tabler:x' : 'i-tabler:list-check'" />
    </IconButton>
  </Tooltip>
</template>

<style scoped lang="scss">
.favorite-resource-actions__count {
  flex: 1;
  min-width: 0;
  padding-inline: var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  font-family: var(--bew-fonts-monospace);
  font-variant-numeric: tabular-nums;
}
</style>
