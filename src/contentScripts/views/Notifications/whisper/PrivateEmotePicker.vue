<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { PrivateEmote, PrivateEmotePackage } from './privateMessageRenderers'

const props = defineProps<{
  packages: PrivateEmotePackage[]
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'select', emote: PrivateEmote): void
}>()

const { t } = useI18n()
const activeType = ref<PrivateEmote['type']>('default')
const activePackageKey = ref('')
const failedImages = ref<Set<string>>(new Set())
const visiblePackages = computed(() => props.packages.filter(pkg => pkg.type === activeType.value))
const activePackage = computed(() => (
  visiblePackages.value.find(pkg => getPackageKey(pkg) === activePackageKey.value)
  ?? visiblePackages.value[0]
  ?? null
))
const hasVisibleEmotes = computed(() => Boolean(activePackage.value?.emotes.length))

function getPackageKey(pkg: PrivateEmotePackage): string {
  return `${pkg.type}:${pkg.id}`
}

function getPackageName(pkg: PrivateEmotePackage): string {
  if (pkg.name)
    return pkg.name
  return t(pkg.type === 'default'
    ? 'notifications.whisper.messages.default_emotes'
    : 'notifications.whisper.messages.user_emotes')
}

function markImageFailed(emoteId: string) {
  failedImages.value = new Set([...failedImages.value, emoteId])
}

async function handleTabKeydown(event: KeyboardEvent, currentType: PrivateEmote['type']) {
  const types: PrivateEmote['type'][] = ['default', 'user']
  const currentIndex = types.indexOf(currentType)
  let nextIndex = currentIndex
  if (event.key === 'ArrowRight')
    nextIndex = (currentIndex + 1) % types.length
  else if (event.key === 'ArrowLeft')
    nextIndex = (currentIndex - 1 + types.length) % types.length
  else if (event.key === 'Home')
    nextIndex = 0
  else if (event.key === 'End')
    nextIndex = types.length - 1
  else
    return

  event.preventDefault()
  activeType.value = types[nextIndex]!
  await nextTick()
  const tablist = (event.currentTarget as HTMLElement).parentElement
  tablist?.querySelector<HTMLElement>(`[data-emote-tab="${activeType.value}"]`)?.focus()
}

watch([activeType, () => props.packages], () => {
  const currentExists = visiblePackages.value.some(pkg => getPackageKey(pkg) === activePackageKey.value)
  if (!currentExists)
    activePackageKey.value = activePackage.value ? getPackageKey(activePackage.value) : ''
  failedImages.value = new Set()
}, { immediate: true })
</script>

