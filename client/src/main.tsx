import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import OnlineApp from './OnlineApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OnlineApp />
  </StrictMode>,
)
