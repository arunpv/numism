import { useEffect, useState } from 'react'
import { coinApi, type CoinFields } from '../lib/api'
import { compressImage, removeBackground } from '../lib/image'
import { batchQueue, registerBatchSync } from '../lib/batchQueue'
import { CameraCapture } from '../components/CameraCapture'
import { CoinReviewForm } from '../components/CoinReviewForm'

type Stage = 'capture-front' | 'removing-bg-front' | 'capture-back' | 'removing-bg-back' | 'extracting' | 'review' | 'saved'
type CaptureMode = 'immediate' | 'batch'

const MODE_STORAGE_KEY = 'numismatica_capture_mode'

const EMPTY_FIELDS: CoinFields = {
  country: '',
  denomination: '',
  mint_year: null,
  mint_mark: '',
  commemorative_theme: null,
  period: null,
  value: null,
  currency: null,
  composition: null,
  weight_grams: null,
  diameter_mm: null,
  thickness_mm: null,
  shape: null,
  orientation: null,
  demonetized: false,
  rarity: null,
  estimated_value_low: null,
  estimated_value_high: null,
  grade: null,
}

export function CapturePage() {
  const [mode, setMode] = useState<CaptureMode>(
    () => (localStorage.getItem(MODE_STORAGE_KEY) as CaptureMode | null) ?? 'immediate',
  )
  const [stage, setStage] = useState<Stage>('capture-front')
  const [error, setError] = useState<string | null>(null)
  const [frontBlob, setFrontBlob] = useState<Blob | null>(null)
  const [backBlob, setBackBlob] = useState<Blob | null>(null)
  const [frontUrl, setFrontUrl] = useState<string | null>(null)
  const [backUrl, setBackUrl] = useState<string | null>(null)
  const [fields, setFields] = useState<CoinFields>(EMPTY_FIELDS)
  const [qualityScore, setQualityScore] = useState<number | null>(null)
  const [mintName, setMintName] = useState<string | null>(null)
  const [markImageUrl, setMarkImageUrl] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<number | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    return () => {
      if (frontUrl) URL.revokeObjectURL(frontUrl)
      if (backUrl) URL.revokeObjectURL(backUrl)
    }
  }, [frontUrl, backUrl])

  useEffect(() => {
    if (mode === 'batch') refreshPendingCount()
  }, [mode])

  function handleModeChange(next: CaptureMode) {
    setMode(next)
    localStorage.setItem(MODE_STORAGE_KEY, next)
  }

  async function refreshPendingCount() {
    const pending = await batchQueue.listByStatus('pending')
    const processing = await batchQueue.listByStatus('processing')
    setPendingCount(pending.length + processing.length)
  }

  async function handleFrontCaptured(raw: Blob) {
    setError(null)
    try {
      const compressed = await compressImage(raw)
      setStage('removing-bg-front')
      const cutout = await removeBackground(compressed)
      setFrontBlob(cutout)
      setFrontUrl(URL.createObjectURL(cutout))
      setStage('capture-back')
    } catch (err) {
      setError((err as Error).message)
      setStage('capture-front')
    }
  }

  async function handleBackCaptured(raw: Blob) {
    if (!frontBlob) return
    setError(null)
    try {
      const compressed = await compressImage(raw)
      setStage('removing-bg-back')
      const cutout = await removeBackground(compressed)
      setBackBlob(cutout)
      setBackUrl(URL.createObjectURL(cutout))

      if (mode === 'batch') {
        await batchQueue.enqueue(frontBlob, cutout)
        registerBatchSync()
        await refreshPendingCount()
        reset()
        return
      }

      setStage('extracting')
      const result = await coinApi.extractCoin(frontBlob, cutout)
      setFields(result.fields)
      setQualityScore(result.image_quality_score)
      setMintName(result.mint_name)
      setMarkImageUrl(result.mark_image_url)
      setStage('review')
    } catch (err) {
      setError((err as Error).message)
      setStage('capture-back')
    }
  }

  function reset() {
    setStage('capture-front')
    setFrontBlob(null)
    setBackBlob(null)
    if (frontUrl) URL.revokeObjectURL(frontUrl)
    if (backUrl) URL.revokeObjectURL(backUrl)
    setFrontUrl(null)
    setBackUrl(null)
    setFields(EMPTY_FIELDS)
    setQualityScore(null)
    setMintName(null)
    setMarkImageUrl(null)
    setError(null)
    setSavedId(null)
  }

  function handleSaved(id: number) {
    setSavedId(id)
    setStage('saved')
  }

  return (
    <div className="page">
      <h1>Capture</h1>

      <div className="mode-toggle">
        <button type="button" className={mode === 'immediate' ? 'active' : ''} onClick={() => handleModeChange('immediate')}>
          Immediate
        </button>
        <button type="button" className={mode === 'batch' ? 'active' : ''} onClick={() => handleModeChange('batch')}>
          Batch
        </button>
      </div>
      {mode === 'batch' && (
        <p className="page-hint">
          Captures are queued locally and processed automatically once the phone is on WiFi with the screen off. Check the
          Queue tab to review results.
          {pendingCount > 0 && ` (${pendingCount} queued)`}
        </p>
      )}

      {error && <p className="error">{error}</p>}

      {stage === 'capture-front' && <CameraCapture label="Front (obverse) of the coin" onCapture={handleFrontCaptured} />}

      {stage === 'removing-bg-front' && <p className="page-hint">Removing background…</p>}

      {stage === 'capture-back' && (
        <>
          {frontUrl && (
            <div className="side-preview">
              <img src={frontUrl} alt="Front captured" />
              <span className="page-hint">Front captured</span>
            </div>
          )}
          <CameraCapture label="Back (reverse) of the coin" onCapture={handleBackCaptured} />
        </>
      )}

      {stage === 'removing-bg-back' && (
        <>
          {frontUrl && (
            <div className="side-preview">
              <img src={frontUrl} alt="Front captured" />
            </div>
          )}
          <p className="page-hint">Removing background…</p>
        </>
      )}

      {stage === 'extracting' && (
        <>
          <div className="side-preview">
            {frontUrl && <img src={frontUrl} alt="Front" />}
            {backUrl && <img src={backUrl} alt="Back" />}
          </div>
          <p className="page-hint">Identifying coin…</p>
        </>
      )}

      {stage === 'review' && frontBlob && backBlob && (
        <CoinReviewForm
          frontUrl={frontUrl}
          backUrl={backUrl}
          frontBlob={frontBlob}
          backBlob={backBlob}
          initialFields={fields}
          initialQualityScore={qualityScore}
          initialMintName={mintName}
          initialMarkImageUrl={markImageUrl}
          onSaved={handleSaved}
          onDiscard={reset}
        />
      )}

      {stage === 'saved' && (
        <>
          <p className="page-hint">Saved coin #{savedId}.</p>
          <button type="button" onClick={reset}>
            Capture another
          </button>
        </>
      )}
    </div>
  )
}
