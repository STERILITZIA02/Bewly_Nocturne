import type { Ref } from 'vue'
import { computed, onMounted, onScopeDispose, readonly, ref, watch } from 'vue'

import { LAYOUT_BREAKPOINTS } from '~/constants/layout'

import type { ConversationExpansionGeometry } from './conversationExpansion'
import { calculateConversationExpandedGeometry, CONVERSATION_EXPANSION_DURATION, getConversationExpansionGeometry } from './conversationExpansion'

/** Owns presentation phases; never owns conversation identity, history or drafts. */
export function useConversationPresentation(view: Ref<HTMLElement | null>, active: () => boolean, events: {
  activate: () => void
  layoutSettled: () => void
  revealFinished: () => void
}) {
  const conversationExpanded = ref(false)
  const isMobileLayout = ref(false)
  const reducedMotion = ref(false)
  const isLayoutTransitioning = ref(false)
  const entryPhase = ref<'opening' | 'switching' | 'loading' | 'ready'>('opening')
  const historyVisible = ref(true)
  const isRevealingHistory = ref(false)
  const historyRevealDelays = ref<Record<string, number>>({})
  const expandedGeometry = ref<ConversationExpansionGeometry>({ extraHeight: 0, topLift: 0 })
  let mounted = false
  let openingFrame: number | null = null
  let transitionTimer: ReturnType<typeof setTimeout> | null = null
  let resize: ResizeObserver | null = null
  let media: AbortController | null = null
  let lastRevealingMessageId = ''
  const conversationLayoutStyle = computed(() => {
    const geometry = getConversationExpansionGeometry(conversationExpanded.value, isMobileLayout.value, expandedGeometry.value)
    const top = Math.max(0, -geometry.topLift)
    return {
      '--conversation-extra-height': `${geometry.extraHeight}px`,
      '--conversation-top-expansion': `${top}px`,
      '--conversation-bottom-expansion': `${Math.max(0, geometry.extraHeight - top)}px`,
      '--conversation-top-lift': `${geometry.topLift}px`,
      '--conversation-radius': conversationExpanded.value && !isMobileLayout.value ? '0px' : 'var(--bew-panel-radius)',
    }
  })
  function clearTransition() {
    if (transitionTimer !== null)
      clearTimeout(transitionTimer)
    transitionTimer = null
    isLayoutTransitioning.value = false
  }
  function clearReveal() {
    isRevealingHistory.value = false
    historyRevealDelays.value = {}
    lastRevealingMessageId = ''
  }
  function updateConversationGeometry() {
    if (!view.value)
      return
    const rect = view.value.getBoundingClientRect()
    const viewport = window.visualViewport
    const top = viewport?.offsetTop ?? 0
    const geometry = calculateConversationExpandedGeometry({ bottom: rect.bottom - top, top: rect.top - top, viewportHeight: viewport?.height ?? window.innerHeight }, isMobileLayout.value)
    if (geometry.extraHeight !== expandedGeometry.value.extraHeight || geometry.topLift !== expandedGeometry.value.topLift)
      expandedGeometry.value = geometry
  }
  function completeLayoutTransition() {
    clearTransition()
    if (entryPhase.value === 'opening' && mounted && active()) {
      entryPhase.value = 'loading'
      events.activate()
    }
    else {
      events.layoutSettled()
    }
  }
  function releaseLayout() {
    media?.abort()
    media = null
    resize?.disconnect()
    resize = null
    if (openingFrame !== null)
      cancelAnimationFrame(openingFrame)
    openingFrame = null
    clearTransition()
  }
  function open() {
    releaseLayout()
    clearReveal()
    conversationExpanded.value = false
    historyVisible.value = true
    entryPhase.value = 'opening'
    media = new AbortController()
    const mobile = window.matchMedia(`(max-width: ${LAYOUT_BREAKPOINTS.mobileMax}px)`)
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      isMobileLayout.value = mobile.matches
      reducedMotion.value = motion.matches
      if (reducedMotion.value && isRevealingHistory.value) {
        isRevealingHistory.value = false
        events.revealFinished()
      }
      if ((reducedMotion.value || isMobileLayout.value) && isLayoutTransitioning.value)
        completeLayoutTransition()
      updateConversationGeometry()
    }
    sync()
    for (const query of [mobile, motion])
      query.addEventListener('change', sync, { signal: media.signal })
    window.addEventListener('resize', sync, { signal: media.signal })
    window.visualViewport?.addEventListener('resize', sync, { signal: media.signal })
    window.visualViewport?.addEventListener('scroll', sync, { signal: media.signal })
    if (typeof ResizeObserver !== 'undefined') {
      resize = new ResizeObserver(() => {
        if (mounted && active()) {
          updateConversationGeometry()
          events.layoutSettled()
        }
      })
      if (view.value)
        resize.observe(view.value)
    }
    // Commit compact geometry once. Only the completed expansion releases data.
    openingFrame = requestAnimationFrame(() => {
      openingFrame = null
      if (!mounted || !active())
        return
      updateConversationGeometry()
      conversationExpanded.value = true
      if (reducedMotion.value || isMobileLayout.value) {
        completeLayoutTransition()
      }
      else {
        isLayoutTransitioning.value = true
        transitionTimer = setTimeout(completeLayoutTransition, CONVERSATION_EXPANSION_DURATION)
      }
    })
  }
  function switchHistory() {
    if (entryPhase.value !== 'opening') {
      entryPhase.value = 'switching'
      historyVisible.value = false
    }
  }
  function finishConversationSwitch() {
    if (!mounted || !active() || entryPhase.value !== 'switching')
      return
    clearReveal()
    historyVisible.value = true
    entryPhase.value = 'loading'
    events.activate()
  }
  function revealVisibleHistory(viewport: HTMLElement) {
    if (reducedMotion.value)
      return
    const bounds = viewport.getBoundingClientRect()
    const visible = Array.from(viewport.querySelectorAll<HTMLElement>('[data-message-id]')).filter((element) => {
      const rect = element.getBoundingClientRect()
      return rect.bottom > bounds.top && rect.top < bounds.bottom
    })
    const stagger = Math.min(35, CONVERSATION_EXPANSION_DURATION / Math.max(1, visible.length - 1))
    historyRevealDelays.value = Object.fromEntries(visible.map((element, index) => [element.dataset.messageId!, index * stagger]))
    lastRevealingMessageId = visible.at(-1)?.dataset.messageId ?? ''
    isRevealingHistory.value = visible.length > 0
  }
  function finishHistoryReveal(event: AnimationEvent) {
    if ((event.target as HTMLElement).dataset.messageId !== lastRevealingMessageId)
      return
    isRevealingHistory.value = false
    events.revealFinished()
  }
  watch(active, (visible) => {
    if (visible && mounted) {
      open()
    }
    else if (!visible) {
      releaseLayout()
      clearReveal()
      conversationExpanded.value = false
    }
  })
  onMounted(() => {
    mounted = true
    if (active())
      open()
  })
  onScopeDispose(() => {
    mounted = false
    releaseLayout()
  })
  return {
    conversationExpanded: readonly(conversationExpanded),
    reducedMotion: readonly(reducedMotion),
    isLayoutTransitioning: readonly(isLayoutTransitioning),
    entryPhase: readonly(entryPhase),
    historyVisible: readonly(historyVisible),
    isRevealingHistory: readonly(isRevealingHistory),
    historyRevealDelays: readonly(historyRevealDelays),
    conversationLayoutStyle,
    updateConversationGeometry,
    switchHistory,
    finishConversationSwitch,
    revealVisibleHistory,
    finishHistoryReveal,
    showReadyHistory: () => { entryPhase.value = 'ready' },
    beginHistoryLeave: (element: Element) => {
      if (element instanceof HTMLElement)
        element.inert = true
    },
  }
}
