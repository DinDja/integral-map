import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[App] Service Worker registrado:', registration.scope);
        setInterval(() => {
          registration.update();
        }, 30 * 60 * 1000);
      })
      .catch((err) => {
        console.warn('[App] Erro ao registrar Service Worker:', err);
      });
  });
}

