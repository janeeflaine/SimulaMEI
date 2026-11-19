import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Cookie } from 'lucide-react'
import { getConsent, setConsent, onConsentChange, pixelConfigured, startPixelIfAllowed, track } from '../utils/metaPixel'
import './CookieConsent.css'

/**
 * Aviso de cookies de anúncio (Pixel da Meta) e contagem das páginas vistas.
 * Só existe com VITE_META_PIXEL_ID configurado (utils/metaPixel.js).
 * Aceitar e Recusar têm o mesmo peso; nada da Meta carrega antes do Aceitar.
 */
export default function CookieConsent() {
    const location = useLocation()
    const [choice, setChoice] = useState(() => getConsent())
    const admin = location.pathname.startsWith('/admin')

    useEffect(() => {
        if (!pixelConfigured) return
        startPixelIfAllowed()
        return onConsentChange(setChoice)
    }, [])

    // Uma visualização por página, só com o aceite
    useEffect(() => {
        if (!pixelConfigured || admin || choice !== 'granted') return
        track('PageView')
    }, [location.pathname, choice, admin])

    if (!pixelConfigured || admin || choice) return null

    return (
        <section className="ckc" role="region" aria-label="Aviso de cookies">
            <div className="ckc__box">
                <Cookie size={22} aria-hidden="true" className="ckc__icon" />
                <p className="ckc__text">
                    Com o seu aceite, usamos cookies da Meta (Facebook e Instagram) para medir os nossos anúncios.
                    O site funciona igual se você recusar.{' '}
                    <Link to="/politica-de-privacidade#cookies">Saiba mais</Link>
                </p>
                <div className="ckc__actions">
                    <button type="button" className="ckc__btn" onClick={() => setConsent(false)}>Recusar</button>
                    <button type="button" className="ckc__btn" onClick={() => setConsent(true)}>Aceitar</button>
                </div>
            </div>
        </section>
    )
}
