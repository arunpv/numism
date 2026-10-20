import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { coinApi, type Album, type Coin } from '../lib/api'

// Printable index card for an album: two cards, stuck inside the front and
// back covers, listing every coin in the album. Each album has its own card
// size (albums vary), so everything here is laid out in real millimetres and
// printed at true size — the screen view is the same sheets scaled down.
//
// Font size, column count and fold-out panels are the user's call per album
// (readability vs. how many coins fit); this only reports whether it fits.
//
// Fold-out: each cover card gets a second panel of the same size, hinged at
// the cover's outer edge (away from the spine) so it folds flat over the
// card. Front cover's outer edge is its right side, back cover's its left.

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

// marginMm: gap left between the card and the cover's edges on each side,
// so the card clears the hinge and the cover edges.
type Settings = { fontPt: number; columns: 1 | 2; paper: Paper; foldOut: boolean; marginMm: number }
const DEFAULT_SETTINGS: Settings = { fontPt: 8, columns: 1, paper: 'A4', foldOut: false, marginMm: 2 }

type Panel = { side: string; coins: Coin[] }

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

// Fills `panelCount` panels in order. Prefers splitting between album pages
// so each panel covers a clean page range; falls back to filling panels row
// by row when a page-boundary split would leave coins off the panels.
function splitPanels(sorted: Coin[], capacity: number, panelCount: number) {
  const byPage: Coin[][] = []
  let start = 0
  for (let p = 0; p < panelCount && start < sorted.length; p++) {
    let end = start
    let j = start
    while (j < sorted.length) {
      let k = j
      while (k < sorted.length && sorted[k].page_number === sorted[j].page_number) k++
      if (k - start > capacity) break
      end = k
      j = k
    }
    // A single album page bigger than a panel: split it mid-page.
    if (end === start) end = Math.min(sorted.length, start + capacity)
    byPage.push(sorted.slice(start, end))
    start = end
  }
  if (start >= sorted.length) return { panels: byPage, overflow: 0 }

  const byRow: Coin[][] = []
  for (let p = 0; p < panelCount && p * capacity < sorted.length; p++) {
    byRow.push(sorted.slice(p * capacity, (p + 1) * capacity))
  }
  return { panels: byRow, overflow: Math.max(0, sorted.length - panelCount * capacity) }
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

  const { fontPt, columns, paper, foldOut, marginMm } = settings
  const coverW = album.cover_width_mm
  const coverH = album.cover_height_mm
  const sizeFrom = (cover: number | null) => (cover != null && cover - 2 * marginMm > 0 ? cover - 2 * marginMm : null)
  const cardW = sizeFrom(coverW)
  const cardH = sizeFrom(coverH)
  const sides = foldOut ? ['Front cover', 'Front fold-out', 'Back cover', 'Back fold-out'] : ['Front cover', 'Back cover']

  const rowH = fontPt * PT_MM * 1.4
  const titleH = fontPt * 1.15 * PT_MM * 1.4 + 1.5
  const rowsPerColumn =
    cardH != null ? Math.max(0, Math.floor((cardH - 2 * CARD_PADDING_MM - titleH - rowH - SLACK_MM) / rowH)) : 0
  const capacity = rowsPerColumn * columns

  const split = useMemo(() => {
    if (!coins || capacity === 0) return null
    return splitPanels(coins, capacity, sides.length)
  }, [coins, capacity, sides.length])

  const panels: Panel[] = split ? split.panels.map((c, i) => ({ side: sides[i], coins: c })) : []

  // Each printed piece is one panel, or — when a cover's two panels fit side
  // by side on the paper without shrinking — both joined with a fold line,
  // so nothing needs taping. Back cover's fold-out sits to its left.
  const joinFoldOut =
    foldOut && cardW != null && cardH != null && placeOnPaper(2 * cardW, cardH, paper).scale === 1
  const pieces: Panel[][] = []
  if (joinFoldOut) {
    const front = panels.filter((p) => p.side.startsWith('Front'))
    const back = panels.filter((p) => p.side.startsWith('Back')).reverse()
    if (front.length) pieces.push(front)
    if (back.length) pieces.push(back)
  } else {
    panels.forEach((p) => pieces.push([p]))
  }

  const placement =
    cardW != null && cardH != null ? placeOnPaper(cardW * (joinFoldOut ? 2 : 1), cardH, paper) : null

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
  }, [split, fontPt, columns, cardW, cardH, foldOut, paper])

  const marginControl = (
    <label>
      Margin {marginMm} mm each side
      <input
        type="range"
        min={0}
        max={10}
        step={0.5}
        value={marginMm}
        onChange={(e) => update({ marginMm: Number(e.target.value) })}
      />
    </label>
  )

  if (cardW == null || cardH == null || !placement) {
    return (
      <div className="page">
        <button type="button" className="back-link" onClick={onBack}>
          ← Back to albums
        </button>
        <h1>Index card</h1>
        {coverW == null || coverH == null ? (
          <p className="page-hint">
            {album.name} — set this album's cover size first: on the Albums page, tap Edit and enter the inside cover's
            width and height in mm.
          </p>
        ) : (
          <>
            <p className="error">
              A {marginMm} mm margin leaves no room inside a {coverW} × {coverH} mm cover.
            </p>
            <div className="index-card-controls">{marginControl}</div>
          </>
        )}
      </div>
    )
  }

  const screenScale = previewWidth ? Math.min(1, previewWidth / (placement.sheetW * MM_PX)) : 1

  return (
    <div className="page">
      <style>{`@page { size: ${placement.sheetW}mm ${placement.sheetH}mm; margin: 0; }`}</style>

      <div className="no-print">
        <button type="button" className="back-link" onClick={onBack}>
          ← Back to albums
        </button>
        <h1>Index card</h1>
        <p className="page-hint">
          {album.name} · cover {coverW} × {coverH} mm → card {cardW} × {cardH} mm · one for the inside front cover, one
          for the back. Print on acid-free paper or card (120–150 GSM), hold it with clear acid-free photo corners and
          hinge any separate fold-out with linen tape, not glue. Cut along the dashed line
          {joinFoldOut && ', fold along the dotted one'}.
        </p>

        <div className="index-card-controls">
          {marginControl}
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
          <div className="mode-toggle">
            <button type="button" className={!foldOut ? 'active' : ''} onClick={() => update({ foldOut: false })}>
              No fold-out
            </button>
            <button type="button" className={foldOut ? 'active' : ''} onClick={() => update({ foldOut: true })}>
              Fold-out
            </button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        {!coins && !error && <p>Loading…</p>}
        {coins && (
          <FitStatus
            coins={coins}
            capacity={capacity}
            split={split}
            panels={panels}
            columns={columns}
            fontPt={fontPt}
            foldOut={foldOut}
          />
        )}
        {foldOut && !joinFoldOut && panels.length > 1 && (
          <p className="page-hint">
            Two panels side by side don't fit on {paper}, so each prints on its own sheet. Join each fold-out to its
            cover card along the outer edge (away from the spine) with archival tape, so it folds flat over the card.
          </p>
        )}
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

        <button type="button" onClick={() => window.print()} disabled={!pieces.length}>
          Print
        </button>
        <p className="page-hint">In the print dialog, set scale to 100% (Actual size) and turn on background graphics.</p>
      </div>

      <div ref={previewRef} className="card-preview">
        {pieces.map((piece) => (
          <div
            key={piece[0].side}
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
                  width: `${cardW * piece.length}mm`,
                  height: `${cardH}mm`,
                  fontSize: `${fontPt}pt`,
                  transform: placement.scale < 1 ? `scale(${placement.scale})` : undefined,
                }}
              >
                {piece.map((panel) => (
                  <div
                    key={panel.side}
                    className="index-card-panel"
                    style={{ width: `${cardW}mm`, height: `${cardH}mm`, padding: `${CARD_PADDING_MM}mm` }}
                  >
                    <div className="index-card-title" style={{ height: `${titleH}mm`, fontSize: `${fontPt * 1.15}pt` }}>
                      <span>
                        <strong>{album.name}</strong> — {panel.side}
                      </span>
                      <span>
                        {pageRangeLabel(panel.coins)} · {panel.coins.length} coins
                      </span>
                    </div>
                    <div className="index-card-columns" style={{ gap: `${COLUMN_GAP_MM}mm` }}>
                      {Array.from({ length: columns }, (_, col) => (
                        <div key={col} className="index-card-column">
                          <CoinTable coins={panel.coins.slice(col * rowsPerColumn, (col + 1) * rowsPerColumn)} rowH={rowH} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
  split,
  panels,
  columns,
  fontPt,
  foldOut,
}: {
  coins: Coin[]
  capacity: number
  split: ReturnType<typeof splitPanels> | null
  panels: Panel[]
  columns: 1 | 2
  fontPt: number
  foldOut: boolean
}) {
  if (coins.length === 0) return <p className="page-hint">No coins in this album yet.</p>
  if (!split) return <p className="error">The card is too small for even one row at {fontPt} pt.</p>
  if (split.overflow > 0) {
    const tries = [columns === 1 && '2 columns', !foldOut && 'fold-out panels', 'a smaller font'].filter(Boolean)
    return (
      <p className="error">
        {split.overflow} of {coins.length} coins don't fit (room for {capacity} per panel). Try{' '}
        {tries.join(', ').replace(/, ([^,]*)$/, ' or $1')}.
      </p>
    )
  }
  return (
    <p className="page-hint">
      Fits — {panels.map((p) => `${p.coins.length} on the ${p.side.toLowerCase()}`).join(', ')} (room for {capacity}{' '}
      per panel).
      {fontPt < 7 && ' Below 7 pt gets hard to read — check a test print.'}
    </p>
  )
}

// Year, Comm., Rarity and Pg/Pkt are short and shrink to fit their content;
// Country and Denomination share whatever width is left — in proportion to
// their longest entry — and are the only columns that get cut off (with …)
// when that isn't enough.
const COLUMNS: { header: string; flex: boolean; value: (c: Coin) => string | number }[] = [
  { header: 'Country', flex: true, value: (c) => c.country },
  { header: 'Denomination', flex: true, value: (c) => c.denomination },
  { header: 'Year', flex: false, value: (c) => c.mint_year ?? '—' },
  { header: 'Comm.', flex: false, value: (c) => (c.commemorative_theme ? 'Yes' : 'No') },
  { header: 'Rarity', flex: false, value: (c) => c.rarity ?? '—' },
  {
    header: 'Pg/Pkt',
    flex: false,
    value: (c) => (c.page_number != null ? `${c.page_number}/${c.pocket_number ?? '—'}` : '—'),
  },
]

function CoinTable({ coins, rowH }: { coins: Coin[]; rowH: number }) {
  const cell = { height: `${rowH}mm`, lineHeight: `${rowH}mm` }
  const longest = COLUMNS.map((col) =>
    col.flex ? Math.max(col.header.length, ...coins.map((c) => String(col.value(c)).length)) : 0,
  )
  const flexTotal = longest.reduce((a, b) => a + b, 0)
  const widthOf = (i: number) => (COLUMNS[i].flex ? `${(longest[i] / flexTotal) * 100}%` : undefined)
  return (
    <table className="index-card-table">
      <thead>
        <tr>
          {COLUMNS.map((col, i) => (
            <th key={col.header} className={col.flex ? 'clip' : 'fit'} style={{ ...cell, width: widthOf(i) }}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {coins.map((c) => (
          <tr key={c.id}>
            {COLUMNS.map((col) => (
              <td key={col.header} className={col.flex ? 'clip' : 'fit'} style={cell}>
                {col.value(c)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
