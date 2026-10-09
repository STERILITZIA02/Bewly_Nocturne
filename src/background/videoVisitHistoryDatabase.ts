import type { VideoHistorySnapshot, VideoHistoryWriteDelta } from '~/utils/videoVisitRecord'

/**
 * Native web storage follows the split worker's browser context. In particular,
 * private history must not use chrome.storage.local/session, which are shared.
 */
export function createVideoVisitHistoryDatabase(
  factory: IDBFactory = indexedDB,
  context: 'normal' | 'private' = 'normal',
  onInvalidated?: () => void,
) {
  let database: Promise<IDBDatabase> | undefined
  const name = `bewly-nocturne-video-history-v2-${context}`
  function open() {
    database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('metadata')
        request.result.createObjectStore('records')
      }
      request.onerror = () => reject(request.error ?? new Error('Cannot open local history'))
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => {
          db.close()
          database = undefined
          onInvalidated?.()
        }
        resolve(db)
      }
    }).catch((error) => {
      database = undefined
      throw error
    })
    return database
  }
  async function transact(mode: IDBTransactionMode, value?: VideoHistorySnapshot, delta?: VideoHistoryWriteDelta): Promise<unknown> {
    const db = await open()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['metadata', 'records'], mode)
      const records = transaction.objectStore('records')
      const metadata = transaction.objectStore('metadata')
      if (mode === 'readonly') {
        const meta = metadata.get('snapshot')
        const values = records.getAll()
        const keys = records.getAllKeys()
        transaction.oncomplete = () => resolve(meta.result
          ? { ...meta.result, records: Object.fromEntries(keys.result.map((key, index) => [String(key), values.result[index]])) }
          : undefined)
      }
      else {
        const { records: allRecords, ...meta } = value!
        metadata.put(meta, 'snapshot')
        if (!delta || delta.reset)
          records.clear()
        else
          delta.removed.forEach(key => records.delete(key))
        for (const [key, record] of Object.entries(!delta || delta.reset ? allRecords : delta.records))
          records.put(record, key)
        transaction.oncomplete = () => resolve(undefined)
      }
      transaction.onabort = () => reject(transaction.error ?? new Error('Local history transaction aborted'))
      transaction.onerror = () => reject(transaction.error ?? new Error('Local history transaction failed'))
    })
  }
  return {
    get: () => transact('readonly'),
    set: async (snapshot: VideoHistorySnapshot, delta?: VideoHistoryWriteDelta) => {
      await transact('readwrite', snapshot, delta)
    },
  }
}
