/**
 * Pixel da Meta, só com o aceite da pessoa (LGPD, art. 7º, I).
 *
 * Desligado enquanto não houver VITE_META_PIXEL_ID nas variáveis da Vercel: sem o ID,
 * nada carrega e o aviso de cookies nem aparece. Com o ID, o aviso aparece uma vez;
 * o script da Meta só é baixado depois de "Aceitar". "Recusar" vale igual e pode ser
 * mudado em "Cookies" no rodapé.
 *
 * Eventos: PageView (cada página), CompleteRegistration (conta criada), StartTrial
 * (conta criada já no teste grátis) e Subscribe (assinatura confirmada). Nenhum dado
 * pessoal é mandado nos eventos (nada de e-mail, nome ou telefone).
 */

const KEY = 'cookie-consent'
const VERSION = 1
const listeners = new Set()

export const PIXEL_ID = String(import.meta.env.VITE_META_PIXEL_ID || '').trim()
export const pixelConfigured = /^\d{5,20}$/.test(PIXEL_ID)

/** 'granted' | 'denied' | null (ainda não escolheu) */
export function getConsent() {
    if (!pixelConfigured) return 'denied'
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
        if (saved && saved.v === VERSION && (saved.ads === true || saved.ads === false)) return saved.ads ? 'granted' : 'denied'
    } catch { /* sem localStorage ou valor estragado */ }
    return null
}

export function setConsent(granted) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ads: !!granted, at: new Date().toISOString() })) } catch { /* sem localStorage */ }
    if (granted) loadPixel()
    else if (window.fbq) window.fbq('consent', 'revoke')
    listeners.forEach(fn => fn(granted ? 'granted' : 'denied'))
}

/** Pede para o aviso de cookies abrir de novo (link "Cookies" do rodapé) */
export function reopenConsent() {
    listeners.forEach(fn => fn(null))
}
export function onConsentChange(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
}

let loaded = false
function loadPixel() {
    if (!pixelConfigured || typeof window === 'undefined') return
    if (loaded) { window.fbq?.('consent', 'grant'); return }
    loaded = true
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []
        t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
    /* eslint-enable */
    window.fbq('consent', 'grant')
    window.fbq('init', PIXEL_ID)
}

/** Começa o Pixel se a pessoa já aceitou numa visita anterior */
export function startPixelIfAllowed() {
    if (getConsent() === 'granted') loadPixel()
}

/** Evento padrão da Meta; não faz nada sem o aceite */
export function track(event, params) {
    if (getConsent() !== 'granted') return
    loadPixel()
    try { params ? window.fbq('track', event, params) : window.fbq('track', event) } catch { /* bloqueador de anúncios */ }
}
