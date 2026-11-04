import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import IntranetPortal from './components/Portals/IntranetPortal.jsx'
import ExtranetPortal from './components/Portals/ExtranetPortal.jsx'

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/" element={<App />} />
      <Route path="/intranet" element={<IntranetPortal />} />
      <Route path="/extranet" element={<ExtranetPortal />} />
      <Route path="*" element={<App />} />
    </>
  )
)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
