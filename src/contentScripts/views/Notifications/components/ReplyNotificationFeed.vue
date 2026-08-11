<script setup lang="ts">
defineProps<{
  active: boolean
}>()

function refresh() {
  return Promise.resolve()
}

defineExpose({ refresh })
</script>

<template>
  <section class="reply-notification-feed" :aria-label="$t('notifications.sections.reply.label')">
    <Loading />
  </section>
</template>

<style scoped>
.reply-notification-feed {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
}
</style>
