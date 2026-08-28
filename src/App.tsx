import { useState } from 'react'
import { CapturePage } from './pages/CapturePage'
import { CoinsPage } from './pages/CoinsPage'
import { MintsPage } from './pages/MintsPage'
import { AlbumsPage } from './pages/AlbumsPage'
import './App.css'

type Tab = 'capture' | 'coins' | 'mints' | 'albums'

function App() {
  const [tab, setTab] = useState<Tab>('capture')

  return (
    <div className="app-shell">
      <nav className="tab-nav">
        <button type="button" className={tab === 'capture' ? 'active' : ''} onClick={() => setTab('capture')}>
          Capture
        </button>
        <button type="button" className={tab === 'coins' ? 'active' : ''} onClick={() => setTab('coins')}>
          Coins
        </button>
        <button type="button" className={tab === 'mints' ? 'active' : ''} onClick={() => setTab('mints')}>
          Mints
        </button>
        <button type="button" className={tab === 'albums' ? 'active' : ''} onClick={() => setTab('albums')}>
          Albums
        </button>
      </nav>
      <main>
        {tab === 'capture' && <CapturePage />}
        {tab === 'coins' && <CoinsPage />}
        {tab === 'mints' && <MintsPage />}
        {tab === 'albums' && <AlbumsPage />}
      </main>
    </div>
  )
}

export default App
