import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
// Fonte Inter servida pelo próprio site (sem Google Fonts: o IP de quem visita não vai para terceiros)
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './styles/main.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
