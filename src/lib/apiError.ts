// Error thrown for a failed Edge Function call. Dependency-free so the
// service worker (src/sw.ts) can import it too. When the function returns a
// `retry_at` (Gemini rate limits — see extract-coin), the message gets a
// short "when to retry" suffix in the user's local time.
export class ApiError extends Error {
  status: number
  retryAt: string | null

  constructor(message: string, status: number, retryAt: string | null = null) {
    super(retryAt ? `${message} ${retryHint(new Date(retryAt))}` : message)
    this.status = status
    this.retryAt = retryAt
  }

  get isRateLimit() {
    return this.status === 429
  }
}

function retryHint(at: Date): string {
  const seconds = Math.max(1, Math.round((at.getTime() - Date.now()) / 1000))
  if (seconds < 120) return `Try again in ${seconds}s.`
  const sameDay = at.toDateString() === new Date().toDateString()
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `Resets ${sameDay ? 'at' : at.toLocaleDateString([], { weekday: 'short' }) + ','} ${time}.`
}
