import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import './index.css'
import App from './App.tsx'

// Handle OAuth callback
if (window.location.pathname === '/auth/callback') {
  // The OAuth callback is handled automatically by Supabase
  // Just redirect back to the main app
  window.location.href = '/'
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#1890ff',
            borderRadius: 6,
          },
        }}
      >
        <App />
      </ConfigProvider>
    </StrictMode>,
  )
}
