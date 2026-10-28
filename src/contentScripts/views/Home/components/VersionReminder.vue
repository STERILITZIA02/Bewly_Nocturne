<script setup lang="ts">
import Button from '~/components/Button.vue'
import Dialog from '~/components/Dialog.vue'
import { settings } from '~/logic'

import { homepage, version } from '../../../../../package.json'

const GITHUB_RELEASES_URL = `${homepage}/releases`
const BILIBILI_DYNAMIC_URL = 'https://space.bilibili.com/32487218/dynamic'

const dialogVisible = ref(false)

const shouldShowReminder = computed(() =>
  settings.value.enableVersionReminder
  && settings.value.lastAcknowledgedVersion !== version,
)

watch(shouldShowReminder, (visible) => {
  if (!visible)
    dialogVisible.value = false
})

function acknowledgeCurrentVersion() {
  settings.value.lastAcknowledgedVersion = version
  dialogVisible.value = false
}
</script>

<template>
  <Transition name="version-reminder">
    <button
      v-if="shouldShowReminder"
      class="version-reminder-trigger"
      type="button"
      @click="dialogVisible = true"
    >
      <span class="version-reminder-trigger__icon" i-tabler:bell-ringing />
      <span class="version-reminder-trigger__text">
        <strong>{{ $t('version_reminder.trigger') }}</strong>
        <small>v{{ version }}</small>
      </span>
    </button>
  </Transition>

  <Dialog
    v-if="dialogVisible"
    :title="$t('version_reminder.title')"
    :desc="$t('version_reminder.current_version', { version })"
    width="480px"
    max-width="calc(100vw - 32px)"
    content-max-height="calc(100vh - 180px)"
    :show-footer="false"

    append-to-bewly-body
    @close="dialogVisible = false"
  >
    <div class="version-reminder-dialog">
      <div class="version-reminder-dialog__links">
        <a
          :href="GITHUB_RELEASES_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="version-reminder-dialog__link"
        >
          <span class="version-reminder-dialog__link-icon version-reminder-dialog__link-icon--github" i-tabler:brand-github />
          <span class="version-reminder-dialog__link-label">{{ $t('version_reminder.github_releases') }}</span>
          <span class="version-reminder-dialog__arrow" i-tabler:external-link />
        </a>

        <a
          :href="BILIBILI_DYNAMIC_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="version-reminder-dialog__link"
        >
          <span class="version-reminder-dialog__link-icon version-reminder-dialog__link-icon--bilibili" i-tabler:brand-bilibili />
          <span class="version-reminder-dialog__link-label">{{ $t('version_reminder.bilibili_dynamic') }}</span>
          <span class="version-reminder-dialog__arrow" i-tabler:external-link />
        </a>
      </div>

      <Button type="primary" block center @click="acknowledgeCurrentVersion">
        {{ $t('version_reminder.acknowledge') }}
      </Button>

      <p class="version-reminder-dialog__hint">
        {{ $t('version_reminder.settings_hint') }}
      </p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.version-reminder-trigger {
  appearance: none;
  position: fixed;
  left: var(--bew-space-6);
  bottom: var(--bew-space-6);
  z-index: 50;
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  min-height: 42px;
  padding: var(--bew-space-2) var(--bew-space-3);
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
  border: 1px solid var(--bew-theme-color);
  border-radius: var(--bew-surface-radius);
  corner-shape: round;
  box-shadow: var(--bew-shadow-2);
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    border-color var(--bew-duration-fast) var(--bew-ease-standard),
    box-shadow var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-emphasized);
}

.version-reminder-trigger:hover {
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
  box-shadow: var(--bew-shadow-4);
}

.version-reminder-trigger:focus-visible {
  outline: var(--bew-focus-ring, 1px solid CanvasText);
  outline-offset: var(--bew-space-0-5);
}

.version-reminder-trigger:active {
  box-shadow: var(--bew-shadow-1);
}

.version-reminder-trigger__icon {
  width: 20px;
  height: 20px;
  color: var(--bew-on-theme-color);
}

.version-reminder-trigger__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: var(--bew-line-height-control);
}

.version-reminder-trigger__text strong {
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
}

.version-reminder-trigger__text small {
  margin-top: var(--bew-space-0-5);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  color: var(--bew-on-theme-color);
}

.version-reminder-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-4);
  padding: var(--bew-space-0-5) 0 0;
}

.version-reminder-dialog__links {
  display: grid;
  gap: var(--bew-space-3);
}

.version-reminder-dialog__link {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 18px;
  gap: var(--bew-space-3);
  align-items: center;
  padding: var(--bew-space-3);
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  box-sizing: border-box;
  border: var(--bew-hairline) solid var(--bew-edge-color);
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
  transition:
    color 160ms ease,
    background-color 160ms ease,
    border-color 160ms ease;
}

.version-reminder-dialog__link:hover {
  color: var(--bew-on-theme-surface);
  background: var(--bew-theme-surface);
}

.version-reminder-dialog__link-icon {
  width: 38px;
  height: 38px;
  padding: var(--bew-space-2);
  background: currentColor;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.version-reminder-dialog__link-icon--github {
  color: var(--bew-text-1);
}

.version-reminder-dialog__link-icon--bilibili {
  color: var(--bew-theme-foreground);
}

.version-reminder-dialog__link-label {
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}

.version-reminder-dialog__arrow {
  width: 18px;
  height: 18px;
}

.version-reminder-dialog__hint {
  margin: calc(var(--bew-space-1) * -1) 0 0;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-align: center;
}

.version-reminder-enter-active,
.version-reminder-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.version-reminder-enter-from,
.version-reminder-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (max-width: 560px) {
  .version-reminder-trigger {
    left: 16px;
    bottom: 16px;
  }
}
</style>
