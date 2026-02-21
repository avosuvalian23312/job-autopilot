import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { installAppTokenFetchInterceptor } from "@/lib/appSession";
installAppTokenFetchInterceptor();
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
