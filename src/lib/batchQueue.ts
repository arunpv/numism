// Local queue for Batch capture mode — see coin_app_requirements.md §5.6.
// Images sit here (IndexedDB, not Cache API — these are opaque blobs, not
// HTTP responses) until the service worker's WiFi/screen-off-gated
// Background Sync handler processes them into extraction results.
import type { CoinFields } from './api'

export type QueueStatus = 'pending' | 'processing' | 'ready' | 'error'

export type QueueItem = {
  id: number
  status: QueueStatus
  frontBlob: Blob
  backBlob: Blob
  capturedAt: number
  fields?: CoinFields
  qualityScore?: number | null
  mintId?: number | null
  mintName?: string | null
  markImageUrl?: string | null
  errorMessage?: string
}

const DB_NAME = 'numismatica-batch'
const DB_VERSION = 1
const STORE = 'pending_coins'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export const batchQueue = {
  enqueue: (frontBlob: Blob, backBlob: Blob): Promise<number> =>
    withStore('readwrite', (store) =>
      store.add({ status: 'pending', frontBlob, backBlob, capturedAt: Date.now() } satisfies Omit<QueueItem, 'id'>),
    ) as Promise<number>,

  listAll: (): Promise<QueueItem[]> => withStore('readonly', (store) => store.getAll()),

  listByStatus: async (status: QueueStatus): Promise<QueueItem[]> => {
    const all = await withStore<QueueItem[]>('readonly', (store) => store.getAll())
    return all.filter((item) => item.status === status)
  },

  get: (id: number): Promise<QueueItem | undefined> => withStore('readonly', (store) => store.get(id)),

  setStatus: async (id: number, status: QueueStatus): Promise<void> => {
    const item = await batchQueue.get(id)
    if (!item) return
    await withStore('readwrite', (store) => store.put({ ...item, status }))
  },

  setResult: async (
    id: number,
    result: {
      fields: CoinFields
      qualityScore: number | null
      mintId: number | null
      mintName: string | null
      markImageUrl: string | null
    },
  ): Promise<void> => {
    const item = await batchQueue.get(id)
    if (!item) return
    await withStore('readwrite', (store) =>
      store.put({
        ...item,
        status: 'ready',
        fields: result.fields,
        qualityScore: result.qualityScore,
        mintId: result.mintId,
        mintName: result.mintName,
        markImageUrl: result.markImageUrl,
        errorMessage: undefined,
      }),
    )
  },

  setError: async (id: number, errorMessage: string): Promise<void> => {
    const item = await batchQueue.get(id)
    if (!item) return
    await withStore('readwrite', (store) => store.put({ ...item, status: 'error', errorMessage }))
  },

  remove: (id: number): Promise<void> => withStore('readwrite', (store) => store.delete(id)) as Promise<void>,

  // A `processing` item with no run actually working on it is stuck forever
  // otherwise — neither the sync handler nor the manual trigger ever looks
  // at anything but `pending`. This happens in practice: Background Sync
  // doesn't guarantee a service worker gets to finish a long loop over many
  // items before the browser/OS kills it, so a run interrupted mid-item
  // orphans whatever was `processing` at that moment. Called at the start of
  // every processing run (both entry points) so an interrupted run's
  // leftovers always get picked up by the next one.
  reclaimStuckProcessing: async (): Promise<void> => {
    const stuck = await batchQueue.listByStatus('processing')
    await Promise.all(stuck.map((item) => batchQueue.setStatus(item.id, 'pending')))
  },
}

export function registerBatchSync(): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.ready
    .then((reg) => {
      const syncReg = reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }
      return syncReg.sync?.register('process-coin-batch')
    })
    .catch(() => {
      // Background Sync unsupported/unavailable — queued items just wait
      // for the next successful registration attempt (e.g. next enqueue).
    })
}
