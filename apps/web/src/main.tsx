import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import OffrePage from './pages/OffrePage'
import ExpiredPage from './pages/ExpiredPage'
import PremiumPage from './pages/PremiumPage'
import SubscribePage from './pages/SubscribePage'
import SubscribeCountriesPage from './pages/SubscribeCountriesPage'
import SubscribeSuccessPage from './pages/SubscribeSuccessPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/offre/:jobId" element={<OffrePage />} />
        <Route path="/premium" element={<PremiumPage />} />
        <Route path="/subscribe" element={<SubscribePage />} />
        <Route path="/subscribe/countries" element={<SubscribeCountriesPage />} />
        <Route path="/subscribe/success" element={<SubscribeSuccessPage />} />
        <Route path="/expired" element={<ExpiredPage />} />
        <Route path="*" element={<ExpiredPage />} />
      </Routes>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
