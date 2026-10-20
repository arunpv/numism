import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { coinApi, type Album, type Coin } from '../lib/api'

// Printable index card for an album: two cards, stuck inside the front and
// back covers, listing every coin in the album. Each album has its own card
// size (albums vary), so everything here is laid out in real millimetres and
// printed at true size — the screen view is the same sheets scaled down.
//
// Font size and column count are the user's call per album (readability vs.
// how many coins fit); this only reports whether the result fits.

const PT_MM = 25.4 / 72
const MM_PX = 96 / 25.4
const CARD_PADDING_MM = 4
const COLUMN_GAP_MM = 4
// Laser printers can't print to the paper edge; keep the card inside this.
const PRINTER_MARGIN_MM = 5
// Slack for header/border rules so rounding never pushes a row off the card.
const SLACK_MM = 1

const PAPERS = {
  A4: { w: 210, h: 297 },
  Letter: { w: 215.9, h: 279.4 },
} as const
type Paper = keyof typeof PAPERS

type Settings = { fontPt: number; columns: 1 | 2; paper: Paper }
const DEFAULT_SETTINGS: Settings = { fontPt: 8, columns: 1, paper: 'A4' }

function loadSettings(albumId: number): Settings {
  try {
    const raw = localStorage.getItem(`index-card:${albumId}`)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    // unavailable storage — defaults are fine
  }
  return DEFAULT_SETTINGS
}

function saveSettings(albumId: number, settings: Settings) {
  try {
    localStorage.setItem(`index-card:${albumId}`, JSON.stringify(settings))
  } catch {
    // unavailable storage — settings just won't be remembered
  }
}

// Album order: by page, then pocket; coins not yet placed go last.
function byPlacement(a: Coin, b: Coin): number {
  const page = (a.page_number ?? Infinity) - (b.page_number ?? Infinity)
  if (page) return page
  const pocket = (a.pocket_number ?? Infinity) - (b.pocket_number ?? Infinity)
  if (pocket) return pocket
  return a.country.localeCompare(b.country)
}

// Front card first, back card second. Prefer splitting between album pages so
// each card covers a clean page range; fall back to filling the front card
// row by row when a page-boundary split would leave coins off the cards.
function splitCards(sorted: Coin[], capacity: number) {
  if (sorted.length <= capacity) return { front: sorted, back: [] as Coin[], overflow: 0 }

  let frontCount = 0
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j < sorted.length && sorted[j].page_number === sorted[i].page_number) j++
    if (j > capacity) break
    frontCount = j
    i = j
  }
  if (frontCount === 0 || sorted.length - frontCount > capacity) frontCount = capacity

  const rest = sorted.slice(frontCount)
  return {
    front: sorted.slice(0, frontCount),
    back: rest.slice(0, capacity),
    overflow: Math.max(0, rest.length - capacity),
  }
}

function pageRangeLabel(coins: Coin[]): string {
  const pages = coins.map((c) => c.page_number).filter((p): p is number => p != null)
  const unplaced = coins.length - pages.length
  const parts: string[] = []
  if (pages.length) {
    const min = Math.min(...pages)
    const max = Math.max(...pages)
    parts.push(min === max ? `Page ${min}` : `Pages ${min}–${max}`)
  }
  if (unplaced) parts.push(`${unplaced} not placed`)
  return parts.join(' + ')
}

// Card position on the sheet: centred, in whichever orientation fits it
// better, scaled down only if it's bigger than the printable area.
function placeOnPaper(cardW: number, cardH: number, paper: Paper) {
  const p = PAPERS[paper]
  const fit = (pw: number, ph: number) =>
    Math.min(1, (pw - 2 * PRINTER_MARGIN_MM) / cardW, (ph - 2 * PRINTER_MARGIN_MM) / cardH)
  const portrait = fit(p.w, p.h)
  const landscape = fit(p.h, p.w)
  const useLandscape = landscape > portrait
  const sheetW = useLandscape ? p.h : p.w
  const sheetH = useLandscape ? p.w : p.h
  const scale = useLandscape ? landscape : portrait
  return {
    sheetW,
    sheetH,
    scale,
    landscape: useLandscape,
    left: (sheetW - cardW * scale) / 2,
    top: (sheetH - cardH * scale) / 2,
  }
}

