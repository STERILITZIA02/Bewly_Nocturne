import type { NativeLoudnessOption } from './listenPlayback'

/** Bpx's 音量均衡 radio group in its settings menu. */
export const NATIVE_LOUDNESS_SETTING = '.bpx-player-ctrl-setting-loudness'

export interface NativeAudioSettings {
  loudness: NativeLoudnessOption
  /** Native sound-enhancement gain in dB; a nonzero value pauses normalization. */
  gain: number
}

/** The option checked in Bpx's settings menu, when the menu is rendered. */
export function readRenderedLoudnessOption(player: ParentNode | null): NativeLoudnessOption | undefined {
  const inputs = player?.querySelectorAll<HTMLInputElement>(`${NATIVE_LOUDNESS_SETTING} input`)
  const selected = inputs && Array.from(inputs).filter(input => input.checked)
  if (selected?.length !== 1)
    return
  return selected[0].value === '0' ? 0 : selected[0].value === '2' ? 2 : 1
}

/**
 * The 音量均衡 option Bpx applies: the menu's, else the one it stored
 * (`bpx_player_profile`), else off. MAIN can supply the live native settings
 * before the lazily mounted menu exists, including server-selected defaults.
 */
export function readNativeAudioSettings(player: ParentNode | null, live?: { loudness?: unknown, gain?: unknown }): NativeAudioSettings {
  const validOption = (value: unknown): value is NativeLoudnessOption => value === 0 || value === 1 || value === 2
  const validGain = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
  if (validOption(live?.loudness) && validGain(live?.gain))
    return { loudness: live.loudness, gain: live.gain }
  let profile: { media?: { loudnessSwitch?: unknown }, audioEffect?: { gain?: unknown } } | null = null
  try {
    profile = JSON.parse(localStorage.getItem('bpx_player_profile') ?? 'null')
  }
  catch {}
  const stored = profile?.media?.loudnessSwitch
  const gain = live?.gain ?? profile?.audioEffect?.gain
  return {
    loudness: validOption(live?.loudness) ? live.loudness : readRenderedLoudnessOption(player) ?? (validOption(stored) ? stored : 0),
    gain: validGain(gain) ? gain : 0,
  }
}
