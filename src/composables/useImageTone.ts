import type { CSSProperties } from 'vue'
import { computed, shallowRef, watch } from 'vue'

import { getMomentThumbnailUrl } from '~/components/MomentCard/utils'
import type { ImageTone } from '~/utils/imageTone'
import { peekImageBandTone, readImageBandTone, registerToneProperties } from '~/utils/imageTone'
import { isPortraitRatio, PORTRAIT_MAX_CLEAR_HEIGHT } from '~/utils/portraitMedia'

/**
 * Below a portrait picture a moment surface takes the colour of the picture
 * just above where it is cut, with black or white text on it. Returns the
 * inline tone colours for the surface's host; the last colour stays until the
 * next one is read, and one read before applies from the first render.
 */
export function useImageTone(source: () => { portrait: boolean, image?: string, ratio?: number | null }) {
  registerToneProperties()
  const tone = shallowRef<ImageTone | null>(null)
  watch(() => {
    const { portrait, image, ratio } = source()
    return [portrait, image, ratio] as const
  }, async ([portrait, image, ratio], _previous, onCleanup) => {
    if (!portrait || !image) {
      tone.value = null
      return
    }
    let current = true
    onCleanup(() => current = false)
    const shown = isPortraitRatio(ratio) ? Math.min(1, PORTRAIT_MAX_CLEAR_HEIGHT * ratio!) : 1
    const band = [getMomentThumbnailUrl(image, 64), Math.max(0, shown - 0.15), shown] as const
    const known = peekImageBandTone(...band)
    if (known) {
      tone.value = known
      return
    }
    const read = await readImageBandTone(...band)
    if (current && read)
      tone.value = read
  }, { immediate: true })

  return computed(() => tone.value
    ? {
        '--moment-tone': tone.value.color,
        '--moment-tone-fg': tone.value.foreground,
        '--moment-tone-scheme': tone.value.foreground === '#ffffff' ? 'dark' : 'light',
      } as CSSProperties
    : undefined)
}
