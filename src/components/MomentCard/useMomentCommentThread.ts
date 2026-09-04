import type { Ref } from 'vue'
import { onUnmounted, ref, watch } from 'vue'

import api from '~/utils/api'
import { getUserID } from '~/utils/main'
import type { MomentCommentThreadSnapshot } from '~/utils/momentCommentThread'
import { createMomentCommentThreadController } from '~/utils/momentCommentThread'

import type { MomentCommentItem } from './commentUtils'
import { flattenMomentCommentReplies, normalizeMomentCommentRepliesPage } from './commentUtils'

const THREAD_PAGE_SIZE = 20

export function useMomentCommentThread(
  commentId: Ref<string>,
  commentType: Ref<number>,
) {
  const revision = ref(0)
  const getIdentity = () => `${getUserID() ?? 'guest'}:${commentType.value}:${commentId.value}`
  const controller = createMomentCommentThreadController({
    getIdentity,
    fetchPage: async (rootRpid, pageNumber) => {
      const response = await api.moment.getMomentCommentReplies({
        oid: commentId.value,
        type: commentType.value,
        root: rootRpid,
        pn: pageNumber,
        ps: THREAD_PAGE_SIZE,
      })
      return normalizeMomentCommentRepliesPage(response, pageNumber, THREAD_PAGE_SIZE)
    },
  })

  watch([commentId, commentType], () => {
    controller.invalidate()
    revision.value += 1
  }, { flush: 'sync' })

  function seedThread(root: MomentCommentItem) {
    const rootRpid = root.rpid || root.id
    const previewItems = flattenMomentCommentReplies(root.replies)
    controller.seed(rootRpid, previewItems, root.replyCount)
    revision.value += 1
  }

  function getThreadState(root: MomentCommentItem) {
    return controller.getState(root.rpid || root.id)
  }

  function resetThreads() {
    controller.invalidate()
    revision.value += 1
  }

  async function loadMoreReplies(root: MomentCommentItem) {
    revision.value += 1
    try {
      await controller.loadMore(root.rpid || root.id)
    }
    catch {
      // The controller retains previous replies and exposes a retryable error state.
    }
    finally {
      revision.value += 1
    }
  }

  onUnmounted(() => controller.dispose())

  return {
    getThreadState,
    loadMoreReplies,
    resetThreads,
    snapshotThreads: controller.snapshot,
    restoreThreads: (snapshots: MomentCommentThreadSnapshot[]) => {
      controller.restore(snapshots)
      revision.value += 1
    },
    revision,
    seedThread,
  }
}
