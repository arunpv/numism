import { useEffect, useState } from 'react'
import { coinApi, referenceApi, type CoinFields, type DuplicateMatch } from '../lib/api'
import { compressImage } from '../lib/image'
import { CameraCapture } from '../components/CameraCapture'

type Stage = 'capture-front' | 'capture-back' | 'extracting' | 'review' | 'saving' | 'saved'

const EMPTY_FIELDS: CoinFields = {
  country: '',
  denomination: '',
  mint_year: null,
  mint_mark: '',
  commemorative_theme: null,
}

export function CapturePage() {
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
  const [notes, setNotes] = useState('')
  const [matches, setMatches] = useState<DuplicateMatch[]>([])
  const [checkingDup, setCheckingDup] = useState(false)
  const [savedId, setSavedId] = useState<number | null>(null)
  const [addingMint, setAddingMint] = useState(false)
  const [newMintName, setNewMintName] = useState('')
  const [savingMint, setSavingMint] = useState(false)

  useEffect(() => {
    return () => {
      if (frontUrl) URL.revokeObjectURL(frontUrl)
      if (backUrl) URL.revokeObjectURL(backUrl)
    }
  }, [frontUrl, backUrl])

  async function handleFrontCaptured(raw: Blob) {
    setError(null)
    try {
      const compressed = await compressImage(raw)
      setFrontBlob(compressed)
      setFrontUrl(URL.createObjectURL(compressed))
      setStage('capture-back')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleBackCaptured(raw: Blob) {
    if (!frontBlob) return
    setError(null)
    try {
      const compressed = await compressImage(raw)
      setBackBlob(compressed)
      setBackUrl(URL.createObjectURL(compressed))
      setStage('extracting')

      const result = await coinApi.extractCoin(frontBlob, compressed)
      setFields(result.fields)
      setQualityScore(result.image_quality_score)
      setMintName(result.mint_name)
      setMarkImageUrl(result.mark_image_url)
      setStage('review')
      await runDuplicateCheck(result.fields)
    } catch (err) {
      setError((err as Error).message)
      setStage('capture-back')
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
      const { mint_name, mark_image_url } = await coinApi.resolveMint(fields.country, fields.mint_mark)
      setMintName(mint_name)
      setMarkImageUrl(mark_image_url)
    } catch {
      // best-effort preview lookup; save still resolves server-side
    }
  }

  async function handleAddMint() {
    if (!fields.country || !fields.mint_mark || !newMintName.trim()) return
    setSavingMint(true)
    setError(null)
    try {
      await referenceApi.createMint(fields.country, fields.mint_mark, newMintName.trim())
      const { mint_name, mark_image_url } = await coinApi.resolveMint(fields.country, fields.mint_mark)
      setMintName(mint_name)
      setMarkImageUrl(mark_image_url)
      setAddingMint(false)
      setNewMintName('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingMint(false)
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
    setNotes('')
    setMatches([])
    setError(null)
    setSavedId(null)
    setAddingMint(false)
    setNewMintName('')
  }

  async function handleSaveNew() {
    if (!frontBlob || !backBlob) return
    setStage('saving')
    setError(null)
    try {
      const { id } = await coinApi.saveCoin(fields, notes, qualityScore, frontBlob, backBlob)
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
      const { id } = await coinApi.saveDuplicate(
        matchId,
        replaceImage,
        notes,
        replaceImage ? frontBlob : null,
        replaceImage ? backBlob : null,
        replaceImage ? qualityScore : null,
      )
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

      {stage === 'capture-front' && <CameraCapture label="Front (obverse) of the coin" onCapture={handleFrontCaptured} />}

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

      {stage === 'extracting' && (
        <>
          <div className="side-preview">
            {frontUrl && <img src={frontUrl} alt="Front" />}
            {backUrl && <img src={backUrl} alt="Back" />}
          </div>
          <p className="page-hint">Identifying coin…</p>
        </>
      )}

      {(stage === 'review' || stage === 'saving') && (
        <div className="capture-review">
          <div className="side-preview">
            {frontUrl && <img src={frontUrl} alt="Front" />}
            {backUrl && <img src={backUrl} alt="Back" />}
          </div>

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

          <label>
            Commemorative theme
            <input
              placeholder="Leave blank for a standard coin"
              value={fields.commemorative_theme ?? ''}
              onChange={(e) => setFields({ ...fields, commemorative_theme: e.target.value || null })}
              onBlur={handleFieldBlur}
            />
          </label>

          {mintName && (
            <p className="page-hint">
              Mint: {mintName}
              {markImageUrl && <img src={markImageUrl} alt="Reference mint mark" className="mark-image-preview" />}
            </p>
          )}

          {!mintName && fields.country && fields.mint_mark && !addingMint && (
            <div className="page-hint">
              No mint on file for {fields.country} / {fields.mint_mark}.{' '}
              <button type="button" className="mint-image-btn" onClick={() => setAddingMint(true)}>
                Add it now
              </button>
            </div>
          )}

          {addingMint && (
            <div className="add-mint-inline">
              <p className="page-hint">
                New mint: {fields.country} / {fields.mint_mark}
              </p>
              <input
                placeholder="Mint name (e.g. Denver)"
                value={newMintName}
                onChange={(e) => setNewMintName(e.target.value)}
              />
              <button type="button" onClick={handleAddMint} disabled={savingMint || !newMintName.trim()}>
                {savingMint ? 'Saving…' : 'Save mint'}
              </button>
              <p className="page-hint">You can attach a reference photo for this mark later from the Mints tab.</p>
            </div>
          )}

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
                        Duplicate — keep existing photos
                      </button>
                      <button type="button" onClick={() => handleConfirmDuplicate(m.id, true)} disabled={stage === 'saving'}>
                        Duplicate — replace photos
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
