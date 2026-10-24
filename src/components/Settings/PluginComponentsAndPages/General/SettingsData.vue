<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Button from '~/components/Button.vue'
import Dialog from '~/components/Dialog.vue'
import Radio from '~/components/Radio.vue'
import { useSettingsCloudSyncPreference } from '~/composables/useSettingsCloudSyncPreference'
import { useStorageLocal } from '~/composables/useStorageLocal'
import { sendMessage } from '~/utils/messaging'
import type {
  SettingsCloudSyncAvailability,
  SettingsCloudSyncEnableRequest,
  SettingsCloudSyncEnableResponse,
  SettingsCloudSyncMode,
} from '~/utils/settingsCloudSyncProtocol'
import {
  DEFAULT_SETTINGS_CLOUD_SYNC_STATUS,
  resolveSettingsCloudSyncEnableDecision,
  SETTINGS_CLOUD_SYNC_AVAILABILITY_MESSAGE,
  SETTINGS_CLOUD_SYNC_ENABLE_MESSAGE,
  SETTINGS_CLOUD_SYNC_STATUS_KEY,
} from '~/utils/settingsCloudSyncProtocol'

import Maintenance from '../../Advanced/Maintenance.vue'
import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const { t } = useI18n()
const toast = useToast()
interface DialogExpose {
  close: () => void
}

const settingsCloudSyncPreference = useSettingsCloudSyncPreference()
const cloudSyncDialogRef = ref<DialogExpose | null>(null)
const cloudSyncControlRevision = ref(0)
const cloudSyncAvailabilityError = ref<'incompatible' | 'failed' | ''>('')
const showCloudSyncConflictDialog = ref(false)
const cloudSyncRequestPending = ref(false)
const settingsCloudSyncStatus = useStorageLocal(
  SETTINGS_CLOUD_SYNC_STATUS_KEY,
  DEFAULT_SETTINGS_CLOUD_SYNC_STATUS,
  { mergeDefaults: true, writeDefaults: false },
)
const unsyncedCloudFieldCount = computed(() => settingsCloudSyncStatus.value.pendingCount
  + settingsCloudSyncStatus.value.blockedByQuotaCount
  + settingsCloudSyncStatus.value.failedCount)

watch(settingsCloudSyncPreference, (enabled) => {
  cloudSyncControlRevision.value++
  if (enabled)
    cloudSyncDialogRef.value?.close()
})
function isCloudSyncAvailability(value: unknown): value is SettingsCloudSyncAvailability {
  if (!value || typeof value !== 'object')
    return false
  const state = (value as { state?: unknown }).state
  return state === 'empty' || state === 'compatible' || state === 'incompatible'
}

function isCloudSyncEnableResponse(value: unknown): value is SettingsCloudSyncEnableResponse {
  if (!value || typeof value !== 'object')
    return false
  const response = value as Partial<SettingsCloudSyncEnableResponse>
  return response.ok === true
    || (response.ok === false
      && (response.reason === 'conflict'
        || response.reason === 'incompatible'
        || response.reason === 'initialization-failed'))
}

async function enableSettingsCloudSync(mode: SettingsCloudSyncMode) {
  if (cloudSyncRequestPending.value)
    return

  cloudSyncRequestPending.value = true
  try {
    const request: SettingsCloudSyncEnableRequest = {
      mode,
      expectedState: mode === 'auto' ? 'empty' : 'compatible',
    }
    const response = await sendMessage<SettingsCloudSyncEnableRequest, SettingsCloudSyncEnableResponse>(
      SETTINGS_CLOUD_SYNC_ENABLE_MESSAGE,
      request,
    )
    if (!isCloudSyncEnableResponse(response))
      throw new TypeError('Invalid cloud sync enable response')
    if (response.ok) {
      cloudSyncAvailabilityError.value = ''
      cloudSyncRequestPending.value = false
      await nextTick()
      cloudSyncDialogRef.value?.close()
      return
    }

    if (response.reason === 'incompatible') {
      cloudSyncAvailabilityError.value = 'incompatible'
      toast.error(t('settings.sync_cloud_incompatible'))
    }
    else if (response.reason === 'conflict') {
      cloudSyncAvailabilityError.value = 'failed'
      toast.warning(t('settings.sync_cloud_status_failed'))
    }
    else {
      cloudSyncAvailabilityError.value = 'failed'
      toast.error(t('settings.sync_cloud_enable_failed'))
    }
  }
  catch (error) {
    cloudSyncAvailabilityError.value = 'failed'
    console.error('Failed to enable settings cloud sync:', error)
    toast.error(t('settings.sync_cloud_enable_failed'))
  }
  finally {
    cloudSyncRequestPending.value = false
  }
}

