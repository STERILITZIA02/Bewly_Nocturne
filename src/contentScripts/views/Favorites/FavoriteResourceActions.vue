<script setup lang="ts">
import { useI18n } from 'vue-i18n'

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
  <div class="favorite-resource-actions">
    <button type="button" class="favorite-folder-action" :disabled="pending" :aria-pressed="managing" @click="emit('toggle')">
      <span :class="managing ? 'i-tabler:x' : 'i-tabler:list-check'" />
      {{ t(managing ? 'favorites.sidebar_manage_exit' : 'favorites.batch_manage') }}
    </button>
    <template v-if="managing">
      <button type="button" class="favorite-folder-action" :disabled="!total || pending" :aria-pressed="allSelected" @click="emit('selectAll')">
        <span :class="allSelected ? 'i-tabler:checkbox' : 'i-tabler:square'" />
        {{ t(allSelected ? 'favorites.batch_unselect_all' : 'favorites.batch_select_all') }}
      </button>
      <span class="favorite-resource-actions__count" role="status">{{ t('favorites.batch_selected_count', { count: selectedCount }) }}</span>
      <button type="button" class="favorite-folder-action" :disabled="!selectedCount || !canTransfer || pending" @click="emit('copy')">
        <span i-tabler:copy />{{ t('favorites.batch_copy') }}
      </button>
      <button type="button" class="favorite-folder-action" :disabled="!selectedCount || !canTransfer || pending" @click="emit('move')">
        <span i-tabler:folder-symlink />{{ t('favorites.batch_move') }}
      </button>
      <button type="button" class="favorite-folder-action danger" :disabled="!selectedCount || pending" @click="emit('remove')">
        <span i-tabler:trash />{{ t('favorites.batch_unfavorite') }}
      </button>
    </template>
  </div>
</template>

<style scoped lang="scss">
.favorite-resource-actions {
  display: grid;
  gap: var(--bew-space-2);
  min-width: 0;
}
.favorite-resource-actions__count {
  padding-inline: var(--bew-space-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
</style>