<template>
  <section
    id="private-message-emote-picker"
    class="private-emote-picker bew-popover-surface"
    role="dialog"
    :aria-label="t('notifications.whisper.messages.emote_picker')"
    @keydown.esc.stop="emit('close')"
  >
    <div
      class="private-emote-picker__tabs bew-segment-control bew-segment-control--static"
      role="tablist"
      :aria-label="t('notifications.whisper.messages.emote_picker')"
    >
      <button
        v-for="type in (['default', 'user'] as const)"
        :id="`private-emote-tab-${type}`"
        :key="type"
        type="button"
        class="bew-segment-control__item"
        role="tab"
        aria-controls="private-emote-panel"
        :aria-selected="activeType === type"
        :data-active="activeType === type ? 'true' : undefined"
        :data-emote-tab="type"
        :tabindex="activeType === type ? 0 : -1"
        @click="activeType = type"
        @keydown="handleTabKeydown($event, type)"
      >
        {{ t(type === 'default'
          ? 'notifications.whisper.messages.default_emotes'
          : 'notifications.whisper.messages.user_emotes') }}
      </button>
    </div>

    <div
      v-if="visiblePackages.length"
      class="private-emote-picker__packages"
      role="toolbar"
      :aria-label="t('notifications.whisper.messages.emote_packages')"
    >
      <button
        v-for="pkg in visiblePackages"
        :key="getPackageKey(pkg)"
        type="button"
        class="private-emote-picker__package-button"
        :aria-pressed="activePackageKey === getPackageKey(pkg)"
        :title="getPackageName(pkg)"
        @click="activePackageKey = getPackageKey(pkg)"
      >
        {{ getPackageName(pkg) }}
      </button>
    </div>

    <div
      id="private-emote-panel"
      class="private-emote-picker__body"
      role="tabpanel"
      :aria-labelledby="`private-emote-tab-${activeType}`"
    >
      <div v-if="hasVisibleEmotes && activePackage" class="private-emote-picker__grid">
        <button
          v-for="emote in activePackage.emotes"
          :key="emote.id"
          type="button"
          class="private-emote-picker__item"
          :aria-label="emote.text"
          :title="emote.text"
          @click="emit('select', emote)"
        >
          <span v-if="failedImages.has(emote.id)" class="private-emote-picker__fallback">
            {{ emote.text }}
          </span>
          <img
            v-else
            :src="emote.url"
            :alt="emote.text"
            loading="lazy"
            decoding="async"
            @error="markImageFailed(emote.id)"
          >
        </button>
      </div>
      <div v-else class="private-emote-picker__empty">
        {{ t(activeType === 'default'
          ? 'notifications.whisper.messages.default_emotes_empty'
          : 'notifications.whisper.messages.user_emotes_empty') }}
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.private-emote-picker {
  position: absolute;
  bottom: calc(100% + var(--bew-space-2));
  left: 0;
  z-index: var(--bew-z-control-menu);
  display: grid;
  width: min(calc(var(--bew-space-12) * 7), calc(100vw - var(--bew-space-4)));
  max-height: min(calc(var(--bew-space-12) * 8), 60vh);
  padding: var(--bew-space-2);
  overflow: hidden;
}

.private-emote-picker__tabs {
  width: 100%;
}

.private-emote-picker__tabs > button {
  flex: 1 1 0;
}

.private-emote-picker__body {
  min-height: calc(var(--bew-space-12) * 3);
  padding: var(--bew-space-2) 0 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.private-emote-picker__packages {
  display: flex;
  gap: var(--bew-space-1);
  padding-top: var(--bew-space-2);
  overflow-x: auto;
  overscroll-behavior-x: contain;
}

.private-emote-picker__package-button {
  appearance: none;
  flex: 0 0 auto;
  min-height: var(--bew-control-height-sm);
  padding: 0 var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-caption);
  background: transparent;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  cursor: pointer;
}

.private-emote-picker__package-button:hover {
  color: var(--bew-text-1);
  background: var(--bew-fill-2);
}

.private-emote-picker__package-button[aria-pressed="true"] {
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
}

.private-emote-picker__package-button:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: var(--bew-space-0-5);
}

.private-emote-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--bew-control-height-lg), 1fr));
  gap: var(--bew-space-1);
}

.private-emote-picker__item {
  appearance: none;
  display: grid;
  min-width: var(--bew-control-height-lg);
  min-height: var(--bew-control-height-lg);
  padding: var(--bew-space-1);
  place-items: center;
  color: var(--bew-text-1);
  background: transparent;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  cursor: pointer;
  transition:
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-emphasized);
}

.private-emote-picker__item:hover {
  background: var(--bew-fill-2);
}

.private-emote-picker__item:active {
  background: var(--bew-fill-3);
  transform: scale(0.92);
}

.private-emote-picker__item:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: var(--bew-space-0-5);
}

.private-emote-picker__item img {
  width: var(--bew-icon-size-xl);
  height: var(--bew-icon-size-xl);
  object-fit: contain;
}

.private-emote-picker__fallback {
  overflow: hidden;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.private-emote-picker__empty {
  display: grid;
  min-height: calc(var(--bew-space-12) * 3);
  padding: var(--bew-space-4);
  place-items: center;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-align: center;
}
</style>