async function handleSettingsCloudSyncToggle(nextValue: boolean) {
  // Radio's native checkbox toggles before this async controlled flow resolves.
  // Remount immediately so its visual state continues to reflect persistence.
  cloudSyncControlRevision.value++
  cloudSyncAvailabilityError.value = ''
  if (!nextValue) {
    cloudSyncDialogRef.value?.close()
    settingsCloudSyncPreference.value = false
    return
  }
  if (cloudSyncRequestPending.value)
    return

  cloudSyncRequestPending.value = true
  try {
    const availability = await sendMessage<undefined, SettingsCloudSyncAvailability>(
      SETTINGS_CLOUD_SYNC_AVAILABILITY_MESSAGE,
    )
    if (!isCloudSyncAvailability(availability))
      throw new TypeError('Invalid cloud sync availability response')

    const decision = resolveSettingsCloudSyncEnableDecision(availability.state)
    if (decision.action === 'blocked') {
      cloudSyncAvailabilityError.value = 'incompatible'
      toast.error(t('settings.sync_cloud_incompatible'))
      return
    }
    if (decision.action === 'choose') {
      showCloudSyncConflictDialog.value = true
      return
    }
    if (decision.action === 'enable') {
      cloudSyncRequestPending.value = false
      await enableSettingsCloudSync(decision.mode)
    }
  }
  catch (error) {
    cloudSyncAvailabilityError.value = 'failed'
    console.error('Failed to read settings cloud sync availability:', error)
    toast.error(t('settings.sync_cloud_status_failed'))
  }
  finally {
    cloudSyncRequestPending.value = false
  }
}

function requestCloseCloudSyncConflictDialog() {
  if (!cloudSyncRequestPending.value)
    cloudSyncDialogRef.value?.close()
}

function handleCloudSyncConflictDialogClosed() {
  showCloudSyncConflictDialog.value = false
}
</script>

<template>
  <div>
    <SettingsItemGroup data-setting-id="settings.group_settings_sync" :title="$t('settings.group_settings_sync')">
      <SettingsItem
        setting-id="settings.enable_settings_sync" :title="$t('settings.enable_settings_sync')"
        :desc="$t('settings.enable_settings_sync_desc')"
        right-width="auto"
      >
        <Radio
          :key="cloudSyncControlRevision"
          :model-value="settingsCloudSyncPreference"
          @update:model-value="handleSettingsCloudSyncToggle"
        />
      </SettingsItem>
      <p v-if="cloudSyncAvailabilityError" class="cloud-sync-warning" role="alert">
        {{ $t(cloudSyncAvailabilityError === 'incompatible'
          ? 'settings.sync_cloud_incompatible'
          : 'settings.sync_cloud_status_failed') }}
      </p>
      <div v-if="settingsCloudSyncPreference" class="cloud-sync-status">
        <p>{{ $t('settings.settings_sync_unsynced_count', { count: unsyncedCloudFieldCount }) }}</p>
        <p>{{ $t('settings.settings_sync_quota_blocked_count', { count: settingsCloudSyncStatus.blockedByQuotaCount }) }}</p>
        <p v-if="settingsCloudSyncStatus.retryAt">
          {{ $t('settings.settings_sync_retry_at', { time: new Date(settingsCloudSyncStatus.retryAt).toLocaleString() }) }}
        </p>
        <p v-if="settingsCloudSyncStatus.lastError">
          {{ $t('settings.settings_sync_last_error', { error: settingsCloudSyncStatus.lastError }) }}
        </p>
      </div>
    </SettingsItemGroup>

    <Dialog
      v-if="showCloudSyncConflictDialog"
      ref="cloudSyncDialogRef"
      width="min(460px, calc(100vw - 32px))"
      :show-footer="false"
      :loading="cloudSyncRequestPending"
      :title="$t('settings.sync_cloud_conflict_title')"
      layer="critical-dialog"
      @close="handleCloudSyncConflictDialogClosed"
    >
      <div class="sync-conflict-body">
        <p>{{ $t('settings.sync_cloud_conflict_desc') }}</p>
        <div class="sync-conflict-actions">
          <Button
            type="primary"
            :disabled="cloudSyncRequestPending"
            @click="enableSettingsCloudSync('pull')"
          >
            {{ $t('settings.sync_cloud_use_cloud') }}
          </Button>
          <Button
            type="secondary"
            :disabled="cloudSyncRequestPending"
            @click="enableSettingsCloudSync('push')"
          >
            {{ $t('settings.sync_cloud_use_local') }}
          </Button>
          <Button
            type="tertiary"
            :disabled="cloudSyncRequestPending"
            @click="requestCloseCloudSyncConflictDialog"
          >
            {{ $t('common.operation.cancel') }}
          </Button>
        </div>
      </div>
    </Dialog>
    <Maintenance />
  </div>
</template>

<style scoped lang="scss">
.sync-conflict-body {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-4);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}

.sync-conflict-actions {
  display: grid;
  gap: var(--bew-space-2);
}

.cloud-sync-warning {
  margin: 0;
  padding: 0 var(--bew-space-4) var(--bew-space-3);
  color: var(--bew-error-color);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.cloud-sync-status {
  padding: 0 var(--bew-space-4) var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
</style>
