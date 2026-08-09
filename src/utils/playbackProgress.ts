export function normalizePlaybackProgress(progress: number, duration: number): number {
  if (progress === -1)
    return 100
  if (!Number.isFinite(progress) || !Number.isFinite(duration) || duration <= 0)
    return 0

  return Math.min(100, Math.max(0, (progress / duration) * 100))
}