export function IndexCard({ album, onBack }: { album: Album; onBack: () => void }) {
  const [coins, setCoins] = useState<Coin[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(() => loadSettings(album.id))
  const [clippedCount, setClippedCount] = useState(0)
  const [previewWidth, setPreviewWidth] = useState(0)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    coinApi
      .listCoins()
      .then(({ data }) => setCoins(data.filter((c) => c.album_id === album.id).sort(byPlacement)))
      .catch((e) => setError((e as Error).message))
  }, [album.id])

  function update(patch: Partial<Settings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(album.id, next)
  }

  const cardW = album.card_width_mm
  const cardH = album.card_height_mm
  const { fontPt, columns, paper } = settings

  const rowH = fontPt * PT_MM * 1.4
  const titleH = fontPt * 1.15 * PT_MM * 1.4 + 1.5
  const rowsPerColumn =
    cardH != null ? Math.max(0, Math.floor((cardH - 2 * CARD_PADDING_MM - titleH - rowH - SLACK_MM) / rowH)) : 0
  const capacity = rowsPerColumn * columns

  const cards = useMemo(() => {
    if (!coins || capacity === 0) return null
    return splitCards(coins, capacity)
  }, [coins, capacity])

  const placement = cardW != null && cardH != null ? placeOnPaper(cardW, cardH, paper) : null

  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setPreviewWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [placement != null])

  // Text cut off by a too-narrow column can't be predicted from font size
  // alone — measure it after layout.
  useLayoutEffect(() => {
    const cells = previewRef.current?.querySelectorAll<HTMLElement>('td.clip') ?? []
    let clipped = 0
    cells.forEach((cell) => {
      if (cell.scrollWidth > cell.clientWidth + 1) clipped++
    })
    setClippedCount(clipped)
  }, [cards, fontPt, columns, cardW, cardH])

  if (cardW == null || cardH == null || !placement) {
    return (
      <div className="page">
        <button type="button" className="back-link" onClick={onBack}>
          ← Back to albums
        </button>
        <h1>Index card — {album.name}</h1>
        <p className="page-hint">
          Set this album's card size first: on the Albums page, tap Edit and enter the card width and height in mm.
        </p>
      </div>
    )
  }

  const screenScale = previewWidth ? Math.min(1, previewWidth / (placement.sheetW * MM_PX)) : 1
  const sheets = cards
    ? [
        { side: 'Front cover', coins: cards.front },
        ...(cards.back.length ? [{ side: 'Back cover', coins: cards.back }] : []),
      ]
    : []

  return (
    <div className="page">
      <style>{`@page { size: ${placement.sheetW}mm ${placement.sheetH}mm; margin: 0; }`}</style>

      <div className="no-print">
        <button type="button" className="back-link" onClick={onBack}>
          ← Back to albums
        </button>
        <h1>Index card — {album.name}</h1>
        <p className="page-hint">
          Card {cardW} × {cardH} mm · one for the inside front cover, one for the back. Print on acid-free paper or card
          (120–150 GSM) and fix with photo corners or archival tape, not glue.
        </p>

        <div className="index-card-controls">
          <label>
            Font size {fontPt} pt
            <input
              type="range"
              min={6}
              max={11}
              step={0.5}
              value={fontPt}
              onChange={(e) => update({ fontPt: Number(e.target.value) })}
            />
          </label>
          <div className="mode-toggle">
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={columns === n ? 'active' : ''}
                onClick={() => update({ columns: n })}
              >
                {n} column{n > 1 ? 's' : ''}
              </button>
            ))}
          </div>
          <div className="mode-toggle">
            {(Object.keys(PAPERS) as Paper[]).map((p) => (
              <button key={p} type="button" className={paper === p ? 'active' : ''} onClick={() => update({ paper: p })}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        {!coins && !error && <p>Loading…</p>}
        {coins && <FitStatus coins={coins} capacity={capacity} cards={cards} columns={columns} fontPt={fontPt} />}
        {clippedCount > 0 && (
          <p className="error">
            {clippedCount} {clippedCount === 1 ? 'entry is' : 'entries are'} cut off (shown with …).{' '}
            {columns === 2 ? 'Try 1 column or a smaller font.' : 'Try a smaller font.'}
          </p>
        )}
        {placement.scale < 1 && (
          <p className="error">
            This card is bigger than {paper} paper allows, so it prints at {Math.floor(placement.scale * 100)}% — the
            text gets smaller too.
          </p>
        )}

        <button type="button" onClick={() => window.print()} disabled={!sheets.length}>
          Print
        </button>
        <p className="page-hint">In the print dialog, set scale to 100% (Actual size) and turn on background graphics.</p>
      </div>

      <div ref={previewRef} className="card-preview">
        {sheets.map((sheet) => (
          <div
            key={sheet.side}
            className="card-sheet-frame"
            style={{
              width: `${placement.sheetW * MM_PX * screenScale}px`,
              height: `${placement.sheetH * MM_PX * screenScale}px`,
            }}
          >
            <div
              className="card-sheet"
              style={{
                width: `${placement.sheetW}mm`,
                height: `${placement.sheetH}mm`,
                transform: `scale(${screenScale})`,
              }}
            >
              <div
                className="index-card"
                style={{
                  left: `${placement.left}mm`,
                  top: `${placement.top}mm`,
                  width: `${cardW}mm`,
                  height: `${cardH}mm`,
                  padding: `${CARD_PADDING_MM}mm`,
                  fontSize: `${fontPt}pt`,
                  transform: placement.scale < 1 ? `scale(${placement.scale})` : undefined,
                }}
              >
                <div className="index-card-title" style={{ height: `${titleH}mm`, fontSize: `${fontPt * 1.15}pt` }}>
                  <span>
                    <strong>{album.name}</strong> — {sheet.side}
                  </span>
                  <span>
                    {pageRangeLabel(sheet.coins)} · {sheet.coins.length} coins
                  </span>
                </div>
                <div className="index-card-columns" style={{ gap: `${COLUMN_GAP_MM}mm` }}>
                  {Array.from({ length: columns }, (_, col) => (
                    <CoinTable
                      key={col}
                      coins={sheet.coins.slice(col * rowsPerColumn, (col + 1) * rowsPerColumn)}
                      rowH={rowH}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FitStatus({
  coins,
  capacity,
  cards,
  columns,
  fontPt,
}: {
  coins: Coin[]
  capacity: number
  cards: ReturnType<typeof splitCards> | null
  columns: 1 | 2
  fontPt: number
}) {
  if (coins.length === 0) return <p className="page-hint">No coins in this album yet.</p>
  if (!cards) return <p className="error">The card is too small for even one row at {fontPt} pt.</p>
  if (cards.overflow > 0) {
    return (
      <p className="error">
        {cards.overflow} of {coins.length} coins don't fit on the two cards (room for {capacity} per card).{' '}
        {columns === 1 ? 'Try 2 columns or a smaller font.' : 'Try a smaller font.'}
      </p>
    )
  }
  return (
    <p className="page-hint">
      Fits — {cards.back.length ? `${cards.front.length} on the front, ${cards.back.length} on the back` : `all ${coins.length} on the front card`}{' '}
      (room for {capacity} per card).
      {fontPt < 7 && ' Below 7 pt gets hard to read — check a test print.'}
    </p>
  )
}

function CoinTable({ coins, rowH }: { coins: Coin[]; rowH: number }) {
  const cell = { height: `${rowH}mm`, lineHeight: `${rowH}mm` }
  return (
    <table className="index-card-table">
      <colgroup>
        <col style={{ width: '25%' }} />
        <col style={{ width: '29%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '14%' }} />
        <col style={{ width: '12%' }} />
      </colgroup>
      <thead>
        <tr>
          {['Country', 'Denomination', 'Year', 'Comm.', 'Rarity', 'Pg/Pkt'].map((h) => (
            <th key={h} style={cell}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {coins.map((c) => (
          <tr key={c.id}>
            <td className="clip" style={cell}>
              {c.country}
            </td>
            <td className="clip" style={cell}>
              {c.denomination}
            </td>
            <td className="clip" style={cell}>
              {c.mint_year ?? '—'}
            </td>
            <td className="clip" style={cell}>
              {c.commemorative_theme ? 'Yes' : 'No'}
            </td>
            <td className="clip" style={cell}>
              {c.rarity ?? '—'}
            </td>
            <td className="clip" style={cell}>
              {c.page_number != null ? `${c.page_number}/${c.pocket_number ?? '—'}` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
