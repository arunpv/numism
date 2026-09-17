import { useEffect, useState } from 'react'
import { referenceApi, type Mint, type MintMarkPosition } from '../lib/api'

type ConditionType = 'default' | 'year_range' | 'position'

function conditionLabel(m: Mint): string {
  if (m.condition_type === 'year_range') return `${m.year_min}–${m.year_max}`
  if (m.condition_type === 'position') return m.position === 'first_digit' ? 'below first digit' : 'below last digit'
  return ''
}

export function MintsPage() {
  const [mints, setMints] = useState<Mint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [country, setCountry] = useState('')
  const [mintMark, setMintMark] = useState('')
  const [mintName, setMintName] = useState('')
  const [conditionType, setConditionType] = useState<ConditionType>('default')
  const [yearMin, setYearMin] = useState('')
  const [yearMax, setYearMax] = useState('')
  const [position, setPosition] = useState<MintMarkPosition>('first_digit')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data } = await referenceApi.listMints()
      setMints(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const condition =
        conditionType === 'year_range'
          ? ({ type: 'year_range', year_min: Number(yearMin), year_max: Number(yearMax) } as const)
          : conditionType === 'position'
            ? ({ type: 'position', position } as const)
            : undefined
      await referenceApi.createMint(country, mintMark, mintName, condition)
      setCountry('')
      setMintMark('')
      setMintName('')
      setConditionType('default')
      setYearMin('')
      setYearMax('')
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setError(null)
    try {
      await referenceApi.deleteMint(id)
      setMints((prev) => prev.filter((m) => m.id !== id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleImageChange(mint: Mint, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    setError(null)
    try {
      const { mark_image_url } = await referenceApi.uploadMintImage(mint.mint_id, file)
      setMints((prev) => prev.map((m) => (m.mint_id === mint.mint_id ? { ...m, mark_image_url } : m)))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const byCountry = mints.reduce<Record<string, Mint[]>>((acc, m) => {
    ;(acc[m.country] ??= []).push(m)
    return acc
  }, {})

  return (
    <div className="page">
      <h1>Mints</h1>
      <p className="page-hint">
        Pre-populate known mint marks per country before scanning a batch. Once a country has marks on file, coin
        extraction reads them more accurately by matching against this list. `Mint mark` stays a short text
        description (e.g. "D", "circle") — attach a reference photo below for marks that are hard to describe in
        words.
      </p>

      <form className="add-form" onSubmit={handleAdd}>
        <input placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} required />
        <input placeholder="Mint mark (e.g. D, circle)" value={mintMark} onChange={(e) => setMintMark(e.target.value)} required />
        <input placeholder="Mint name (e.g. Denver)" value={mintName} onChange={(e) => setMintName(e.target.value)} required />
        <select value={conditionType} onChange={(e) => setConditionType(e.target.value as ConditionType)}>
          <option value="default">Always means this mint</option>
          <option value="year_range">Only for a year range</option>
          <option value="position">Only when the mark is in this position</option>
        </select>
        {conditionType === 'year_range' && (
          <>
            <input
              type="number"
              placeholder="From year"
              value={yearMin}
              onChange={(e) => setYearMin(e.target.value)}
              required
            />
            <input
              type="number"
              placeholder="To year"
              value={yearMax}
              onChange={(e) => setYearMax(e.target.value)}
              required
            />
          </>
        )}
        {conditionType === 'position' && (
          <select value={position} onChange={(e) => setPosition(e.target.value as MintMarkPosition)}>
            <option value="first_digit">Below first digit of year</option>
            <option value="last_digit">Below last digit of year</option>
          </select>
        )}
        <button type="submit" disabled={saving}>
          {saving ? 'Adding…' : 'Add rule'}
        </button>
      </form>
      <p className="page-hint">
        Adding a rule for a mint name already on file (same country + name) reuses that mint identity — use this to
        give one mint more than one rule, e.g. a plain default plus a year-range or position override for the same
        mark.
      </p>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : mints.length === 0 ? (
        <p className="page-hint">No mints on file yet.</p>
      ) : (
        Object.entries(byCountry).map(([c, list]) => (
          <div key={c} className="group">
            <h2>{c}</h2>
            <ul className="list">
              {list.map((m) => (
                <li key={m.id} className="mint-row">
                  {m.mark_image_url ? (
                    <img src={m.mark_image_url} alt={`${m.mint_mark} reference`} className="mint-mark-thumb" />
                  ) : (
                    <span className="mint-mark-thumb mint-mark-thumb-empty" />
                  )}
                  <span className="mint-row-text">
                    <strong>{m.mint_mark}</strong>
                    {conditionLabel(m) && <span className="page-hint"> ({conditionLabel(m)})</span>} — {m.mint_name}
                  </span>
                  <label className="mint-image-btn">
                    {m.mark_image_url ? 'Replace photo' : 'Add photo'}
                    <input type="file" accept="image/*" onChange={(e) => handleImageChange(m, e)} />
                  </label>
                  <button type="button" className="delete-btn" onClick={() => handleDelete(m.id)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  )
}
