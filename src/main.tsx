import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { batchQueue, registerBatchSync } from './lib/batchQueue'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Background Sync only fires once per registration, and a run that stops at
// a Gemini rate limit completes normally — so without this, coins left
// pending would wait for the next capture or Retry. Registering on every
// launch that has anything pending lets a launch after the quota reset pick
// them up.
batchQueue
  .listByStatus('pending')
  .then((pending) => {
    if (pending.length > 0) registerBatchSync()
  })
  .catch(() => {})
