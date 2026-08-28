import { useEffect, useState } from 'react'
import { referenceApi, type Mint } from '../lib/api'

export function MintsPage() {
  const [mints, setMints] = useState<Mint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [country, setCountry] = useState('')
  const [mintMark, setMintMark] = useState('')
  const [mintName, setMintName] = useState('')
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
      await referenceApi.createMint(country, mintMark, mintName)
      setCountry('')
      setMintMark('')
      setMintName('')
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

  const byCountry = mints.reduce<Record<string, Mint[]>>((acc, m) => {
    ;(acc[m.country] ??= []).push(m)
    return acc
  }, {})

  return (
    <div className="page">
      <h1>Mints</h1>
      <p className="page-hint">
        Pre-populate known mint marks per country before scanning a batch. Once a country has marks on file, coin
        extraction reads them more accurately by matching against this list.
      </p>

      <form className="add-form" onSubmit={handleAdd}>
        <input placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} required />
        <input placeholder="Mint mark (e.g. D, circle)" value={mintMark} onChange={(e) => setMintMark(e.target.value)} required />
        <input placeholder="Mint name (e.g. Denver)" value={mintName} onChange={(e) => setMintName(e.target.value)} required />
        <button type="submit" disabled={saving}>
          {saving ? 'Adding…' : 'Add mint'}
        </button>
      </form>

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
                <li key={m.id}>
                  <span>
                    <strong>{m.mint_mark}</strong> — {m.mint_name}
                  </span>
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
