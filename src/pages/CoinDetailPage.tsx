import { useEffect, useState } from 'react'
import { coinApi, referenceApi, type Album, type CoinDetail, type CoinEditFields } from '../lib/api'

type Props = {
  coinId: number
  onBack: () => void
}

export function CoinDetailPage({ coinId, onBack }: Props) {
  const [coin, setCoin] = useState<CoinDetail | null>(null)
  const [albums, setAlbums] = useState<Album[]>([])
  const [fields, setFields] = useState<CoinEditFields | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    load()
  }, [coinId])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [{ data: coinData }, { data: albumData }] = await Promise.all([
        coinApi.getCoin(coinId),
        referenceApi.listAlbums(),
      ])
      setCoin(coinData)
      setAlbums(albumData)
      setFields({
        country: coinData.country,
        denomination: coinData.denomination,
        mint_year: coinData.mint_year,
        mint_mark: coinData.mint_mark,
        commemorative_theme: coinData.commemorative_theme,
        personal_notes: coinData.personal_notes,
        album_id: coinData.album_id,
        page_number: coinData.page_number,
        pocket_number: coinData.pocket_number,
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!fields) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const { data } = await coinApi.updateCoin(coinId, fields)
      setCoin(data)
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !fields) {
    return (
      <div className="page">
        <button type="button" className="back-link" onClick={onBack}>
          ← Back to Coins
        </button>
        {error ? <p className="error">{error}</p> : <p>Loading…</p>}
      </div>
    )
  }

  return (
    <div className="page">
      <button type="button" className="back-link" onClick={onBack}>
        ← Back to Coins
      </button>
      <h1>Coin #{coinId}</h1>

      {error && <p className="error">{error}</p>}
      {saved && <p className="page-hint">Saved.</p>}

      <div className="side-preview">
        {coin?.thumbnail_url && <img src={coin.thumbnail_url} alt="Front" />}
        {coin?.back_thumbnail_url && <img src={coin.back_thumbnail_url} alt="Back" />}
      </div>

      <div className="capture-review">
        <label>
          Country
          <input value={fields.country} onChange={(e) => setFields({ ...fields, country: e.target.value })} />
        </label>
        <label>
          Denomination
          <input
            value={fields.denomination}
            onChange={(e) => setFields({ ...fields, denomination: e.target.value })}
          />
        </label>
        <label>
          Mint year
          <input
            type="number"
            value={fields.mint_year ?? ''}
            onChange={(e) => setFields({ ...fields, mint_year: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
        <label>
          Mint mark
          <input
            value={fields.mint_mark ?? ''}
            onChange={(e) => setFields({ ...fields, mint_mark: e.target.value || null })}
          />
        </label>
        {coin?.mints && <p className="page-hint">Mint: {coin.mints.mint_name}</p>}
        <label>
          Commemorative theme
          <input
            placeholder="Leave blank for a standard coin"
            value={fields.commemorative_theme ?? ''}
            onChange={(e) => setFields({ ...fields, commemorative_theme: e.target.value || null })}
          />
        </label>
        <label>
          Notes
          <textarea
            value={fields.personal_notes ?? ''}
            onChange={(e) => setFields({ ...fields, personal_notes: e.target.value || null })}
            rows={2}
          />
        </label>
        <label>
          Album
          <select
            value={fields.album_id ?? ''}
            onChange={(e) => setFields({ ...fields, album_id: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Not placed</option>
            {albums.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {fields.album_id != null && (
          <>
            <label>
              Page number
              <input
                type="number"
                value={fields.page_number ?? ''}
                onChange={(e) => setFields({ ...fields, page_number: e.target.value ? Number(e.target.value) : null })}
              />
            </label>
            <label>
              Pocket number
              <input
                type="number"
                value={fields.pocket_number ?? ''}
                onChange={(e) =>
                  setFields({ ...fields, pocket_number: e.target.value ? Number(e.target.value) : null })
                }
              />
            </label>
          </>
        )}

        <div className="capture-actions">
          <button type="button" onClick={handleSave} disabled={saving || !fields.country || !fields.denomination}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
