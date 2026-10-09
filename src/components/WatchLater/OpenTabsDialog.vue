<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import Button from '~/components/Button.vue'
import Dialog from '~/components/Dialog.vue'
import Progress from '~/components/Progress.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { useOpenTabsWatchLater } from '~/composables/useOpenTabsWatchLater'
import { countOpenTabsTask } from '~/constants/openTabsWatchLater'

const emit = defineEmits<{ close: [] }>()
const dialog = ref<InstanceType<typeof Dialog>>()
const { task, busy, failed, command } = useOpenTabsWatchLater()
const counts = computed(() => task.value ? countOpenTabsTask(task.value) : null)
const running = computed(() => task.value?.status === 'running')
const ready = computed(() => task.value?.status === 'ready')
const retryable = computed(() => task.value?.items.some(item => item.status === 'failed'))
const selectedTabIds = ref<number[]>([])
watch(() => task.value?.id, () => {
  selectedTabIds.value = task.value?.status === 'ready' ? task.value.items.map(item => item.tabId) : []
}, { immediate: true })
const allSelected = computed(() => Boolean(task.value?.items.length) && selectedTabIds.value.length === task.value?.items.length)
function toggleAll() {
  selectedTabIds.value = allSelected.value ? [] : task.value?.items.map(item => item.tabId) ?? []
}
</script>

<template>
  <Dialog
    ref="dialog" :title="$t('watch_later.open_tabs.title')" width="550px" max-width="calc(100vw - var(--bew-space-8))" append-to-bewly-body
    :show-footer="false" :show-top-blur="false" @close="emit('close')"
  >
    <div class="open-tabs-dialog">
      <SkeletonBlock v-if="!task && busy" width="100%" height="var(--bew-control-height)" />
      <p v-if="failed" role="alert">
        {{ $t('watch_later.open_tabs.failed_request') }}
      </p>
      <template v-if="task && counts">
        <p class="open-tabs-dialog__lead" role="status" aria-live="polite">
          {{ $t(`watch_later.open_tabs.state_${task.status}`, { count: counts.total, windows: $t(`watch_later.open_tabs.windows_${task.incognito ? 'private' : 'normal'}`) }) }}
        </p>
        <p class="open-tabs-dialog__hint">
          {{ $t('watch_later.open_tabs.scope') }}
        </p>
        <p v-if="running" class="open-tabs-dialog__hint">
          {{ $t('watch_later.open_tabs.background_hint') }}
        </p>
        <p v-if="task.stopReason">
          {{ $t(`watch_later.open_tabs.stop_${task.stopReason}`) }}
        </p>
        <div
          v-if="!ready && counts.total"
          class="open-tabs-dialog__track" role="progressbar" :aria-valuemin="0" :aria-valuemax="counts.total || 1" :aria-valuenow="counts.total - counts.unprocessed"
          :aria-label="$t('watch_later.open_tabs.title')"
        >
          <Progress :percentage="counts.total ? (counts.total - counts.unprocessed) / counts.total * 100 : 0" height="100%" />
        </div>
        <p v-if="!ready">
          {{ $t('watch_later.open_tabs.counts', counts) }}
        </p>
        <div v-if="ready" class="open-tabs-dialog__selection">
          <Button type="tertiary" :disabled="busy" @click="toggleAll">
            {{ $t(allSelected ? 'favorites.unselect_all' : 'favorites.select_all') }}
          </Button>
          <span role="status">{{ $t('library_tools.selected_tabs', { count: selectedTabIds.length, total: counts.total }) }}</span>
        </div>
        <ul class="open-tabs-dialog__items">
          <li v-for="item in task.items" :key="item.tabId">
            <label v-if="ready" class="open-tabs-dialog__choice">
              <input v-model="selectedTabIds" type="checkbox" :value="item.tabId" :disabled="busy">
              <span>{{ item.title }}</span>
            </label>
            <span v-else>{{ item.title }}</span>
            <span v-if="!ready || item.reason" class="open-tabs-dialog__result">{{ $t(`watch_later.open_tabs.${item.reason || item.status}`) }}{{ item.message ? `: ${item.message}` : '' }}</span>
          </li>
        </ul>
      </template>
      <div class="open-tabs-dialog__actions">
        <Button type="tertiary" @click="dialog?.close()">
          {{ $t('common.close') }}
        </Button>
        <Button v-if="failed" type="secondary" :disabled="busy" @click="command('get')">
          {{ $t('common.operation.refresh') }}
        </Button>
        <Button v-if="ready && !failed" type="tertiary" :disabled="busy" @click="command('prepare')">
          {{ $t('watch_later.open_tabs.prepare') }}
        </Button>
        <Button v-if="running" type="primary" :disabled="busy" @click="command('stop')">
          {{ $t('watch_later.open_tabs.stop') }}
        </Button>
        <Button v-else-if="task?.status === 'ready'" type="primary" :disabled="busy || !selectedTabIds.length" @click="command('start', selectedTabIds)">
          {{ $t('watch_later.open_tabs.confirm') }}
        </Button>
        <template v-else-if="task">
          <Button v-if="retryable" type="secondary" :disabled="busy" @click="command('retry')">
            {{ $t('watch_later.open_tabs.retry') }}
          </Button>
          <Button type="secondary" :disabled="busy" @click="command('prepare')">
            {{ $t('watch_later.open_tabs.prepare') }}
          </Button>
        </template>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.open-tabs-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-4);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
  p {
    margin: 0;
  }
  &__selection,
  &__choice {
    display: flex;
    align-items: center;
    gap: var(--bew-space-2);
  }
  &__selection {
    justify-content: space-between;
  }
  &__choice {
    width: 100%;
    min-width: 0;
    min-height: var(--bew-control-height);
    cursor: pointer;
    span {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    input {
      accent-color: var(--bew-theme-color);
      flex: none;
    }
  }
  &__lead {
    color: var(--bew-text-1);
    font-size: var(--bew-font-size-title);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-title);
  }
  &__hint {
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
  }
  &__track {
    height: var(--bew-space-2);
    background: var(--bew-fill-2);
    border-radius: var(--bew-badge-radius);
    overflow: hidden;
  }
  &__items {
    margin: 0;
    padding: var(--bew-space-3);
    list-style: none;
    max-height: 35vh;
    overflow: auto;
    overscroll-behavior: contain;
    background: var(--bew-content-solid);
    border-radius: var(--bew-card-radius);
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: var(--bew-space-3);
    padding-block: var(--bew-space-2);
  }
  li > span:first-child {
    overflow-wrap: anywhere;
    min-width: 0;
  }
  &__result {
    color: var(--bew-text-2);
    flex-shrink: 0;
    max-width: 45%;
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
    text-align: right;
  }
  &__actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--bew-space-2);
  }
}
</style>
