<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Dialog from '~/components/Dialog.vue'
import Empty from '~/components/Empty.vue'
import SettingsSegmentedControl from '~/components/Settings/components/SettingsSegmentedControl.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import type { FavoriteFolderForm } from '~/utils/favoriteFolderForm'
import { FAVORITE_COVER_TYPES, FAVORITE_FOLDER_INTRO_LIMIT, FAVORITE_FOLDER_TITLE_LIMIT, isFavoriteCover } from '~/utils/favoriteFolderForm'

const props = defineProps<{ value: FavoriteFolderForm, creating: boolean, loading: boolean, failed: boolean, pending: boolean, closing?: boolean }>()
const emit = defineEmits<{ close: [], retry: [], save: [value: FavoriteFolderForm, file?: File] }>()
const { t } = useI18n()
const id = useId()
const draft = ref({ ...props.value })
const file = ref<File>()
const localCover = ref('')
const error = ref('')
const formElement = ref<HTMLFormElement>()
const dialogRef = ref<InstanceType<typeof Dialog>>()
watch(() => props.closing, async (closing) => {
  if (!closing)
    return
  await nextTick()
  if (props.closing)
    dialogRef.value?.close()
})
const visibility = computed({ get: () => draft.value.privacy ? 'private' : 'public', set: value => draft.value.privacy = value === 'private' ? 1 : 0 })
const visibilityOptions = computed(() => [
  { label: t('favorites.folder_public'), value: 'public' },
  { label: t('favorites.folder_private'), value: 'private' },
])
function revokeCover() {
  if (localCover.value)
    URL.revokeObjectURL(localCover.value)
  localCover.value = ''
}
watch(() => props.value, (value) => {
  draft.value = { ...value }
  file.value = undefined
  revokeCover()
})
onScopeDispose(revokeCover)
function selectCover(event: Event) {
  const input = event.target as HTMLInputElement
  const candidate = input.files?.[0]
  input.value = ''
  if (!candidate)
    return
  if (!isFavoriteCover(candidate)) {
    error.value = t('favorites.cover_invalid')
    return
  }
  error.value = ''
  revokeCover()
  file.value = candidate
  localCover.value = URL.createObjectURL(candidate)
}
function save() {
  if (props.pending || props.loading || props.failed || !formElement.value?.reportValidity())
    return
  if (!draft.value.title.trim()) {
    error.value = t('favorites.edit_folder_title_empty')
    return
  }
  error.value = ''
  emit('save', { ...draft.value }, file.value)
}
</script>

<template>
  <Dialog
    ref="dialogRef" :title="t(creating ? 'favorites.create_folder' : 'favorites.edit_folder_dialog_title')"
    width="var(--bew-layout-dialog-width)" append-to-bewly-body
    :close-on-confirm="false" :loading="pending || closing" :prevent-close-when-loading="!closing" :show-loading-overlay="false" @close="emit('close')"
    @confirm="save"
  >
    <div v-if="loading" class="folder-editor" aria-hidden="true">
      <SkeletonBlock class="folder-editor__cover" height="auto" radius="card" />
      <div class="folder-editor__field">
        <SkeletonBlock width="3em" height="var(--bew-line-height-body)" />
        <SkeletonBlock height="calc(var(--bew-line-height-body) + var(--bew-space-4))" radius="interactive" />
      </div>
      <div class="folder-editor__field">
        <SkeletonBlock width="3em" height="var(--bew-line-height-body)" />
        <SkeletonBlock height="calc(var(--bew-line-height-body) * 3 + var(--bew-space-4))" radius="interactive" />
      </div>
      <div class="folder-editor__visibility">
        <SkeletonBlock width="7em" height="var(--bew-line-height-body)" />
        <SkeletonBlock width="10em" height="var(--bew-control-height)" radius="full" />
      </div>
    </div>
    <Empty v-else-if="failed" text-only :description="t('common.load_failed')" :action-label="t('common.operation.refresh')" @action="emit('retry')" />
    <form v-else ref="formElement" class="folder-editor" @submit.prevent="save">
      <fieldset :disabled="pending" class="folder-editor__fields">
        <label class="folder-editor__cover" :for="`${id}-cover`">
          <img v-if="localCover || draft.cover" :src="localCover || draft.cover" alt="" class="folder-editor__image">
          <span v-else i-tabler:photo-plus class="folder-editor__placeholder" />
          <span class="folder-editor__cover-label">{{ t('favorites.change_cover') }}</span>
          <input :id="`${id}-cover`" class="folder-editor__file" type="file" :accept="FAVORITE_COVER_TYPES.join(',')" @change="selectCover">
        </label>
        <label class="folder-editor__field">
          <span>{{ t('favorites.folder_name') }} <span aria-hidden="true">*</span></span>
          <input v-model="draft.title" data-dialog-initial-focus required :maxlength="FAVORITE_FOLDER_TITLE_LIMIT" autocomplete="off">
        </label>
        <label class="folder-editor__field">
          <span>{{ t('favorites.folder_intro') }}</span>
          <textarea v-model="draft.intro" :maxlength="FAVORITE_FOLDER_INTRO_LIMIT" rows="3" />
        </label>
        <div class="folder-editor__visibility">
          <span>{{ t('favorites.folder_visibility') }}</span>
          <SettingsSegmentedControl v-model="visibility" :options="visibilityOptions" :label="t('favorites.folder_visibility')" />
        </div>
        <p v-if="error" class="folder-editor__error" role="alert">
          {{ error }}
        </p>
      </fieldset>
    </form>
  </Dialog>
</template>

<style scoped lang="scss">
.folder-editor,
.folder-editor__fields {
  display: grid;
  gap: var(--bew-space-4);
  min-width: 0;
  border: 0;
  padding: 0;
  margin: 0;
}
.folder-editor__cover {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 8 / 5;
  max-height: 200px;
  overflow: hidden;
  border-radius: var(--bew-surface-radius);
  background: var(--bew-fill-2);
  cursor: pointer;
  &:focus-within {
    outline: var(--bew-focus-ring);
  }
}
.folder-editor__image {
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: cover;
}
.folder-editor__placeholder {
  font-size: var(--bew-icon-size-xl);
}
.folder-editor__cover-label {
  position: absolute;
  inset: auto 0 0;
  text-align: center;
  padding: var(--bew-space-2);
  color: white;
  background: rgb(0 0 0 / 60%);
}
.folder-editor__file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.folder-editor__field {
  display: grid;
  gap: var(--bew-space-2);
  input,
  textarea {
    box-sizing: border-box;
    width: 100%;
    padding: var(--bew-space-2) var(--bew-space-3);
    border: 1px solid var(--bew-field-edge-color);
    border-radius: var(--bew-interactive-radius);
    background: var(--bew-input-bg);
    color: var(--bew-text-1);
    font: inherit;
  }
  textarea {
    resize: vertical;
  }
}
.folder-editor__visibility {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-3);
  > span {
    flex: none;
    white-space: nowrap;
  }
  > :last-child {
    min-width: 0;
    width: auto;
    flex: 1;
  }
}
.folder-editor__error {
  margin: 0;
  color: var(--bew-error-color);
}
</style>
