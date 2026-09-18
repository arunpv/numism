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

export type MintMarkPosition = 'first_digit' | 'last_digit'

// One row per resolution rule (see coin_app_requirements.md §3.7) — a
// (country, mint_mark) pair can resolve to more than one mint depending on
// mint_year (condition_type 'year_range') or the mark's position relative
// to a digit of the year ('position'); a plain, unconditional mapping is
// 'default'. `id` here is the rule's id, `mint_id` the underlying mint
// identity (shared across every rule that resolves to the same mint).
export type Mint = {
  id: number
  country: string
  mint_mark: string
  condition_type: 'default' | 'year_range' | 'position'
  year_min: number | null
  year_max: number | null
  position: MintMarkPosition | null
  mint_id: number
  mint_name: string
  mark_image_path: string | null
  mark_image_url: string | null
}
export type Album = {
  id: number
  name: string
  created_at: string
  num_pages: number | null
  pockets_per_page: number | null
}

export const referenceApi = {
  listMints: () => callFunction<{ data: Mint[] }>('manage-reference', { table: 'mints', action: 'list' }),
  createMint: (
    country: string,
    mint_mark: string,
    mint_name: string,
    condition?: { type: 'year_range'; year_min: number; year_max: number } | { type: 'position'; position: MintMarkPosition },
  ) =>
    callFunction<{ data: Mint }>('manage-reference', {
      table: 'mints',
      action: 'create',
      country,
      mint_mark,
      mint_name,
      condition_type: condition?.type,
      year_min: condition?.type === 'year_range' ? condition.year_min : undefined,
      year_max: condition?.type === 'year_range' ? condition.year_max : undefined,
      position: condition?.type === 'position' ? condition.position : undefined,
    }),
  deleteMint: (ruleId: number) => callFunction<{ ok: true }>('manage-reference', { table: 'mints', action: 'delete', id: ruleId }),

  uploadMintImage: (mintId: number, image: Blob | null) => {
    const form = new FormData()
    form.set('mintId', String(mintId))
    if (image) form.set('image', image, 'mark.jpg')
    return postRaw<{ mark_image_url: string | null }>('upload-mint-image', form)
  },

  listAlbums: () => callFunction<{ data: Album[] }>('manage-reference', { table: 'albums', action: 'list' }),
  createAlbum: (name: string, num_pages: number | null, pockets_per_page: number | null) =>
    callFunction<{ data: Album }>('manage-reference', {
      table: 'albums',
      action: 'create',
      name,
      num_pages,
      pockets_per_page,
    }),
  updateAlbumLayout: (id: number, num_pages: number | null, pockets_per_page: number | null) =>
    callFunction<{ data: Album }>('manage-reference', {
      table: 'albums',
      action: 'update',
      id,
      num_pages,
      pockets_per_page,
    }),
  deleteAlbum: (id: number) => callFunction<{ ok: true }>('manage-reference', { table: 'albums', action: 'delete', id }),
}

export type CoinFields = {
  country: string
  denomination: string
  mint_year: number | null
  mint_mark: string | null
  mint_mark_position: MintMarkPosition | null
  commemorative_theme: string | null
  period: string | null
  value: number | null
  currency: string | null
  composition: string | null
  weight_grams: number | null
  diameter_mm: number | null
  thickness_mm: number | null
  shape: string | null
  orientation: string | null
  demonetized: boolean
  rarity: string | null
  estimated_value_low: number | null
  estimated_value_high: number | null
  grade: string | null
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
  album_id: number | null
  page_number: number | null
  pocket_number: number | null
  thumbnail_url: string | null
}

export type Coin = CoinFields & {
  id: number
  personal_notes: string | null
  image_quality_score: number | null
  album_id: number | null
  page_number: number | null
  pocket_number: number | null
  created_at: string
  thumbnail_url: string | null
  mints: { mint_name: string } | null
  albums: { name: string } | null
}

export type CoinDetail = Coin & { image_path: string; image_path_back: string | null; back_thumbnail_url: string | null }

export type CoinEditFields = CoinFields & {
  personal_notes: string | null
  album_id: number | null
  page_number: number | null
  pocket_number: number | null
}

export const coinApi = {
  listCoins: () => callFunction<{ data: Coin[] }>('list-coins', {}),

  getCoin: (id: number) => callFunction<{ data: CoinDetail }>('get-coin', { id }),

  updateCoin: (id: number, fields: CoinEditFields) =>
    callFunction<{ data: CoinDetail }>('update-coin', { id, ...fields }),

  extractCoin: (front: Blob, back: Blob) => {
    const form = new FormData()
    const ext = front.type.includes('png') ? 'png' : 'jpg'
    form.set('front', front, `front.${ext}`)
    form.set('back', back, `back.${ext}`)
    return postRaw<ExtractResult>('extract-coin', form)
  },

  checkDuplicate: (fields: CoinFields) => callFunction<{ matches: DuplicateMatch[] }>('check-duplicate', fields),

  resolveMint: (country: string, mint_mark: string | null, mint_year: number | null, mint_mark_position: MintMarkPosition | null) =>
    callFunction<{ mint_id: number | null; mint_name: string | null; mark_image_url: string | null }>('resolve-mint', {
      country,
      mint_mark,
      mint_year,
      mint_mark_position,
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
    if (fields.mint_mark_position) form.set('mint_mark_position', fields.mint_mark_position)
    if (fields.commemorative_theme) form.set('commemorative_theme', fields.commemorative_theme)
    if (personal_notes) form.set('personal_notes', personal_notes)
    if (image_quality_score != null) form.set('image_quality_score', String(image_quality_score))
    if (fields.period) form.set('period', fields.period)
    if (fields.value != null) form.set('value', String(fields.value))
    if (fields.currency) form.set('currency', fields.currency)
    if (fields.composition) form.set('composition', fields.composition)
    if (fields.weight_grams != null) form.set('weight_grams', String(fields.weight_grams))
    if (fields.diameter_mm != null) form.set('diameter_mm', String(fields.diameter_mm))
    if (fields.thickness_mm != null) form.set('thickness_mm', String(fields.thickness_mm))
    if (fields.shape) form.set('shape', fields.shape)
    if (fields.orientation) form.set('orientation', fields.orientation)
    form.set('demonetized', String(fields.demonetized))
    if (fields.rarity) form.set('rarity', fields.rarity)
    if (fields.estimated_value_low != null) form.set('estimated_value_low', String(fields.estimated_value_low))
    if (fields.estimated_value_high != null) form.set('estimated_value_high', String(fields.estimated_value_high))
    if (fields.grade) form.set('grade', fields.grade)
    const ext = front.type.includes('png') ? 'png' : 'jpg'
    form.set('image', front, `front.${ext}`)
    form.set('image_back', back, `back.${ext}`)
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
      const ext = front.type.includes('png') ? 'png' : 'jpg'
      form.set('image', front, `front.${ext}`)
      form.set('image_back', back, `back.${ext}`)
      if (new_quality_score != null) form.set('new_quality_score', String(new_quality_score))
    }
    return postRaw<{ id: number }>('save-duplicate', form)
  },
}
