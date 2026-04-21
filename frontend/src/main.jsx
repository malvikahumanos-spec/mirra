import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'

// Remove loading screen
const loadingScreen = document.getElementById('loading-screen')
if (loadingScreen) {
  loadingScreen.classList.add('fade-out')
  setTimeout(() => loadingScreen.remove(), 500)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
