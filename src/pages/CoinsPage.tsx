import { useEffect, useMemo, useState } from 'react'
import { coinApi, type Coin } from '../lib/api'
import { CoinDetailPage } from './CoinDetailPage'

type Filters = {
  country: string
  denomination: string
  mint_year: string
  mint_mark: string
  commemorative_theme: string
  album: string
}

const EMPTY_FILTERS: Filters = {
  country: '',
  denomination: '',
  mint_year: '',
  mint_mark: '',
  commemorative_theme: '',
  album: '',
}

function distinct(values: (string | number | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string | number => v != null && v !== '').map(String))].sort()
}

export function CoinsPage() {
  const [coins, setCoins] = useState<Coin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

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

  const options = useMemo(
    () => ({
      country: distinct(coins.map((c) => c.country)),
      denomination: distinct(coins.map((c) => c.denomination)),
      mint_year: distinct(coins.map((c) => c.mint_year)),
      mint_mark: distinct(coins.map((c) => c.mint_mark)),
      commemorative_theme: distinct(coins.map((c) => c.commemorative_theme)),
      album: distinct(coins.map((c) => c.albums?.name)),
    }),
    [coins],
  )

  const filteredCoins = useMemo(
    () =>
      coins.filter((c) => {
        if (filters.country && c.country !== filters.country) return false
        if (filters.denomination && c.denomination !== filters.denomination) return false
        if (filters.mint_year && String(c.mint_year ?? '') !== filters.mint_year) return false
        if (filters.mint_mark && (c.mint_mark ?? '') !== filters.mint_mark) return false
        if (filters.commemorative_theme && (c.commemorative_theme ?? '') !== filters.commemorative_theme) return false
        if (filters.album && (c.albums?.name ?? '') !== filters.album) return false
        return true
      }),
    [coins, filters],
  )

  const hasActiveFilters = Object.values(filters).some(Boolean)

  if (selectedId != null) {
    return (
      <CoinDetailPage
        coinId={selectedId}
        onBack={() => {
          setSelectedId(null)
          load()
        }}
      />
    )
  }

  return (
    <div className="page">
      <h1>Coins</h1>
      <p className="page-hint">Your saved collection, most recent first.</p>

      {error && <p className="error">{error}</p>}

      {coins.length > 0 && (
        <div className="filter-bar">
          <select value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })}>
            <option value="">All countries</option>
            {options.country.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={filters.denomination}
            onChange={(e) => setFilters({ ...filters, denomination: e.target.value })}
          >
            <option value="">All denominations</option>
            {options.denomination.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select value={filters.mint_year} onChange={(e) => setFilters({ ...filters, mint_year: e.target.value })}>
            <option value="">All years</option>
            {options.mint_year.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select value={filters.mint_mark} onChange={(e) => setFilters({ ...filters, mint_mark: e.target.value })}>
            <option value="">All mint marks</option>
            {options.mint_mark.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={filters.commemorative_theme}
            onChange={(e) => setFilters({ ...filters, commemorative_theme: e.target.value })}
          >
            <option value="">All themes</option>
            {options.commemorative_theme.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select value={filters.album} onChange={(e) => setFilters({ ...filters, album: e.target.value })}>
            <option value="">All albums</option>
            {options.album.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {hasActiveFilters && (
            <button type="button" className="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : coins.length === 0 ? (
        <p className="page-hint">No coins saved yet — use the Capture tab to log one.</p>
      ) : filteredCoins.length === 0 ? (
        <p className="page-hint">No coins match these filters.</p>
      ) : (
        <ul className="coin-list">
          {filteredCoins.map((c) => (
            <li key={c.id} className="coin-card coin-card-clickable" onClick={() => setSelectedId(c.id)}>
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
