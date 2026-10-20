import { useEffect, useState } from 'react'
import { referenceApi, type Album } from '../lib/api'
import { IndexCard } from '../components/IndexCard'

export function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [numPages, setNumPages] = useState('')
  const [pocketsPerPage, setPocketsPerPage] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editNumPages, setEditNumPages] = useState('')
  const [editPocketsPerPage, setEditPocketsPerPage] = useState('')
  const [editCardWidth, setEditCardWidth] = useState('')
  const [editCardHeight, setEditCardHeight] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [cardAlbumId, setCardAlbumId] = useState<number | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data } = await referenceApi.listAlbums()
      setAlbums(data)
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
      await referenceApi.createAlbum(name, numPages ? Number(numPages) : null, pocketsPerPage ? Number(pocketsPerPage) : null)
      setName('')
      setNumPages('')
      setPocketsPerPage('')
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
      await referenceApi.deleteAlbum(id)
      setAlbums((prev) => prev.filter((a) => a.id !== id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function startEdit(a: Album) {
    setEditingId(a.id)
    setEditNumPages(a.num_pages != null ? String(a.num_pages) : '')
    setEditPocketsPerPage(a.pockets_per_page != null ? String(a.pockets_per_page) : '')
    setEditCardWidth(a.card_width_mm != null ? String(a.card_width_mm) : '')
    setEditCardHeight(a.card_height_mm != null ? String(a.card_height_mm) : '')
  }

  async function handleSaveEdit(id: number) {
    setSavingEdit(true)
    setError(null)
    try {
      await referenceApi.updateAlbum(id, {
        num_pages: editNumPages ? Number(editNumPages) : null,
        pockets_per_page: editPocketsPerPage ? Number(editPocketsPerPage) : null,
        card_width_mm: editCardWidth ? Number(editCardWidth) : null,
        card_height_mm: editCardHeight ? Number(editCardHeight) : null,
      })
      setEditingId(null)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSavingEdit(false)
    }
  }

  const cardAlbum = albums.find((a) => a.id === cardAlbumId) ?? null
  if (cardAlbum) return <IndexCard album={cardAlbum} onBack={() => setCardAlbumId(null)} />

  return (
    <div className="page">
      <h1>Albums</h1>
      <p className="page-hint">
        Layout (pages × pockets per page) is optional — leave blank if you don't have specs yet. Once both are set
        for an album, placing a coin outside that range or in an already-occupied pocket is rejected. Card size is the
        index card stuck inside each cover — measure the inside cover and leave a few mm spare on each side.
      </p>

      <form className="add-form" onSubmit={handleAdd}>
        <input placeholder="Album name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input
          type="number"
          placeholder="Pages"
          value={numPages}
          onChange={(e) => setNumPages(e.target.value)}
          min={1}
        />
        <input
          type="number"
          placeholder="Pockets per page"
          value={pocketsPerPage}
          onChange={(e) => setPocketsPerPage(e.target.value)}
          min={1}
        />
        <button type="submit" disabled={saving}>
          {saving ? 'Adding…' : 'Add album'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : albums.length === 0 ? (
        <p className="page-hint">No albums yet.</p>
      ) : (
        <ul className="list">
          {albums.map((a) => (
            <li key={a.id} className="album-row">
              <div className="album-row-main">
                <span>{a.name}</span>
                <span className="page-hint">
                  {a.num_pages != null && a.pockets_per_page != null
                    ? `${a.num_pages} pages × ${a.pockets_per_page} pockets`
                    : 'Layout not set'}
                  {' · '}
                  {a.card_width_mm != null && a.card_height_mm != null
                    ? `Card ${a.card_width_mm} × ${a.card_height_mm} mm`
                    : 'Card size not set'}
                </span>
              </div>

              {editingId === a.id ? (
                <div className="album-edit-inline">
                  <input
                    type="number"
                    placeholder="Pages"
                    value={editNumPages}
                    onChange={(e) => setEditNumPages(e.target.value)}
                    min={1}
                  />
                  <input
                    type="number"
                    placeholder="Pockets per page"
                    value={editPocketsPerPage}
                    onChange={(e) => setEditPocketsPerPage(e.target.value)}
                    min={1}
                  />
                  <input
                    type="number"
                    placeholder="Card W mm"
                    value={editCardWidth}
                    onChange={(e) => setEditCardWidth(e.target.value)}
                    min={1}
                    step={0.5}
                  />
                  <input
                    type="number"
                    placeholder="Card H mm"
                    value={editCardHeight}
                    onChange={(e) => setEditCardHeight(e.target.value)}
                    min={1}
                    step={0.5}
                  />
                  <button type="button" onClick={() => handleSaveEdit(a.id)} disabled={savingEdit}>
                    {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="mint-image-btn" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" className="mint-image-btn" onClick={() => startEdit(a)}>
                    Edit
                  </button>
                  <button type="button" className="mint-image-btn" onClick={() => setCardAlbumId(a.id)}>
                    Index card
                  </button>
                </>
              )}

              <button type="button" className="delete-btn" onClick={() => handleDelete(a.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
