<script setup lang="ts">
import { FORM_FIELD_LABEL_ID } from '~/components/formFieldLabel'

type RightWidth = 'default' | 'auto'

withDefaults(defineProps<{
  title?: string
  desc?: string
  rightWidth?: RightWidth
  badge?: string
  settingId?: string
}>(), {
  rightWidth: 'default',
})
const titleId = `bew-settings-field-${useId()}`
provide(FORM_FIELD_LABEL_ID, titleId)
</script>

<template>
  <div class="b-settings-item" :data-setting-id="settingId" :data-settings-title="title" py-4>
    <div
      class="b-settings-item-row" :class="`right-width-${rightWidth}`" flex="~ gap-4" justify-between items-center
      text-base
    >
      <div class="left-content" flex-1 min-w-0>
        <div>
          <span :id="titleId" class="settings-item-title">
            <slot name="title">
              {{ title }}
            </slot>
            <span v-if="badge" class="settings-item-badge bew-warning-badge">{{ badge }}</span>
          </span>
        </div>

        <div
          text="sm $bew-text-2"
          break-words
          :style="{ marginTop: $slots.desc || desc ? '0.25rem' : '0' }"
        >
          <slot name="desc">
            {{ desc }}
          </slot>
        </div>
      </div>

      <div class="right-content" w-auto shrink-0>
        <slot />
      </div>
    </div>

    <div v-if="$slots.bottom" mt-4>
      <slot name="bottom" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.right-width-auto {
  .left-content {
    --uno: "w-auto flex-1 min-w-0";
  }

  .right-content {
    --uno: "w-auto shrink-0";
  }
}

:deep(.right-content > *) {
  --uno: "float-right clear-both";
}

.b-settings-item + .b-settings-item {
  --uno: "border-t-1 border-$bew-border-color";
}

.settings-item-title {
  display: inline-flex;
  gap: var(--bew-space-2);
  align-items: center;
  flex-wrap: wrap;
}

// Let a wide control take a new line before the title is squeezed into one
// character per line. Small switches keep their existing inline layout.
.b-settings-item-row {
  flex-wrap: wrap;
}

.b-settings-item-row > .left-content {
  min-width: min(100%, var(--bew-settings-label-min-width));
}

.b-settings-item-row > .right-content {
  min-width: 0;
  max-width: 100%;

  > :deep(*) {
    max-width: 100%;
  }
}
</style>
