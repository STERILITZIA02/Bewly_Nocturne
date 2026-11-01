import { shallowReactive } from 'vue'

import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'

export const session = shallowReactive<{ current: BewlyWidescreenState | null, entering: boolean }>({ current: null, entering: false })
