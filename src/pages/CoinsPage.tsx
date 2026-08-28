import { useEffect, useState } from 'react'
import { coinApi, type Coin } from '../lib/api'

export function CoinsPage() {
  const [coins, setCoins] = useState<Coin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data } = await coinApi.listCoins()
      setCoins(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <h1>Coins</h1>
      <p className="page-hint">Your saved collection, most recent first.</p>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : coins.length === 0 ? (
        <p className="page-hint">No coins saved yet — use the Capture tab to log one.</p>
      ) : (
        <ul className="coin-list">
          {coins.map((c) => (
            <li key={c.id} className="coin-card">
              {c.thumbnail_url ? (
                <img src={c.thumbnail_url} alt={`${c.country} ${c.denomination}`} className="coin-card-thumb" />
              ) : (
                <span className="coin-card-thumb coin-card-thumb-empty" />
              )}
              <div className="coin-card-body">
                <p className="coin-card-title">
                  {c.country} — {c.denomination}
                  {c.mint_year != null && ` (${c.mint_year})`}
                </p>
                <p className="page-hint coin-card-meta">
                  {c.mint_mark && `Mark: ${c.mint_mark}${c.mints ? ` — ${c.mints.mint_name}` : ''}`}
                  {c.commemorative_theme && (c.mint_mark ? ' · ' : '') + `Commemorative: ${c.commemorative_theme}`}
                  {c.quantity > 1 && (c.mint_mark || c.commemorative_theme ? ' · ' : '') + `Owned: ${c.quantity}`}
                </p>
                <p className="page-hint coin-card-meta">
                  {c.albums ? `In album: ${c.albums.name}` : 'Not placed in an album'}
                  {c.albums && c.page_number != null && ` · page ${c.page_number}`}
                  {c.albums && c.pocket_number != null && ` · pocket ${c.pocket_number}`}
                </p>
                {c.personal_notes && <p className="page-hint coin-card-meta">{c.personal_notes}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
