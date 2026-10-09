import { computed } from 'vue'

import { settings } from '~/logic/storage'
import { createMomentFilter } from '~/utils/momentFilter'

// Both renderers share one derived rule compilation within this document.
export const momentFilterPolicy = computed(() => createMomentFilter(settings.value))
