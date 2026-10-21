<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'

import type { MomentCommentItem } from '~/components/MomentCard/commentUtils'
import MomentReplyComposer from '~/components/MomentCard/MomentReplyComposer.vue'
import { useDark } from '~/composables/useDark'
import { useTopBarStore } from '~/stores/topBarStore'
import { playbackCommentComposer, playbackCommentReplyRequest, showPostedPlaybackComment } from '~/utils/bewlyWidescreen/commentComposer'

// The playback page's comment composer: the dynamic-card composer, docked at
// the bottom of the native comment list (see bewlyWidescreen/commentComposer.ts).
const { isDark } = useDark()
const topBar = useTopBarStore()
const accountId = computed(() => topBar.userInfo.mid ? String(topBar.userInfo.mid) : '')
const composer = ref<InstanceType<typeof MomentReplyComposer> | null>(null)
const replyTarget = shallowRef<MomentCommentItem | null>(null)
const pending = ref(false)

// A native "reply" click retargets the one composer instead of opening a
// native box; a send in progress keeps its target.
watch(playbackCommentReplyRequest, (request) => {
  if (!request || pending.value || composer.value?.focus() === false)
    return
  replyTarget.value = request.reply
})
watch(() => playbackCommentComposer.value && `${playbackCommentComposer.value.type},${playbackCommentComposer.value.oid}`, () => {
  replyTarget.value = null
})

const sourceUrl = computed(() => {
  const page = `${location.origin}${location.pathname}${location.search}`
  return replyTarget.value?.rpid ? `${page}#reply${replyTarget.value.rpid}` : page
})
</script>

<template>
  <Teleport v-if="playbackCommentComposer" :to="playbackCommentComposer.mount">
    <div class="bewly-wrapper" :class="{ dark: isDark }" text="$bew-text-1 size-$bew-base-font-size">
      <MomentReplyComposer
        ref="composer"
        :key="`${accountId}:${playbackCommentComposer.type}:${playbackCommentComposer.oid}`"
        :oid="playbackCommentComposer.oid"
        :type="playbackCommentComposer.type"
        :reply="replyTarget"
        :account-id="accountId"
        :source-url="sourceUrl"
        @close="replyTarget = null"
        @pending="pending = $event"
        @posted="showPostedPlaybackComment"
      />
    </div>
  </Teleport>
</template>
