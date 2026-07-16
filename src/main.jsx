import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './state/AuthProvider.jsx'
import { DataSyncProvider } from './state/DataSyncProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DataSyncProvider>
          <App />
        </DataSyncProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
