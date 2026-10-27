<script setup lang="ts">
import browser from 'webextension-polyfill'

import Button from '~/components/Button.vue'
import Dialog from '~/components/Dialog.vue'
import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'
import { getExtensionAssetUrl } from '~/utils/messaging'
import { isNewerReleaseVersion } from '~/utils/releaseVersion'

import { displayName, homepage, version } from '../../../../package.json'
import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const hasNewVersion = ref<boolean>(false)
const contributorsImageFailed = ref(false)
const LicensePanel = defineAsyncComponent(() => import('./LicensePanel.vue'))
const licenseKind = ref<'project' | 'thirdParty' | null>(null)
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
    hasNewVersion.value = typeof data.tag_name === 'string' && isNewerReleaseVersion(data.tag_name, version)
  }
  catch {
  }
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
          rounded="$bew-interactive-radius"
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
        <SettingsItemGroup data-setting-id="settings.group_licenses" :title="$t('settings.group_licenses')">
          <SettingsItem setting-id="settings.project_license" :title="$t('settings.project_license')" right-width="auto">
            <Button type="secondary" @click="licenseKind = 'project'">
              {{ $t('settings.licenses_view') }}
            </Button>
          </SettingsItem>
          <SettingsItem setting-id="settings.third_party_licenses" :title="$t('settings.third_party_licenses')" right-width="auto">
            <Button type="secondary" @click="licenseKind = 'thirdParty'">
              {{ $t('settings.licenses_view') }}
            </Button>
          </SettingsItem>
        </SettingsItemGroup>
        <Dialog
          v-if="licenseKind"
          :title="$t(licenseKind === 'project' ? 'settings.project_license' : 'settings.third_party_licenses')"
          :show-footer="false"
          width="min(720px, calc(100vw - 32px))"
          @close="licenseKind = null"
        >
          <LicensePanel :kind="licenseKind" />
        </Dialog>
        <SettingsItemGroup data-setting-id="settings.group_version_reminder" :title="$t('settings.group_version_reminder')">
          <SettingsItem
            setting-id="settings.enable_version_reminder" :title="$t('settings.enable_version_reminder')"
            :desc="$t('settings.enable_version_reminder_desc')"
            right-width="auto"
          >
            <Radio v-model="settings.enableVersionReminder" />
          </SettingsItem>
        </SettingsItemGroup>
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
.title {
  --uno: "mb-2";
}

.about-brand {
  margin-top: var(--bew-space-2);
  font-size: var(--bew-font-size-display);
  color: var(--bew-text-1);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-display);
}

.about-info-card {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-6);
  margin: var(--bew-space-6) calc(var(--bew-space-4) * -1) 0;
  padding: var(--bew-space-4);
  background: var(--bew-fill-alt);
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
  box-shadow: var(--bew-shadow-1);
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

.contributors-error {
  padding: var(--bew-space-4);
  color: var(--bew-error-color);
  text-align: center;
  background: var(--bew-fill-1);
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
}

.link-card {
  --uno: "w-full h-48px px-4 py-2 flex items-center rounded-$bew-interactive-radius";
  --uno: "duration-300";

  > div {
    --uno: "mr-2 shrink-0";
  }
}
</style>
