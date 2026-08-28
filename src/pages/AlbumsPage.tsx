import { useEffect, useState } from 'react'
import { referenceApi, type Album } from '../lib/api'

export function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

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
      await referenceApi.createAlbum(name)
      setName('')
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

  return (
    <div className="page">
      <h1>Albums</h1>
      <p className="page-hint">
        Album layouts (pages/pockets) aren't tracked yet — just a name for now. Placement of individual coins comes
        later once the capture/edit flow exists.
      </p>

      <form className="add-form" onSubmit={handleAdd}>
        <input placeholder="Album name" value={name} onChange={(e) => setName(e.target.value)} required />
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
            <li key={a.id}>
              <span>{a.name}</span>
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
