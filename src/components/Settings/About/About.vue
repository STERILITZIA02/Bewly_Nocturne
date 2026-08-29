<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import browser from 'webextension-polyfill'

import Radio from '~/components/Radio.vue'
import { useSettingsCloudSyncPreference } from '~/composables/useSettingsCloudSyncPreference'
import { useStorageLocal } from '~/composables/useStorageLocal'
import { settings } from '~/logic'
import { getExtensionAssetUrl, sendMessage } from '~/utils/messaging'
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

import { displayName, homepage, version } from '../../../../package.json'
import Maintenance from '../Advanced/Maintenance.vue'
import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
import SettingsSectionHeading from '../components/SettingsSectionHeading.vue'

const { t } = useI18n()
const toast = useToast()
const hasNewVersion = ref<boolean>(false)
const contributorsImageFailed = ref(false)
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
const repositoryPath = new URL(homepage).pathname.replace(/^\//, '')
const releasesUrl = `${homepage}/releases`
const latestReleaseApiUrl = `https://api.github.com/repos/${repositoryPath}/releases/latest`
const contributorsUrl = `${homepage}/graphs/contributors`
const contributorsRemoteImageUrl = 'https://contrib.rocks/image?repo=STERILITZIA02/Bewly_Nocturne'
const contributorsImageUrl = ref(getExtensionAssetUrl('/assets/contributors.svg'))
let contributorRemoteFallbackUsed = false

const isDev = computed((): boolean => import.meta.env.DEV)

onMounted(() => {
  checkGitHubRelease()
})

async function checkGitHubRelease() {
  try {
    const response = await fetch(latestReleaseApiUrl)
    if (!response.ok)
      throw new Error('Network response was not ok')

    const data = await response.json()
    const latestVersion = data.tag_name

    // Here you can compare `latestVersion` with your current version
    const currentVersion = `v${version}` // Replace with your actual current version

    if (latestVersion !== currentVersion)
      hasNewVersion.value = true
  }
  catch {
  }
}

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

function handleContributorImageError() {
  if (!contributorRemoteFallbackUsed) {
    contributorRemoteFallbackUsed = true
    contributorsImageUrl.value = contributorsRemoteImageUrl
    return
  }
  contributorsImageFailed.value = true
}
</script>

<template>
  <div :data-settings-title="$t('settings.menu_about')">
    <div class="about-content">
      <div relative w-200px m-auto>
        <img
          :src="`${browser.runtime.getURL('/assets/icon-512.png')}`" alt="" width="200"
        >

        <a
          v-if="hasNewVersion"
          :href="releasesUrl" target="_blank"
          pos="absolute bottom-0 right-0" transform="translate-x-50%" un-text="xs $bew-text-1" p="y-1 x-2" bg="$bew-fill-1"
          rounded="$bew-radius"
        >
          {{ $t('settings.new_version_badge') }}
        </a>
      </div>
      <section class="about-brand" text-center mt-2>
        <p flex="inline gap-2">
          <span>{{ displayName }}</span>
          <span
            v-if="isDev"
            class="bew-warning-text"
            inline-block
          >
            {{ $t('settings.development_build_badge') }}
          </span>
        </p>
        <p text-center>
          <a
            :href="releasesUrl" target="_blank"
            un-text="sm color-$bew-text-2 hover:color-$bew-text-3"
          >
            v{{ version }}
          </a>
        </p>
      </section>

      <section class="about-maintenance">
        <SettingsItemGroup :title="$t('settings.group_settings_sync')">
          <SettingsItem
            :title="$t('settings.enable_settings_sync')"
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

        <SettingsItemGroup :title="$t('settings.group_version_reminder')">
          <SettingsItem
            :title="$t('settings.enable_version_reminder')"
            :desc="$t('settings.enable_version_reminder_desc')"
            right-width="auto"
          >
            <Radio v-model="settings.enableVersionReminder" />
          </SettingsItem>
        </SettingsItemGroup>

        <SettingsSectionHeading
          class="maintenance-heading"
          :title="$t('settings.maintenance.title')"
          :desc="$t('settings.category_advanced_maintenance_desc')"
          icon="i-mingcute:save-2-fill"
        />
        <Maintenance />
      </section>

      <section
        class="about-info-card"
      >
        <section w-full>
          <h3 class="title">
            {{ $t('settings.links') }}
          </h3>
          <div grid="~ xl:cols-6 lg:cols-5 md:cols-4 cols-3 gap-2">
            <a
              :href="homepage" target="_blank"
              class="link-card"
              bg="black dark:white !opacity-10 !hover:opacity-20"
              un-text="black dark:white"
            >
              <div i-tabler:brand-github /> GitHub
            </a>
          </div>
        </section>
        <section w-full>
          <h3 class="title">
            {{ $t('settings.current_contributors') }}
          </h3>
          <p v-if="contributorsImageFailed" class="contributors-error">
            {{ $t('settings.contributors_image_failed') }}
          </p>
          <a
            v-else
            :href="contributorsUrl"
            target="_blank"
            class="contributors-image-link"
          >
            <img
              :src="contributorsImageUrl"
              :alt="$t('settings.current_contributors')"
              loading="lazy"
              @error="handleContributorImageError"
            >
          </a>
        </section>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
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

.btn {
  --b-button-color: var(--bew-fill-1);
  --b-button-color-hover: var(--bew-fill-2);
}

.title {
  --uno: "fw-bold mb-2";
}

.about-brand {
  margin-top: var(--bew-space-2);
  font-size: var(--bew-font-size-display);
  font-weight: var(--bew-font-weight-bold);
  line-height: var(--bew-line-height-data);
}

.about-info-card {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-6);
  margin: var(--bew-space-6) calc(var(--bew-space-4) * -1) 0;
  padding: var(--bew-space-4);
  background: var(--bew-fill-alt);
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
  box-shadow: var(--bew-shadow-1), var(--bew-shadow-edge-glow-1);
}

.contributors-image-link {
  display: block;

  img {
    display: block;
    max-width: 100%;
    height: auto;
  }
}

.about-maintenance {
  margin-top: var(--bew-space-6);
}

.cloud-sync-status {
  padding: 0 var(--bew-space-4) var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.maintenance-heading {
  margin-top: var(--bew-space-8);
}

.contributors-error {
  padding: var(--bew-space-4);
  color: var(--bew-error-color);
  text-align: center;
  background: var(--bew-fill-1);
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
}

.link-card {
  --uno: "w-full h-48px px-4 py-2 flex items-center rounded-$bew-radius";
  --uno: "duration-300";

  > div {
    --uno: "mr-2 shrink-0";
  }
}
</style>
