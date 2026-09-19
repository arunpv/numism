/// <reference lib="webworker" />
// Batch mode's Background Sync handler — see coin_app_requirements.md §5.6.
// Processes the locally-queued coins (src/lib/batchQueue.ts) once both
// gates pass: WiFi (navigator.connection) and no visible app window
// (WindowClient.visibilityState — the closest proxy a web page has to
// "screen off"/"not in use"). Neither gate passing throws, which makes
// Background Sync retry automatically later. The Queue tab also offers a
// manual "Process now" button (src/lib/processBatch.ts) that bypasses
// these gates for an explicit foreground click — that path runs on the
// main thread and never touches this file.
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { batchQueue } from './lib/batchQueue'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

interface SyncEvent extends ExtendableEvent {
  readonly tag: string
}

// registerType: 'autoUpdate' (vite.config.ts) only auto-injects
// skipWaiting/clientsClaim for the default generateSW strategy — with a
// hand-written injectManifest service worker like this one, they must be
// called explicitly, or a new deploy's SW gets stuck "waiting" behind the
// previous one, which keeps serving a stale precached index.html pointing
// at JS chunk hashes the server no longer has (breaks opening the app).
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

async function extractCoin(front: Blob, back: Blob) {
  const form = new FormData()
  const ext = front.type.includes('png') ? 'png' : 'jpg'
  form.set('front', front, `front.${ext}`)
  form.set('back', back, `back.${ext}`)
  const res = await fetch(`${FUNCTIONS_URL}/extract-coin`, {
    method: 'POST',
    headers: { apiKey: SUPABASE_PUBLISHABLE_KEY },
    body: form,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `extract-coin failed (${res.status})`)
  return json as {
    fields: import('./lib/api').CoinFields
    image_quality_score: number | null
    mint_id: number | null
    mint_name: string | null
    mark_image_url: string | null
  }
}

async function readyToProcess(): Promise<boolean> {
  const conn = (self.navigator as WorkerNavigator & { connection?: { type?: string } }).connection
  if (!conn || conn.type !== 'wifi') return false

  const clients = await self.clients.matchAll({ type: 'window' })
  if (clients.some((c) => (c as WindowClient).visibilityState === 'visible')) return false

  return true
}

async function processBatch() {
  if (!(await readyToProcess())) throw new Error('conditions not met (need WiFi + screen off)')

  // A prior sync invocation can be killed by the browser/OS mid-loop before
  // finishing every pending item — reclaim whatever it left stuck in
  // `processing` so this run (or a later one) actually gets to it.
  await batchQueue.reclaimStuckProcessing()
  const pending = await batchQueue.listByStatus('pending')
  for (const item of pending) {
    await batchQueue.setStatus(item.id, 'processing')
    try {
      const result = await extractCoin(item.frontBlob, item.backBlob)
      await batchQueue.setResult(item.id, {
        fields: result.fields,
        qualityScore: result.image_quality_score,
        mintId: result.mint_id,
        mintName: result.mint_name,
        markImageUrl: result.mark_image_url,
      })
    } catch (err) {
      await batchQueue.setError(item.id, (err as Error).message)
    }
  }
}

self.addEventListener('sync', (event) => {
  const syncEvent = event as SyncEvent
  if (syncEvent.tag === 'process-coin-batch') syncEvent.waitUntil(processBatch())
})
