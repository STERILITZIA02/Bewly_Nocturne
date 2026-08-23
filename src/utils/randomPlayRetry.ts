export const RANDOM_PLAY_VIDEO_RETRY_MAX = 25
export const RANDOM_PLAY_UI_RETRY_MAX = 100

export function shouldRetryRandomPlayVideo(retryCount: number): boolean {
  return retryCount < RANDOM_PLAY_VIDEO_RETRY_MAX
}
