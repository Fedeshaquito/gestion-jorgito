import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { ToastProvider } from './components/ui.jsx'
import { iniciarSync } from './lib/sync'

iniciarSync()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
)

// Pide al navegador que no borre los datos guardados
if (navigator.storage?.persist) navigator.storage.persist()
