import { useEffect, useMemo, useState } from 'react'
import { batchQueue, registerBatchSync, type QueueItem } from '../lib/batchQueue'
import { processQueueNow } from '../lib/processBatch'
import { CoinReviewForm } from '../components/CoinReviewForm'

// Batch mode's review-on-reopen screen — see coin_app_requirements.md §5.6.
// Lists what the service worker's Background Sync handler has queued,
// processed, or failed on; a "ready" item hands off to the same
// CoinReviewForm the immediate capture flow uses, so review/duplicate
// handling/save behaves identically regardless of which mode produced it.
export function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [processingNow, setProcessingNow] = useState(false)
  const [pausedUntil, setPausedUntil] = useState<number | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    const all = await batchQueue.listAll()
    all.sort((a, b) => a.capturedAt - b.capturedAt)
    setItems(all)
    setPausedUntil(await batchQueue.pausedUntil())
  }

  async function handleRetry(id: number) {
    await batchQueue.setStatus(id, 'pending')
    registerBatchSync()
    await refresh()
  }

  async function handleProcessNow() {
    setProcessingNow(true)
    try {
      await processQueueNow(refresh)
    } finally {
      setProcessingNow(false)
      await refresh()
    }
  }

  async function handleSaved(id: number) {
    await batchQueue.remove(id)
    setSelectedId(null)
    await refresh()
  }

  async function handleDiscard(id: number) {
    await batchQueue.remove(id)
    setSelectedId(null)
    await refresh()
  }

  const selected = items.find((item) => item.id === selectedId) ?? null

  if (selected && selected.fields) {
    return (
      <div className="page">
        <button type="button" className="back-link" onClick={() => setSelectedId(null)}>
          ← Back to queue
        </button>
        <h1>Review queued coin</h1>
        <QueueReview item={selected} onSaved={() => handleSaved(selected.id)} onDiscard={() => handleDiscard(selected.id)} />
      </div>
    )
  }

  const pending = items.filter((i) => i.status === 'pending')
  const processing = items.filter((i) => i.status === 'processing')
  const ready = items.filter((i) => i.status === 'ready')
  const errored = items.filter((i) => i.status === 'error')

  return (
    <div className="page">
      <h1>Queue</h1>
      <p className="page-hint">
        {pending.length} pending · {processing.length} processing · {ready.length} ready to review · {errored.length} errored
      </p>
      {pausedUntil ? (
        <p className="page-hint">
          Paused until {formatPausedUntil(pausedUntil)} (Gemini limit). Pending items resume automatically the next time
          you open the app after that, once the phone is on WiFi with the screen off.
        </p>
      ) : (
        <p className="page-hint">
          Pending items also process automatically once the phone is on WiFi with the screen off.
        </p>
      )}
      <button type="button" onClick={handleProcessNow} disabled={processingNow || pending.length === 0}>
        {processingNow ? 'Processing…' : 'Process now'}
      </button>

      {items.length === 0 && <p className="page-hint">Nothing queued. Switch Capture to Batch mode to add coins here.</p>}

      <ul className="coin-list">
        {ready.map((item) => (
          <li key={item.id} className="coin-card coin-card-clickable" onClick={() => setSelectedId(item.id)}>
            <QueueThumb blob={item.frontBlob} />
            <div className="coin-card-body">
              <p className="coin-card-title">
                {item.fields?.country || 'Unknown'} — {item.fields?.denomination || '?'}
              </p>
              <p className="coin-card-meta">Ready to review</p>
            </div>
          </li>
        ))}

        {errored.map((item) => (
          <li key={item.id} className="coin-card">
            <QueueThumb blob={item.frontBlob} />
            <div className="coin-card-body">
              <p className="coin-card-title">Failed to process</p>
              <p className="coin-card-meta">{item.errorMessage}</p>
              <button type="button" onClick={() => handleRetry(item.id)}>
                Retry
              </button>
            </div>
          </li>
        ))}

        {processing.map((item) => (
          <li key={item.id} className="coin-card">
            <QueueThumb blob={item.frontBlob} />
            <div className="coin-card-body">
              <p className="coin-card-title">Processing…</p>
            </div>
          </li>
        ))}

        {pending.map((item) => (
          <li key={item.id} className="coin-card">
            <QueueThumb blob={item.frontBlob} />
            <div className="coin-card-body">
              <p className="coin-card-title">Queued</p>
              <p className="coin-card-meta">Captured {new Date(item.capturedAt).toLocaleString()}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatPausedUntil(until: number): string {
  const at = new Date(until)
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return at.toDateString() === new Date().toDateString()
    ? time
    : `${at.toLocaleDateString([], { weekday: 'short' })}, ${time}`
}

function QueueThumb({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return <img src={url} alt="" className="coin-card-thumb" />
}

function QueueReview({ item, onSaved, onDiscard }: { item: QueueItem; onSaved: () => void; onDiscard: () => void }) {
  const frontUrl = useMemo(() => URL.createObjectURL(item.frontBlob), [item.frontBlob])
  const backUrl = useMemo(() => URL.createObjectURL(item.backBlob), [item.backBlob])
  useEffect(() => () => URL.revokeObjectURL(frontUrl), [frontUrl])
  useEffect(() => () => URL.revokeObjectURL(backUrl), [backUrl])

  if (!item.fields) return null

  return (
    <CoinReviewForm
      frontUrl={frontUrl}
      backUrl={backUrl}
      frontBlob={item.frontBlob}
      backBlob={item.backBlob}
      initialFields={item.fields}
      initialQualityScore={item.qualityScore ?? null}
      initialMintName={item.mintName ?? null}
      initialMarkImageUrl={item.markImageUrl ?? null}
      onSaved={onSaved}
      onDiscard={onDiscard}
    />
  )
}
