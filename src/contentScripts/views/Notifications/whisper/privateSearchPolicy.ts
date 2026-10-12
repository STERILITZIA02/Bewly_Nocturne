// Shared interaction/read pacing. Keep user and message searches consistent
// without coupling their independent result, pagination or request ownership.
export const PRIVATE_SEARCH_DEBOUNCE_MS = 350
export const PRIVATE_SEARCH_REQUEST_INTERVAL_MS = 200
export const PRIVATE_HISTORY_BATCH_PAUSE_MS = 500
export const PRIVATE_HISTORY_VISIBLE_BATCH_SIZE = 50
