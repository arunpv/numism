import { useEffect, useRef, useState } from 'react'
import { coinApi, type CoinFields, type DuplicateMatch } from '../lib/api'
import { compressImage } from '../lib/image'

type Stage = 'idle' | 'extracting' | 'review' | 'saving' | 'saved'

const EMPTY_FIELDS: CoinFields = { country: '', denomination: '', mint_year: null, mint_mark: '' }

export function CapturePage() {
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [fields, setFields] = useState<CoinFields>(EMPTY_FIELDS)
  const [qualityScore, setQualityScore] = useState<number | null>(null)
  const [mintName, setMintName] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [matches, setMatches] = useState<DuplicateMatch[]>([])
  const [checkingDup, setCheckingDup] = useState(false)
  const [savedId, setSavedId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    setMatches([])
    setSavedId(null)
    setNotes('')
    try {
      const compressed = await compressImage(file)
      setImageBlob(compressed)
      setPreviewUrl(URL.createObjectURL(compressed))
      setStage('extracting')

      const result = await coinApi.extractCoin(compressed)
      setFields(result.fields)
      setQualityScore(result.image_quality_score)
      setMintName(result.mint_name)
      setStage('review')
      await runDuplicateCheck(result.fields)
    } catch (err) {
      setError((err as Error).message)
      setStage('idle')
    }
  }

  async function runDuplicateCheck(candidate: CoinFields) {
    if (!candidate.country || !candidate.denomination) return
    setCheckingDup(true)
    try {
      const { matches } = await coinApi.checkDuplicate(candidate)
      setMatches(matches)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCheckingDup(false)
    }
  }

  async function handleFieldBlur() {
    await runDuplicateCheck(fields)
    try {
      const { mint_name } = await coinApi.resolveMint(fields.country, fields.mint_mark)
      setMintName(mint_name)
    } catch {
      // best-effort preview lookup; save still resolves server-side
    }
  }

  function reset() {
    setStage('idle')
    setImageBlob(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setFields(EMPTY_FIELDS)
    setQualityScore(null)
    setMintName(null)
    setNotes('')
    setMatches([])
    setError(null)
    setSavedId(null)
  }

  async function handleSaveNew() {
    if (!imageBlob) return
    setStage('saving')
    setError(null)
    try {
      const { id } = await coinApi.saveCoin(fields, notes, qualityScore, imageBlob)
      setSavedId(id)
      setStage('saved')
    } catch (err) {
      setError((err as Error).message)
      setStage('review')
    }
  }

  async function handleConfirmDuplicate(matchId: number, replaceImage: boolean) {
    setStage('saving')
    setError(null)
    try {
      const { id } = await coinApi.saveDuplicate(matchId, replaceImage, notes, replaceImage ? imageBlob : null, replaceImage ? qualityScore : null)
      setSavedId(id)
      setStage('saved')
    } catch (err) {
      setError((err as Error).message)
      setStage('review')
    }
  }

  return (
    <div className="page">
      <h1>Capture</h1>

      {error && <p className="error">{error}</p>}

      {stage === 'idle' && (
        <>
          <p className="page-hint">Take a photo of a coin to identify and log it.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelected}
            style={{ display: 'none' }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Take / choose photo
          </button>
        </>
      )}

      {stage === 'extracting' && (
        <>
          {previewUrl && <img src={previewUrl} alt="Captured coin" className="capture-preview" />}
          <p className="page-hint">Identifying coin…</p>
        </>
      )}

      {(stage === 'review' || stage === 'saving') && (
        <div className="capture-review">
          {previewUrl && <img src={previewUrl} alt="Captured coin" className="capture-preview" />}

          <label>
            Country
            <input value={fields.country} onChange={(e) => setFields({ ...fields, country: e.target.value })} onBlur={handleFieldBlur} />
          </label>
          <label>
            Denomination
            <input
              value={fields.denomination}
              onChange={(e) => setFields({ ...fields, denomination: e.target.value })}
              onBlur={handleFieldBlur}
            />
          </label>
          <label>
            Mint year
            <input
              type="number"
              value={fields.mint_year ?? ''}
              onChange={(e) => setFields({ ...fields, mint_year: e.target.value ? Number(e.target.value) : null })}
              onBlur={handleFieldBlur}
            />
          </label>
          <label>
            Mint mark
            <input
              value={fields.mint_mark ?? ''}
              onChange={(e) => setFields({ ...fields, mint_mark: e.target.value || null })}
              onBlur={handleFieldBlur}
            />
          </label>
          {mintName && <p className="page-hint">Mint: {mintName}</p>}
          {qualityScore != null && <p className="page-hint">Image quality score: {qualityScore}</p>}
          <label>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>

          {checkingDup && <p className="page-hint">Checking for duplicates…</p>}

          {matches.length > 0 && (
            <div className="duplicate-banner">
              <p>
                <strong>Possible duplicate{matches.length > 1 ? 's' : ''} found.</strong> Is this the same coin you
                already own?
              </p>
              {matches.map((m) => (
                <div className="duplicate-match" key={m.id}>
                  {m.thumbnail_url && <img src={m.thumbnail_url} alt="Existing coin" />}
                  <div className="duplicate-match-info">
                    <p>
                      Owned: {m.quantity} · Existing quality: {m.image_quality_score ?? '—'} · New quality:{' '}
                      {qualityScore ?? '—'}
                    </p>
                    {m.personal_notes && <p className="page-hint">{m.personal_notes}</p>}
                    <div className="duplicate-actions">
                      <button type="button" onClick={() => handleConfirmDuplicate(m.id, false)} disabled={stage === 'saving'}>
                        Duplicate — keep existing photo
                      </button>
                      <button type="button" onClick={() => handleConfirmDuplicate(m.id, true)} disabled={stage === 'saving'}>
                        Duplicate — replace photo
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={handleSaveNew} disabled={stage === 'saving'}>
                Not a duplicate — save as new
              </button>
            </div>
          )}

          {matches.length === 0 && !checkingDup && (
            <div className="capture-actions">
              <button type="button" onClick={handleSaveNew} disabled={stage === 'saving' || !fields.country || !fields.denomination}>
                {stage === 'saving' ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="secondary" onClick={reset} disabled={stage === 'saving'}>
                Discard
              </button>
            </div>
          )}
        </div>
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
