import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#0A0A0C',
          border: '1px solid #1a1a1a',
          color: '#fff',
          fontFamily: "'Space Mono', monospace",
          fontSize: '12px',
        },
      }}
    />
  </BrowserRouter>
)
