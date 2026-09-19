// Manual "Process now" trigger for the Queue tab — see
// coin_app_requirements.md §5.6. Runs the same extraction step as the
// service worker's Background Sync handler (src/sw.ts), but directly on
// the main thread in response to an explicit click, so it skips the
// WiFi/screen-off gates entirely (a foreground click is inherently neither
// of those, and it's the user overriding automatic timing on purpose).
// Deliberately NOT in batchQueue.ts / imported by sw.ts: coinApi pulls in
// the Supabase client (src/lib/supabase.ts), which isn't safe to load in
// the service worker's global scope (no localStorage there).
import { coinApi } from './api'
import { batchQueue } from './batchQueue'

export async function processQueueNow(onItemDone?: () => void): Promise<void> {
  await batchQueue.reclaimStuckProcessing()
  const pending = await batchQueue.listByStatus('pending')
  for (const item of pending) {
    await batchQueue.setStatus(item.id, 'processing')
    onItemDone?.()
    try {
      const result = await coinApi.extractCoin(item.frontBlob, item.backBlob)
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
    onItemDone?.()
  }
}
