export const LOCAL_LOUDNESS_BIND = 'bewly:local-loudness:bind'
export const LOCAL_LOUDNESS_BIND_REQUEST = 'bewly:local-loudness:bind-request'
export const LOCAL_LOUDNESS_STATE = 'bewly:local-loudness:state'
export const LOCAL_LOUDNESS_PANEL = 'bewly:local-loudness:panel'
export const LOCAL_LOUDNESS_SAMPLE_LIMIT = 60
export const LOCAL_LOUDNESS_DEFAULTS = { enabled: false, target: -18, strength: 75 } as const
export const LOCAL_LOUDNESS_RANGE = { target: { min: -24, max: -14 }, strength: { min: 40, max: 100 } } as const

export interface LocalLoudnessConfig { enabled: boolean, target: number, strength: number }
export const LOCAL_LOUDNESS_STATES = ['off', 'waiting', 'gesture', 'active', 'paused', 'native-on', 'native-unknown', 'source-in-use', 'unsupported', 'error', 'reload-required'] as const
export type LocalLoudnessState = typeof LOCAL_LOUDNESS_STATES[number]
export interface LocalLoudnessMeasurement { loudness: number, gainDb: number, peakReductionDb: number }

export function normalizeLocalLoudnessValue(value: unknown, key: 'target' | 'strength') {
  const range = LOCAL_LOUDNESS_RANGE[key]
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(range.min, Math.min(range.max, value))) : LOCAL_LOUDNESS_DEFAULTS[key]
}

export function readLocalLoudnessMeasurement(value: unknown): LocalLoudnessMeasurement | undefined {
  const data = value as Partial<LocalLoudnessMeasurement> | null
  if (data && [data.loudness, data.gainDb, data.peakReductionDb].every(value => typeof value === 'number' && Number.isFinite(value))
    && data.loudness! >= -120 && data.loudness! <= 30 && data.gainDb! >= -18.01 && data.gainDb! <= 6.01 && data.peakReductionDb! <= 0 && data.peakReductionDb! >= -120) {
    return { loudness: data.loudness!, gainDb: data.gainDb!, peakReductionDb: data.peakReductionDb! }
  }
}
