import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'

export const session: { current: BewlyWidescreenState | null, entering: boolean } = { current: null, entering: false }
