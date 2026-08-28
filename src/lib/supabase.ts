import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

// Edge Functions (coin_app_requirements.md §5) are called directly via fetch,
// not through supabase.functions.invoke, since several take raw image bytes
// or multipart form data rather than JSON.
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

export function functionUrl(name: string) {
  return `${FUNCTIONS_URL}/${name}`
}

export const FUNCTION_HEADERS = {
  apiKey: SUPABASE_PUBLISHABLE_KEY,
}
