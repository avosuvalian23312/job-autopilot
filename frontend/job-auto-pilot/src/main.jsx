import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { AuthProvider } from "@/hooks/useAuth";
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
