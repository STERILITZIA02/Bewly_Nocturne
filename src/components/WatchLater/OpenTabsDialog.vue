<script setup lang="ts">
import { computed, ref } from 'vue'

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
const retryable = computed(() => task.value?.items.some(item => item.status === 'failed'))
</script>

<template>
  <Dialog
    ref="dialog" :title="$t('watch_later.open_tabs.title')" width="550px" max-width="calc(100vw - var(--bew-space-8))" append-to-bewly-body
    :show-footer="false" :show-top-blur="false" @close="emit('close')"
  >
    <div class="open-tabs-dialog">
      <p>{{ $t('watch_later.open_tabs.scope') }}</p>
      <SkeletonBlock v-if="!task && busy" width="100%" height="var(--bew-control-height)" />
      <p v-if="failed" role="alert">
        {{ $t('watch_later.open_tabs.failed_request') }}
      </p>
      <template v-if="task && counts">
        <p role="status" aria-live="polite">
          {{ $t(`watch_later.open_tabs.state_${task.status}`) }}
        </p>
        <p v-if="task.stopReason">
          {{ $t(`watch_later.open_tabs.stop_${task.stopReason}`) }}
        </p>
        <div
          class="open-tabs-dialog__track" role="progressbar" :aria-valuemin="0" :aria-valuemax="counts.total || 1" :aria-valuenow="counts.total - counts.unprocessed"
          :aria-label="$t('watch_later.open_tabs.title')"
        >
          <Progress :percentage="counts.total ? (counts.total - counts.unprocessed) / counts.total * 100 : 0" height="100%" />
        </div>
        <p>{{ $t('watch_later.open_tabs.counts', counts) }}</p>
        <ul class="open-tabs-dialog__items">
          <li v-for="item in task.items" :key="item.tabId">
            <span>{{ item.title }}</span>
            <span class="open-tabs-dialog__result">{{ $t(`watch_later.open_tabs.${item.reason || item.status}`) }}{{ item.message ? `: ${item.message}` : '' }}</span>
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
        <Button v-if="running" type="primary" :disabled="busy" @click="command('stop')">
          {{ $t('watch_later.open_tabs.stop') }}
        </Button>
        <Button v-else-if="task?.status === 'ready'" type="primary" :disabled="busy || !counts?.total" @click="command('start')">
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
  p {
    margin: 0;
  }
  &__track {
    height: var(--bew-space-2);
    background: var(--bew-fill-2);
    border-radius: var(--bew-badge-radius);
    overflow: hidden;
  }
  &__items {
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 35vh;
    overflow: auto;
    overscroll-behavior: contain;
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
  }
  &__actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--bew-space-2);
  }
}
</style>
