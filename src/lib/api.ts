import { functionUrl, FUNCTION_HEADERS } from './supabase'

async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const res = await fetch(functionUrl(name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...FUNCTION_HEADERS },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `${name} failed (${res.status})`)
  return json
}

async function postRaw<T>(name: string, body: BodyInit, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetch(functionUrl(name), {
    method: 'POST',
    headers: { ...FUNCTION_HEADERS, ...extraHeaders },
    body,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `${name} failed (${res.status})`)
  return json
}

export type Mint = {
  id: number
  country: string
  mint_mark: string
  mint_name: string
  created_at: string
  mark_image_path: string | null
  mark_image_url: string | null
}
export type Album = { id: number; name: string; created_at: string }

export const referenceApi = {
  listMints: () => callFunction<{ data: Mint[] }>('manage-reference', { table: 'mints', action: 'list' }),
  createMint: (country: string, mint_mark: string, mint_name: string) =>
    callFunction<{ data: Mint }>('manage-reference', { table: 'mints', action: 'create', country, mint_mark, mint_name }),
  deleteMint: (id: number) => callFunction<{ ok: true }>('manage-reference', { table: 'mints', action: 'delete', id }),

  uploadMintImage: (mintId: number, image: Blob | null) => {
    const form = new FormData()
    form.set('mintId', String(mintId))
    if (image) form.set('image', image, 'mark.jpg')
    return postRaw<{ mark_image_url: string | null }>('upload-mint-image', form)
  },

  listAlbums: () => callFunction<{ data: Album[] }>('manage-reference', { table: 'albums', action: 'list' }),
  createAlbum: (name: string) => callFunction<{ data: Album }>('manage-reference', { table: 'albums', action: 'create', name }),
  deleteAlbum: (id: number) => callFunction<{ ok: true }>('manage-reference', { table: 'albums', action: 'delete', id }),
}

export type CoinFields = {
  country: string
  denomination: string
  mint_year: number | null
  mint_mark: string | null
  commemorative_theme: string | null
}

export type ExtractResult = {
  fields: CoinFields
  image_quality_score: number | null
  mint_id: number | null
  mint_name: string | null
  mark_image_url: string | null
}

export type DuplicateMatch = {
  id: number
  image_path: string
  image_quality_score: number | null
  personal_notes: string | null
  quantity: number
  album_id: number | null
  page_number: number | null
  pocket_number: number | null
  thumbnail_url: string | null
}

export const coinApi = {
  extractCoin: (front: Blob, back: Blob) => {
    const form = new FormData()
    form.set('front', front, 'front.jpg')
    form.set('back', back, 'back.jpg')
    return postRaw<ExtractResult>('extract-coin', form)
  },

  checkDuplicate: (fields: CoinFields) => callFunction<{ matches: DuplicateMatch[] }>('check-duplicate', fields),

  resolveMint: (country: string, mint_mark: string | null) =>
    callFunction<{ mint_id: number | null; mint_name: string | null; mark_image_url: string | null }>('resolve-mint', {
      country,
      mint_mark,
    }),

  saveCoin: (
    fields: CoinFields,
    personal_notes: string,
    image_quality_score: number | null,
    front: Blob,
    back: Blob,
  ) => {
    const form = new FormData()
    form.set('country', fields.country)
    form.set('denomination', fields.denomination)
    if (fields.mint_year != null) form.set('mint_year', String(fields.mint_year))
    if (fields.mint_mark) form.set('mint_mark', fields.mint_mark)
    if (fields.commemorative_theme) form.set('commemorative_theme', fields.commemorative_theme)
    if (personal_notes) form.set('personal_notes', personal_notes)
    if (image_quality_score != null) form.set('image_quality_score', String(image_quality_score))
    form.set('image', front, 'front.jpg')
    form.set('image_back', back, 'back.jpg')
    return postRaw<{ id: number }>('save-coin', form)
  },

  saveDuplicate: (
    matchedId: number,
    replaceImage: boolean,
    personal_notes: string,
    front: Blob | null,
    back: Blob | null,
    new_quality_score: number | null,
  ) => {
    const form = new FormData()
    form.set('matchedId', String(matchedId))
    form.set('replaceImage', String(replaceImage))
    if (personal_notes) form.set('personal_notes', personal_notes)
    if (replaceImage && front && back) {
      form.set('image', front, 'front.jpg')
      form.set('image_back', back, 'back.jpg')
      if (new_quality_score != null) form.set('new_quality_score', String(new_quality_score))
    }
    return postRaw<{ id: number; quantity: number }>('save-duplicate', form)
  },
}
